"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, ServerRequiredError } from "@/shared/api";
import type {
  AssignmentDetail,
  AssignmentProgress,
  CardDraft,
  ClassifierEntry,
  OperatorAttempt,
  OperatorEvaluation,
} from "@/shared/api";

import type { Operator112Api } from "../api/operator112Api";
import { mapSubmitError } from "./draft";
import type { FormErrors } from "./draft";

export type ProblemKind = "forbidden" | "notFound" | "conflict" | "serverRequired" | "error";

export type Problem = { kind: ProblemKind; message: string };

export type Screen =
  | { status: "loading" }
  | { status: "problem"; problem: Problem }
  /** Сервер выдал попытку ДДС (задание режима dds): открывается карточка ДДС, а не рабочее место 112. */
  | { status: "redirect"; cardId: string }
  | { status: "ready"; assignment: AssignmentDetail; attempt: OperatorAttempt; entries: ClassifierEntry[] };

export type Result = {
  evaluation: OperatorEvaluation;
};

/** Итог попытки, закрытой сервером по лимиту времени экзамена (оценка 0, «не выполнено»). */
export type Expired = Pick<AssignmentProgress, "score" | "passed">;

/**
 * Вид рабочего места 112 (спека 009, data-model «Состояния экрана 112»): журнал → входящий вызов → карточка → разбор.
 * links и smsHistory — окна поверх карточки; practiceCard — карточка-тренировка, открытая из журнала.
 */
export type OperatorView =
  "journal" | "incoming" | "card" | "links" | "smsHistory" | "practiceCard" | "result";

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
export const EXPIRY_RECHECK_MS = 5000;

export function toProblem(error: unknown): Problem {
  if (error instanceof ServerRequiredError) return { kind: "serverRequired", message: error.message };
  if (error instanceof ApiError) {
    if (error.status === HTTP_FORBIDDEN) return { kind: "forbidden", message: "Доступ запрещён" };
    if (error.status === HTTP_NOT_FOUND)
      return { kind: "notFound", message: error.message || "Задание не найдено" };
    if (error.status === HTTP_CONFLICT) return { kind: "conflict", message: error.message };
    return { kind: "error", message: error.message };
  }
  return { kind: "error", message: "Не удалось загрузить рабочее место 112" };
}

/**
 * Вид сразу после выдачи попытки: непринятый вызов — входящее окно; принятая попытка (перезагрузка во время разговора) —
 * карточка, чтобы разговор не терялся; закрытая — журнал.
 */
function viewOfAttempt(attempt: OperatorAttempt): OperatorView {
  if (attempt.state === "ringing") return "incoming";
  if (attempt.state === "answered") return "card";
  return "journal";
}

/** Заголовок вкладки браузера (спека 009, FR-003): в карточке — «Происшествие N», в журнале и на входящем — «Поиск происшествий». */
export function operator112Title(view: OperatorView, attempt: OperatorAttempt | null): string {
  const inCard = view === "card" || view === "links" || view === "smsHistory" || view === "result";
  return inCard && attempt ? `Происшествие ${attempt.incidentNumber}` : "Поиск происшествий";
}

/**
 * Рабочее место режима 112: выдача/восстановление попытки через POST /assignments/{id}/start (GET попытки у бэкенда нет),
 * приём вызова, передача карточки, разбор, следующий билет. Истина по времени и лимиту — сервер: лимит экзамена применяется
 * только при чтении задания, поэтому при нулевом остатке перед передачей клиент читает задание (submit лимит сам не применяет).
 * Вид (view) — состояние экрана; черновик карточки живёт в форме экрана и при смене вида не сбрасывается.
 */
