/*
 * Софтфон учебного контура B→C (T2.4-04, T2.4-05):
 *   POST /calls/reply        — реплика ИИ-абонента точки C (мок: реплики берутся из транскриптов sessions.json);
 *   POST /cards/[id]/calls   — завершённый вызов (PhoneCall) в CardEvent.calls попытки курсанта по карточке.
 * ИИ-модуль: заменить на реальный сервис (ответ несёт маркер AiResponse → UI показывает бейдж «ИИ»).
 * Попытку создаёт открытие карточки (T2.3-01); здесь только дописывается вызов в существующую попытку.
 */
import type { AiResponse } from "../ai-gateway";
import type {
  CallReply,
  CallReplyRequest,
  CallTurn,
  CallVoice,
  CardCallRequest,
  CardCallResponse,
  CardEvent,
  InternalNumber,
  PhoneCall,
  Session,
  TranscriptLine,
} from "../types";
import { requireCard } from "./cards";
import { readReference, readSessions } from "./readers";
import { isRecord, readJsonBody } from "./request";
import { notFound, validationFailed } from "./respond";
import { MOCK_ID_PREFIX, nextMockId } from "./store";
import { addAttemptCall, listStoredSessions } from "./store-training";
import { parseIso } from "./time";

const CALL_TURNS: readonly CallTurn[] = ["answer", "reply"];
const VOICES: readonly CallVoice[] = ["male", "female"];
const SPEAKERS: readonly TranscriptLine["speaker"][] = ["dispatcher", "ai"];
const RUNNING_STATE: Session["state"] = "running";

/* ─── Реплики ИИ-абонента ───────────────────────────────────────────────────────────────────────── */

type CallScript = { greeting: string; confirmations: Map<string, string>; defaultConfirmation: string };

let cachedScript: CallScript | undefined;

function mostFrequent(values: readonly string[]): string | undefined {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts].sort(([, left], [, right]) => right - left)[0]?.[0];
}

/** Сценарий ИИ-абонента из моков: первая реплика ИИ — снятие трубки, последняя — подтверждение приёма. */
function readCallScript(): CallScript {
  if (cachedScript) return cachedScript;
  const calls = readSessions().flatMap((session) => session.cardEvents.flatMap((event) => event.calls));
  const aiLines = calls.map((call) => call.transcript.filter((line) => line.speaker === "ai"));
  const greetings = aiLines.map((lines) => lines[0]?.text).filter((text): text is string => Boolean(text));
  const confirmations = new Map<string, string>();
  calls.forEach((call, index) => {
    const last = aiLines[index].at(-1);
    if (aiLines[index].length > 1 && last && !confirmations.has(call.toNumber)) {
      confirmations.set(call.toNumber, last.text);
    }
  });
  const greeting = mostFrequent(greetings);
  const defaultConfirmation = mostFrequent([...confirmations.values()]);
  if (!greeting || !defaultConfirmation) throw notFound("В моках нет реплик ИИ-абонента");
  cachedScript = { greeting, confirmations, defaultConfirmation };
  return cachedScript;
}

function requireInternalNumber(toNumber: string): InternalNumber {
  const entry = readReference().internalNumbers.find((candidate) => candidate.number === toNumber);
  if (!entry) throw notFound("Абонент не найден");
  return entry;
}

function parseReplyRequest(body: Record<string, unknown>): CallReplyRequest {
  if (typeof body.toNumber !== "string" || body.toNumber.trim() === "") {
    throw validationFailed("Укажите номер абонента");
  }
  if (typeof body.turn !== "string" || !(CALL_TURNS as readonly string[]).includes(body.turn)) {
    throw validationFailed("Поле «turn» должно быть answer или reply");
  }
  const turn = body.turn as CallTurn;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (turn === "reply" && text === "") throw validationFailed("Введите реплику диспетчера");
  return { toNumber: body.toNumber.trim(), turn, text };
}

