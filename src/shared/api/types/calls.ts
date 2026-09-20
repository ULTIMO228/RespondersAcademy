/*
 * Софтфон учебного контура B→C (spec/04-pages/03-arm-softphone.md, T2.4-04/05): реплики ИИ-абонента
 * точки C и запись завершённого вызова в CardEvent.calls попытки.
 */
import type { PhoneCall, TranscriptLine } from "./session";

/** Ход ИИ-абонента: снятие трубки («Слушаю вас») или ответ на реплику диспетчера. */
export type CallTurn = "answer" | "reply";

/** Вариативность голоса ИИ-абонента (Q&A в8) — текстовая пометка, аудио опционально. */
export type CallVoice = "male" | "female";

/** POST /api/mock/calls/reply. */
export interface CallReplyRequest {
  toNumber: string;
  turn: CallTurn;
  /** Реплика диспетчера (для turn = "reply"). */
  text?: string;
}

/** Реплика ИИ-абонента (данные AiResponse: UI обязан показать бейдж «ИИ»). */
export interface CallReply {
  text: string;
  voice: CallVoice;
  /** Кто отвечает — название из справочника internalNumbers. */
  speakerTitle: string;
}

/** POST /api/mock/cards/[id]/calls — завершённый вызов в попытку курсанта по карточке. */
export interface CardCallRequest {
  studentId: string;
  toNumber: string;
  startedAt: string;
  endedAt: string;
  transcript: TranscriptLine[];
}

export interface CardCallResponse {
  sessionId: string;
  attemptId: string;
  call: PhoneCall;
}