export function useOperator112(assignmentId: string, api: Operator112Api) {
  const [screen, setScreen] = useState<Screen>({ status: "loading" });
  const [attempt, setAttempt] = useState<OperatorAttempt | null>(null);
  const [view, setView] = useState<OperatorView>("journal");
  const [isAnswering, setAnswering] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [result, setResult] = useState<Result | null>(null);
  const [expired, setExpired] = useState<Expired | null>(null);
  const [nextProblem, setNextProblem] = useState<string | null>(null);
  /** Сколько раз сервер подтвердил callHidden: журнал перечитывается, когда в нём уже появилась строка очереди. */
  const [hiddenCount, setHiddenCount] = useState(0);
  const loading = useRef<{ id: string; promise: Promise<void> } | null>(null);
  const submitting = useRef(false);

  const applyStart = useCallback(
    (
      assignment: AssignmentDetail,
      entries: ClassifierEntry[],
      started: Awaited<ReturnType<Operator112Api["startAssignment"]>>,
    ) => {
      if (started.kind === "dds") {
        setScreen({ status: "redirect", cardId: started.attempt.cardId });
        return;
      }
      setAttempt(started.attempt);
      setView(viewOfAttempt(started.attempt));
      setScreen({ status: "ready", assignment, attempt: started.attempt, entries });
    },
    [],
  );

  const load = useCallback(async () => {
    try {
      const assignment = await api.getAssignment(assignmentId);
      const [started, entries] = await Promise.all([api.startAssignment(assignmentId), api.getClassifier()]);
      applyStart(assignment, entries, started);
    } catch (error) {
      setScreen({ status: "problem", problem: toProblem(error) });
    }
  }, [api, applyStart, assignmentId]);

  // Один запуск на задание: повторный эффект StrictMode использует тот же промис (start идемпотентен, но лишний запрос не нужен).
  useEffect(() => {
    if (loading.current?.id !== assignmentId) loading.current = { id: assignmentId, promise: load() };
  }, [assignmentId, load]);

  // Заголовок вкладки по виду; прежний заголовок возвращается при уходе с экрана.
  useEffect(() => {
    const previous = document.title;
    document.title = operator112Title(view, attempt);
    return () => {
      document.title = previous;
    };
  }, [view, attempt]);

  /** true — вызов принят; при ошибке остаётся во входящем окне, текст ошибки в answerError. */
  const answer = useCallback(async (): Promise<boolean> => {
    if (isAnswering) return false;
    setAnswering(true);
    setAnswerError(null);
    try {
      setAttempt(await api.answerAttempt((attempt as OperatorAttempt).id));
      return true;
    } catch (error) {
      setAnswerError(error instanceof Error ? error.message : "Не удалось принять вызов");
      return false;
    } finally {
      setAnswering(false);
    }
  }, [api, attempt, isAnswering]);

  /** «Принять» во входящем окне: отвечает на вызов и открывает карточку. */
  const accept = useCallback(async () => {
    if (await answer()) setView("card");
  }, [answer]);

  /**
   * «×» на входящем окне: окно закрывается, попытка остаётся ringing — вызов в очереди, отсчёт норматива идёт, в журнале
   * появляется метка очереди. callHidden — только фиксация (research R5): её отказ не блокирует переход в журнал.
   */
  const hideCall = useCallback(() => {
    if (attempt?.state !== "ringing") return;
    setView("journal");
    api.sendEvent(attempt.id, { type: "callHidden" }).then(
      () => setHiddenCount((count) => count + 1),
      () => undefined,
    );
  }, [api, attempt]);

  /** Клик по строке очереди в журнале: снова показать входящее окно (пока вызов не принят). */
  const showIncoming = useCallback(() => {
    if (attempt?.state === "ringing") setView("incoming");
  }, [attempt]);

  const openLinks = useCallback(() => setView("links"), []);
  const openSmsHistory = useCallback(() => setView("smsHistory"), []);
  /** Возврат из связей и истории SMS: карточка с тем же состоянием попытки и черновиком. */
  const backToCard = useCallback(() => setView("card"), []);
  const openPractice = useCallback(() => setView("practiceCard"), []);
  const closePractice = useCallback(() => setView("journal"), []);

  /** Чтение задания применяет истечение лимита на сервере: возвращает итог, если текущая попытка закрыта по времени. */
  const checkExpiry = useCallback(async (): Promise<boolean> => {
    if (!attempt) return false;
    try {
      const detail = await api.getAssignment(assignmentId);
      const link = detail.progress.find((item) => item.attemptId === attempt.id);
      if (link?.state === "notCompleted") {
        setExpired({ score: link.score, passed: link.passed });
        setView("result");
        return true;
      }
    } catch {
      // Нет связи или сервера — итог покажет следующая проверка; передачу карточки это не блокирует.
    }
    return false;
  }, [api, assignmentId, attempt]);

  /** examZero — локальный остаток лимита равен нулю: сначала сверка с сервером. */
  const submit = useCallback(
    async (draft: CardDraft, examZero: boolean) => {
      if (!attempt || submitting.current) return;
      submitting.current = true;
      setSubmitting(true);
      setErrors({});
      try {
        if (examZero && (await checkExpiry())) return;
        const submitted = await api.submitAttempt(attempt.id, draft);
        setAttempt(submitted.attempt);
        const evaluation = await api.getEvaluation(attempt.id);
        setResult({ evaluation });
        setView("result");
      } catch (error) {
        const message =
          error instanceof Error && error.message ? error.message : "Не удалось передать карточку";
        const status = error instanceof ApiError ? error.status : 0;
        setErrors(status === 400 ? mapSubmitError(message) : { general: message });
      } finally {
        submitting.current = false;
        setSubmitting(false);
      }
    },
    [api, attempt, checkExpiry],
  );

  /** Следующий билет задания: новый start; 409 «Все билеты задания уже выполнены» остаётся сообщением на экране разбора. */
  const next = useCallback(async () => {
    if (screen.status !== "ready") return;
    setNextProblem(null);
    try {
      const started = await api.startAssignment(assignmentId);
      setResult(null);
      setExpired(null);
      setErrors({});
      applyStart(screen.assignment, screen.entries, started);
    } catch (error) {
      setNextProblem(toProblem(error).message);
    }
  }, [api, applyStart, assignmentId, screen]);

  return {
    screen,
    attempt,
    view,
    isAnswering,
    answerError,
    isSubmitting,
    errors,
    result,
    expired,
    nextProblem,
    hiddenCount,
    answer,
    accept,
    hideCall,
    showIncoming,
    openLinks,
    openSmsHistory,
    backToCard,
    openPractice,
    closePractice,
    submit,
    next,
    checkExpiry,
  };
}
