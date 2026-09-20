"use client";

import { useCallback, useState } from "react";

import type { IncidentCardControls, JournalEntry } from "@/widgets/incident-card";
import type { PublicUser } from "@/shared/api";
import { formatDateTime, systemClock } from "@/shared/lib";
import type { Clock, KeyValueStorage } from "@/shared/lib";
import { ROUTES } from "@/shared/config";

import { getServiceNames } from "../lib/cardView";
import { toMoscowIso } from "../lib/time";
import type { IncidentData } from "./loadIncident";
import { useAmendMode } from "./useAmendMode";
import type { useCardSession } from "./useCardSession";
import { useDispatcherInput } from "./useDispatcherInput";
import { useWorkLinesControl } from "./useWorkLinesControl";

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
 * Живой режим виджета карточки (IncidentCardControls): «Действие диспетчера», дополнение, отработки, флаги ЧС/ЧП.
 * Разрешения сценария: учебные карточки уровня beginner — без редактирования флагов и отработок
 * (в модели Scenario отдельного флага нет — решение исполнителя), фикстуры вне сценария — разрешено.
 */
export function useCardControls(options: UseCardControlsOptions): IncidentCardControls {
  const { data, student, session, isLocked, clock = systemClock } = options;
  const { card, attempt, scenario, reference } = data;
  const now = useCallback(() => toMoscowIso(clock.now()), [clock]);
  const canEdit = scenario?.level !== "beginner";
  const [journalExtra, setJournalExtra] = useState<JournalEntry[]>([]);
  const [emergency, setEmergency] = useState(card.emergency);
  const operator = `оп. ${student.armNumber}`;
  const { dispatch, pendingCount } = session.outbox;

  const dispatcher = useDispatcherInput({
    cardId: card.id,
    studentId: student.id,
    attemptId: attempt.attempt.id,
    enteredText: attempt.attempt.enteredText,
    storage: options.storage,
    isOnline: session.isOnline,
    pendingCount,
    dispatch,
    callHref: ROUTES.armPhoneForCard(card.id),
  });
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
  const serviceNames = getServiceNames(card.notificationList, reference.services);
  const workLines = useWorkLinesControl({
    cardId: card.id,
    initial: session.runtime.workLines,
    canAdd: canEdit,
    operator,
    serviceNames,
    internalNumbers: reference.internalNumbers,
    dispatch,
    now,
  });

  return {
    isLocked,
    isReactionExceeded: options.isReactionExceeded,
    dispatcher,
    amend,
    workLines,
    flags: {
      canEdit,
      emergency,
      onToggle: (flag) => setEmergency((previous) => ({ ...previous, [flag]: !previous[flag] })),
    },
    journalExtra,
    showSmsPolygon: Boolean(card.smsList?.length),
  };
}
