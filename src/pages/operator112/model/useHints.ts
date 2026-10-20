"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { isHintDue, pickHintStep } from "@/entities/operator112-attempt";
import type { HintProgress } from "@/entities/operator112-attempt";
import type { OperatorAttempt, OperatorEventRequest } from "@/shared/api";

const NO_PROGRESS: HintProgress = {
  answered: false,
  applicant: false,
  address: false,
  description: false,
  poll: false,
  signs: false,
  notification: false,
};

/**
 * Подсказка тренировки («делай как я»): после idleSec без действий показывается первый невыполненный шаг, сервер получает
 * hintShown. Прогресс сообщает карточка (report), любое действие в ней сбрасывает простой. Показывается в полосе тренажёра.
 */
export function useHints(
  attempt: OperatorAttempt,
  nowMs: number,
  sendEvent: (event: OperatorEventRequest) => Promise<unknown>,
) {
  const lastActivity = useRef(Date.now());
  const shown = useRef<string | null>(null);
  const progress = useRef<HintProgress>(NO_PROGRESS);
  const [hintText, setHintText] = useState<string | null>(null);

  const touch = useCallback(() => {
    lastActivity.current = Date.now();
    shown.current = null;
    setHintText(null);
  }, []);

  /** Карточка сообщила прогресс (или изменилась): это действие обучающегося. */
  const report = useCallback(
    (next: HintProgress) => {
      progress.current = next;
      touch();
    },
    [touch],
  );

  // Смена состояния попытки (ответ на вызов) — тоже действие.
  useEffect(() => touch(), [attempt.state, touch]);

  useEffect(() => {
    if (!attempt.hints || !isHintDue(attempt, lastActivity.current, nowMs)) return;
    const step = pickHintStep(attempt.hints.steps, {
      ...progress.current,
      answered: attempt.state !== "ringing",
    });
    if (!step || shown.current === step.stage) return;
    shown.current = step.stage;
    setHintText(step.text);
    void sendEvent({ type: "hintShown", payload: { stage: step.stage } }).catch(() => undefined);
    // Подсказка привязана к таймеру простоя; прогресс сбрасывает активность через report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowMs]);

  return { hintText, report };
}
