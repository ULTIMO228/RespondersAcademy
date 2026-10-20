/*
 * Канал поступления обращения попытки 112 (спека 009, FR-010, US6): звонок или СМС. Канал и текст СМС приходят
 * в OperatorAttempt из билета (channel / smsText, Attempt.to_operator_contract); без поля канал — обычный звонок.
 */
import type { CardChannel, OperatorAttempt } from "@/shared/api";

export function attemptChannel(attempt: OperatorAttempt): CardChannel {
  return attempt.channel === "sms" ? "sms" : "call";
}

/** Текст СМС-обращения для «Истории сообщений»; у звонка пусто. */
export function attemptSmsText(attempt: OperatorAttempt): string {
  if (attemptChannel(attempt) !== "sms") return "";
  return attempt.smsText ?? "";
}
