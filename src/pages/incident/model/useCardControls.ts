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
// Флаги карточки лежат в enteredText отдельными ключами с префиксом «flag.»; оценщик (backend/ml/assess/types.py)
// такие ключи в текстовую оценку не берёт.
const FLAG_EMERGENCY = "flag.emergency";
const CASUALTY_FIELDS = {
  injured: "flag.victims",
  ambulanceRefused: "flag.ambulanceRefused",
  blocked: "flag.blocked",
} as const;

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
  // Сервер хранит дополнения одним полем enteredText.amendment (слияние по ключу): после перезагрузки они
  // восстанавливаются в журнал, а каждое новое сохранение отправляет все дополнения попытки, не только последнее.
  const savedAmendment = attempt.attempt.enteredText?.[AMEND_TEXT_FIELD] ?? "";
  const [journalExtra, setJournalExtra] = useState<JournalEntry[]>(() =>
    savedAmendment
      .split("\n")
      .filter((line) => line.trim())
      .map((text) => ({ author: `Опер. ${student.armNumber}`, text })),
  );
  const [amendments, setAmendments] = useState<string>(savedAmendment);
  const saved = attempt.attempt.enteredText ?? {};
  const [emergency, setEmergency] = useState(() => {
    const raw = saved[FLAG_EMERGENCY];
    if (raw === undefined) return card.emergency;
    const parts = raw.split(",");
    return { chs: parts.includes("чс"), chp: parts.includes("чп") };
  });
  const [casualties, setCasualties] = useState(() => {
    const read = (key: keyof typeof CASUALTY_FIELDS) =>
      saved[CASUALTY_FIELDS[key]] === undefined
        ? card.what.casualties[key]
        : saved[CASUALTY_FIELDS[key]] === "да";
    return { injured: read("injured"), ambulanceRefused: read("ambulanceRefused"), blocked: read("blocked") };
  });
  const { dispatch } = session.outbox;
  const amend = useAmendMode({
    lockSeconds: options.amendLockSeconds,
    initialDescription: card.smsList?.join("\n") ?? "",
    onSave: (text) => {
      setJournalExtra((previous) => [
        ...previous,
        { at: formatDateTime(now()), author: `Опер. ${student.armNumber}`, text },
      ]);
      const allAmendments = amendments ? `${amendments}\n${text}` : text;
      setAmendments(allAmendments);
      const request = { enteredText: { [AMEND_TEXT_FIELD]: allAmendments } };
      void dispatch({ id: `amend-${now()}`, kind: "progress", attemptId: attempt.attempt.id, request }).catch(
        () => undefined,
      );
    },
    clock,
  });

  const saveFlags = (enteredText: Record<string, string>) => {
    void dispatch({
      id: `flag-${now()}`,
      kind: "progress",
      attemptId: attempt.attempt.id,
      request: { enteredText },
    }).catch(() => undefined);
  };

  return {
    isLocked,
    isReactionExceeded: options.isReactionExceeded,
    amend,
    flags: {
      canEdit,
      emergency,
      onToggle: (flag) => {
        const next = { ...emergency, [flag]: !emergency[flag] };
        setEmergency(next);
        saveFlags({
          [FLAG_EMERGENCY]: [next.chs ? "чс" : "", next.chp ? "чп" : ""].filter(Boolean).join(",") || "нет",
        });
      },
      casualties,
      onToggleCasualty: (key) => {
        const next = { ...casualties, [key]: !casualties[key] };
        setCasualties(next);
        saveFlags({ [CASUALTY_FIELDS[key]]: next[key] ? "да" : "нет" });
      },
    },
    journalExtra,
    showSmsPolygon: Boolean(card.smsList?.length),
  };
}
