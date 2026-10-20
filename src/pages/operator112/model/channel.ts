/*
 * Канал поступления обращения попытки 112 (спека 009, FR-010, US6): звонок или СМС. В контракте OperatorAttempt канала пока нет,
 * поэтому он читается из снимка билета (`cardSnapshot.channel` / `cardSnapshot.smsText`, T009); без него — обычный звонок.
 */
import type { CardChannel, OperatorAttempt } from "@/shared/api";

export function attemptChannel(attempt: OperatorAttempt): CardChannel {
  return attempt.cardSnapshot?.channel === "sms" ? "sms" : "call";
}

/** Текст СМС-обращения для «Истории сообщений»; у звонка пусто. */
export function attemptSmsText(attempt: OperatorAttempt): string {
  const text = attempt.cardSnapshot?.smsText;
  return typeof text === "string" ? text : "";
}
