"use client";

import { useCallback, useState } from "react";

import type { IncidentCardControls, JournalEntry } from "@/widgets/incident-card";
import type { PublicUser } from "@/shared/api";
import { formatDateTime, systemClock } from "@/shared/lib";
import type { Clock, KeyValueStorage } from "@/shared/lib";
import { toMoscowIso } from "../lib/time";
import type { IncidentData } from "./loadIncident";
import { useAmendMode } from "./useAmendMode";
import type { useCardSession } from "./useCardSession";

type UseCardControlsOptions = {
  data: IncidentData;
  student: PublicUser;
  session: ReturnType<typeof useCardSession>;
  isLocked: boolean;
  isReactionExceeded: boolean;
  amendLockSeconds: number;
  storage: KeyValueStorage;
  clock?: Clock;
};

const AMEND_TEXT_FIELD = "amendment";

/**
 * Живой режим виджета карточки (IncidentCardControls): дополнение, флаги ЧС/ЧП. «Действия диспетчера» и отработок в
 * карточке ДДС нет (спека 012, памятка стр. 23): текст и номер наряда — в форме статуса.
 * Разрешения сценария: учебные карточки уровня beginner — без редактирования флагов
 * (в модели Scenario отдельного флага нет — решение исполнителя), фикстуры вне сценария — разрешено.
 */
export function useCardControls(options: UseCardControlsOptions): IncidentCardControls {
  const { data, student, session, isLocked, clock = systemClock } = options;
  const { card, attempt, scenario } = data;
  const now = useCallback(() => toMoscowIso(clock.now()), [clock]);
  const canEdit = scenario?.level !== "beginner";
  const [journalExtra, setJournalExtra] = useState<JournalEntry[]>([]);
  const [emergency, setEmergency] = useState(card.emergency);
  const { dispatch } = session.outbox;
  const amend = useAmendMode({
    lockSeconds: options.amendLockSeconds,
    initialDescription: card.smsList?.join("\n") ?? "",
    onSave: (text) => {
      setJournalExtra((previous) => [
        ...previous,
        { at: formatDateTime(now()), author: `Опер. ${student.armNumber}`, text },
      ]);
      const request = { enteredText: { [AMEND_TEXT_FIELD]: text } };
      void dispatch({ id: `amend-${now()}`, kind: "progress", attemptId: attempt.attempt.id, request }).catch(
        () => undefined,
      );
    },
    clock,
  });

  return {
    isLocked,
    isReactionExceeded: options.isReactionExceeded,
    amend,
    flags: {
      canEdit,
      emergency,
      onToggle: (flag) => setEmergency((previous) => ({ ...previous, [flag]: !previous[flag] })),
    },
    journalExtra,
    showSmsPolygon: Boolean(card.smsList?.length),
  };
}