/** Детерминированный голос абонента по номеру (вариативность м/ж, Q&A в8). */
function voiceOf(toNumber: string): CallVoice {
  return VOICES[Number(toNumber) % VOICES.length] ?? VOICES[0];
}

// ИИ-модуль: заменить на реальный сервис (голосовой ИИ-абонент точки C).
export async function replyToCall(httpRequest: Request): Promise<AiResponse<CallReply>> {
  const request = parseReplyRequest(await readJsonBody(httpRequest));
  const entry = requireInternalNumber(request.toNumber);
  const script = readCallScript();
  const text =
    request.turn === "answer"
      ? script.greeting
      : (script.confirmations.get(entry.number) ?? script.defaultConfirmation);
  return {
    origin: "ai",
    provider: "mock",
    data: { text, voice: voiceOf(entry.number), speakerTitle: entry.title },
  };
}

/* ─── Запись вызова в попытку ───────────────────────────────────────────────────────────────────── */

function requireIsoString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || Number.isNaN(parseIso(value))) {
    throw validationFailed(`Поле «${key}» должно быть датой ISO 8601`);
  }
  return value;
}

function parseTranscript(value: unknown): TranscriptLine[] {
  if (!Array.isArray(value)) throw validationFailed("Поле «transcript» должно быть списком реплик");
  return value.map((line) => {
    const valid =
      isRecord(line) &&
      (SPEAKERS as readonly unknown[]).includes(line.speaker) &&
      typeof line.text === "string" &&
      typeof line.at === "string" &&
      !Number.isNaN(parseIso(line.at));
    if (!valid) throw validationFailed("Реплика транскрипта: нужны speaker (dispatcher|ai), text, at");
    return { speaker: line.speaker, text: line.text, at: line.at } as TranscriptLine;
  });
}

function parseCallRequest(body: Record<string, unknown>): CardCallRequest {
  if (typeof body.studentId !== "string" || body.studentId.trim() === "") {
    throw validationFailed("Укажите курсанта (studentId)");
  }
  if (typeof body.toNumber !== "string" || body.toNumber.trim() === "") {
    throw validationFailed("Укажите номер абонента");
  }
  const startedAt = requireIsoString(body, "startedAt");
  const endedAt = requireIsoString(body, "endedAt");
  if (parseIso(endedAt) < parseIso(startedAt)) throw validationFailed("Вызов не может закончиться до начала");
  return {
    studentId: body.studentId.trim(),
    toNumber: body.toNumber.trim(),
    startedAt,
    endedAt,
    transcript: parseTranscript(body.transcript),
  };
}

/** Попытка курсанта по карточке: сначала идущее занятие, затем самое позднее по startedAt. */
function findAttempt(
  cardId: string,
  studentId: string,
): { session: Session; attempt: CardEvent } | undefined {
  const sessions = listStoredSessions().sort((left, right) => {
    const running = Number(right.state === RUNNING_STATE) - Number(left.state === RUNNING_STATE);
    return running || parseIso(right.startedAt) - parseIso(left.startedAt);
  });
  for (const session of sessions) {
    const attempt = session.cardEvents.findLast(
      (event) => event.cardId === cardId && event.studentId === studentId,
    );
    if (attempt) return { session, attempt };
  }
  return undefined;
}

export async function recordCardCall(cardId: string, httpRequest: Request): Promise<CardCallResponse> {
  requireCard(cardId);
  const request = parseCallRequest(await readJsonBody(httpRequest));
  requireInternalNumber(request.toNumber);
  const found = findAttempt(cardId, request.studentId);
  if (!found) throw notFound(`Попытка по карточке «${cardId}» не открыта — вызов не записан`);
  const call: PhoneCall = {
    id: nextMockId(MOCK_ID_PREFIX.call),
    fromUserId: request.studentId,
    toNumber: request.toNumber,
    startedAt: request.startedAt,
    endedAt: request.endedAt,
    transcript: request.transcript,
  };
  addAttemptCall(found.attempt.id, call);
  return { sessionId: found.session.id, attemptId: found.attempt.id, call };
}
