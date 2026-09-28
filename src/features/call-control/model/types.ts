/* Типы управления звонком софтфона (spec/000-фронт/04-pages/03-arm-softphone.md). */
import type { TelephonyStatus } from "@/entities/service";
import type { CallReply, CallVoice, TranscriptLine } from "@/shared/api";

/** Статус линии оператора (общий стор телефонии): доступен / недоступен / не подключен / ошибка. */
export type LineStatus = TelephonyStatus;

/** Состояние экрана активного вызова: «Вызов…» / «Разговор» / «Завершён». */
export type CallState = "calling" | "talking" | "finished";

export type { TranscriptLine };

/** Набранный абонент точки C (запись справочника internalNumbers). */
export type CallTarget = {
  number: string;
  subscriberTitle: string;
};

/** ИИ-абонент: снимает трубку и отвечает на реплику диспетчера (реплики — из мока через API). */
export interface CallResponder {
  answer(number: string): Promise<CallReply>;
  reply(number: string, text: string): Promise<CallReply>;
}

/** Завершённый вызов: метки ISO +03:00, транскрипт заморожен (иммутабелен после «Завершить»). */
export type FinishedCall = {
  number: string;
  subscriberTitle: string;
  startedAt: string;
  endedAt: string;
  transcript: readonly TranscriptLine[];
};

/** Строка журнала вызовов (PhoneCall из попытки или локальный вызов без карточки). */
export type CallLogEntry = {
  id: string;
  number: string;
  subscriberTitle: string;
  startedAt: string;
  endedAt: string;
  /** Учебная карточка попытки; null — прямой вызов по номеру. */
  cardId: string | null;
  /** false — вызов не записан в попытку (нет открытой попытки / ошибка сети). */
  isSaved: boolean;
};

export type { CallVoice };
