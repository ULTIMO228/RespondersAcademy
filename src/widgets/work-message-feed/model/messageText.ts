import type { WorkMessage, WorkMessageKind } from "@/shared/api";

/** Тексты сообщений служб по kind (спека 002, FR-033): текста в контракте бэкенда нет. */
export const WORK_MESSAGE_TEXTS: Record<WorkMessageKind, string> = {
  departed: "Расчёт выехал к месту вызова",
  arrived: "Расчёт прибыл на место",
  started: "Начаты работы",
  done: "Работы завершены",
};

const pad = (value: number) => String(value).padStart(2, "0");

/** «ЧЧ:ММ:СС · текст» по серверной метке at (московское смещение метки сохраняется: время берётся из самой строки). */
export function formatWorkMessage(message: WorkMessage): string {
  const time = /T(\d{2}):(\d{2}):(\d{2})/.exec(message.at);
  const clock = time ? `${time[1]}:${time[2]}:${time[3]}` : `${pad(0)}:${pad(0)}:${pad(0)}`;
  return `${clock} · ${WORK_MESSAGE_TEXTS[message.kind]}`;
}
