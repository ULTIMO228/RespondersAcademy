/*
 * Автономный чат разбора попытки (POST /api/v1/ai/chat, спека 010, T018; фронт без BACKEND_URL). Модели здесь нет:
 * ответ — детерминированный шаблон из итога и числа замечаний мок-оценки, source "template", provider и modelName null.
 * Контракт тот же, что у бэкенда (T005/T011). Порядок проверок: сессия → роль student → тело → попытка → своя → оценка.
 */
import type { ChatRequest, ChatResponse, ChatTurn, Evaluation, LobbyMode } from "../types";
import { loadEvaluation } from "./ai-assessment";
import type { AttemptEvaluator } from "./reports";
import { isRecord, readJsonBody } from "./request";
import { forbidden, unauthorized, validationFailed } from "./respond";
import { isStudentViewer } from "./viewer";
import type { MockViewer } from "./viewer";

const SESSION_REQUIRED = "Войдите в систему, чтобы задать вопрос по разбору";
const STUDENT_ONLY_CHAT = "Чат разбора доступен обучающемуся по собственной попытке";
const MESSAGE_MAX_LENGTH = 1000;
const HISTORY_MAX_TURNS = 6;
const LOBBY_MODES: readonly LobbyMode[] = ["dds", "operator112"];
const TURN_ROLES: readonly ChatTurn["role"][] = ["user", "assistant"];

/** Длина в кодовых точках (как len() на бэкенде): эмодзи считаются одним символом. */
const codePointLength = (text: string): number => Array.from(text).length;

function requireStudent(viewer: MockViewer | null): MockViewer {
  if (!viewer) throw unauthorized(SESSION_REQUIRED);
  if (!isStudentViewer(viewer)) throw forbidden(STUDENT_ONLY_CHAT);
  return viewer;
}

function parseTurn(candidate: unknown): ChatTurn {
  if (!isRecord(candidate)) throw validationFailed("Реплика истории должна быть объектом");
  const { role, content } = candidate;
  if (!TURN_ROLES.some((allowed) => allowed === role)) {
    throw validationFailed("Роль реплики истории — user или assistant");
  }
  if (typeof content !== "string" || codePointLength(content) > MESSAGE_MAX_LENGTH) {
    throw validationFailed(`Реплика истории не длиннее ${MESSAGE_MAX_LENGTH} символов`);
  }
  return { role: role as ChatTurn["role"], content };
}

/** Тело запроса: проверяет границы из контракта; при нарушении — 400 validationFailed с перечислением. */
function parseChatBody(raw: Record<string, unknown>): ChatRequest {
  const { attemptId, mode, message, history } = raw;
  if (typeof attemptId !== "string" || attemptId.trim() === "") {
    throw validationFailed("Укажите попытку (attemptId)");
  }
  if (!LOBBY_MODES.some((allowed) => allowed === mode)) {
    throw validationFailed("Режим — dds или operator112");
  }
  const trimmed = typeof message === "string" ? message.trim() : "";
  const length = codePointLength(trimmed);
  if (length < 1 || length > MESSAGE_MAX_LENGTH) {
    throw validationFailed(`Сообщение должно быть от 1 до ${MESSAGE_MAX_LENGTH} символов`);
  }
  const turns = history === undefined ? [] : history;
  if (!Array.isArray(turns) || turns.length > HISTORY_MAX_TURNS) {
    throw validationFailed(`История — не больше ${HISTORY_MAX_TURNS} реплик`);
  }
  return {
    attemptId,
    mode: mode as LobbyMode,
    message: trimmed,
    history: turns.map(parseTurn),
  };
}

/** Итог — с учётом решения преподавателя (приоритет за ним, Q&A в3), как в оценке попытки. */
function templateReply(evaluation: Evaluation): string {
  const total = evaluation.teacherOverride?.score ?? evaluation.totalScore;
  const count = evaluation.errors.length;
  const remarks = count === 0 ? "Замечаний по попытке нет." : `Замечаний по попытке: ${count}.`;
  return [
    `Итог попытки: ${total} баллов.`,
    remarks,
    "Ответ сформирован шаблоном без модели. Оценку выставляет преподаватель.",
  ].join(" ");
}

/** POST /ai/chat: справочный ответ по фактам оценки своей попытки; вопрос в ответе не эхоится. */
export async function postAttemptChatFor(
  request: Request,
  evaluate: AttemptEvaluator,
  viewerOrNull: MockViewer | null,
): Promise<ChatResponse> {
  const viewer = requireStudent(viewerOrNull);
  const chatRequest = parseChatBody(await readJsonBody(request));
  const { evaluation } = await loadEvaluation(chatRequest.attemptId, evaluate, viewer);
  return {
    reply: templateReply(evaluation),
    source: "template",
    provider: null,
    modelName: null,
  };
}
