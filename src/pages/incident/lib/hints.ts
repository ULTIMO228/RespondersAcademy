import type { ScenarioHints } from "@/shared/api";

/**
 * Шаг подсказки новичку (T2.3-13, Q&A в4) по факту действий: открытие карточки → первый статус («Принята»)
 * → дальнейшие статусы/звонок. Тексты — только из Scenario.hints.texts, последний шаг держится до конца.
 */
export function getHintText(hints: ScenarioHints | undefined, progress: { statuses: number; calls: number }) {
  if (!hints?.enabled || hints.texts.length === 0) return null;
  const step = Math.min(progress.statuses + progress.calls, hints.texts.length - 1);
  return { step, total: hints.texts.length, text: hints.texts[step] };
}
