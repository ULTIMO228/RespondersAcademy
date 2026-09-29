/*
 * Представление задания для карточки обучающегося: подписи режима/формата, число билетов, статус по прогрессу.
 * Прогресс приходит с сервера (GET /assignments/{id}); обучающийся задание не завершает — «Завершено» ставит преподаватель
 * либо лимит времени (сервер), поэтому кнопки «Завершить» в представлении нет.
 */
import type {
  Assignment,
  AssignmentDetail,
  AssignmentLinkState,
  AssignmentProgress,
  TrainingMode,
} from "@/shared/api";

export const MODE_TITLES: Record<TrainingMode, string> = {
  operator112: "Режим 112: приём вызова и карточка",
  dds: "Режим ДДС: отработка карточки",
  chain: "Цепочка 112 → ДДС",
};

export const LINK_STATE_TITLES: Record<AssignmentLinkState, string> = {
  ringing: "Вызов поступил",
  answered: "В работе",
  submitted: "Передан",
  notCompleted: "Не выполнено",
};

export type CardStatus = "available" | "inProgress" | "done" | "finished";

export type AssignmentView = {
  assignment: Assignment;
  /** null — прогресс не загрузился (карточка остаётся рабочей, статус неизвестен). */
  progress: AssignmentProgress[] | null;
  status: CardStatus;
  /** Всего билетов: фиксированный набор либо число случайных билетов; null — неизвестно. */
  total: number | null;
  closed: number;
  hasOpenAttempt: boolean;
  /** Вход ДДС ждёт подтверждения преподавателя (chain, этап A передан). */
  awaitsTeacher: boolean;
};

export function ticketTotal(assignment: Assignment): number | null {
  if (assignment.cardIds.length > 0) return assignment.cardIds.length;
  return assignment.randomRule?.count ?? null;
}

export function toView(assignment: Assignment, detail: AssignmentDetail | null): AssignmentView {
  const progress = detail?.progress ?? null;
  const total = ticketTotal(assignment);
  const closed =
    progress?.filter((item) => item.state === "submitted" || item.state === "notCompleted").length ?? 0;
  const hasOpenAttempt =
    progress?.some((item) => item.state === "ringing" || item.state === "answered") ?? false;
  const awaitsTeacher = Boolean(
    progress?.some((item) => item.chainReview && item.chainReview.approval !== "approved"),
  );
  let status: CardStatus = "available";
  if (assignment.state === "finished") status = "finished";
  else if (hasOpenAttempt) status = "inProgress";
  else if (total !== null && closed >= total && !awaitsTeacher) status = "done";
  return { assignment, progress, status, total, closed, hasOpenAttempt, awaitsTeacher };
}

/** Секунды → «10 мин», «1 ч 5 мин», «45 с». */
export function formatLimit(totalSec: number): string {
  if (totalSec < 60) return `${totalSec} с`;
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return [hours ? `${hours} ч` : "", minutes ? `${minutes} мин` : "", seconds ? `${seconds} с` : ""]
    .filter(Boolean)
    .join(" ");
}

export function averageScore(progress: AssignmentProgress[] | null): number | null {
  const scores = (progress ?? []).flatMap((item) => (typeof item.score === "number" ? [item.score] : []));
  return scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
}

const MS_PER_DAY = 86_400_000;
const FAR_FUTURE = Number.MAX_SAFE_INTEGER;

function dueOrder(assignment: Assignment): number {
  return assignment.dueAt ? Date.parse(assignment.dueAt) : FAR_FUTURE;
}

/** Задание, которое можно запустить или продолжить сейчас: активное и не выполненное целиком, вход ДДС не ждёт преподавателя. */
export function isRunnable(view: AssignmentView): boolean {
  return (view.status === "available" || view.status === "inProgress") && !view.awaitsTeacher;
}

/**
 * «Ближайшее задание» главной обучающегося (T042): среди доступных для запуска — с наименьшим сроком `dueAt`;
 * без срока — раньше созданное (`createdAt`). Открытая попытка учитывается как доступное задание («Продолжить»).
 */
export function pickNextAssignment(views: AssignmentView[]): AssignmentView | null {
  const runnable = views.filter(isRunnable);
  if (runnable.length === 0) return null;
  return [...runnable].sort((left, right) => {
    const byDue = dueOrder(left.assignment) - dueOrder(right.assignment);
    if (byDue !== 0) return byDue < 0 ? -1 : 1;
    return Date.parse(left.assignment.createdAt) - Date.parse(right.assignment.createdAt);
  })[0];
}

/** Открытая попытка (для блока «Продолжить»): первое задание с ringing/answered. */
export function pickOpenAttempt(views: AssignmentView[]): AssignmentView | null {
  return views.find((view) => view.hasOpenAttempt && view.assignment.state === "active") ?? null;
}

/** Срок в днях от «сейчас»: отрицательный — просрочен; null — срока нет. */
export function daysUntilDue(assignment: Assignment, nowMs: number): number | null {
  return assignment.dueAt ? Math.ceil((Date.parse(assignment.dueAt) - nowMs) / MS_PER_DAY) : null;
}
