/*
 * Лента событий занятия (T3.3-05): строка = время (24 ч, ru) + действие курсанта. Источник — тот же feed,
 * что у плиток, поэтому расхождение с сеткой не больше одного тика. Мок-оценки ИИ помечаются бейджем «ИИ».
 * Нарушения нормативов лента не хранит: они вычисляются из таймингов события (реакция/отработка).
 */
import { conjugatePast, getLastName, isNormExceeded, parseIsoMs } from "@/entities/session";
import type { TimeNormsMs } from "@/entities/session";
import type { SessionFeedEvent } from "@/shared/api";
import { formatTime } from "@/shared/lib";

import type { FeedItem } from "../model/types";
import { getCaption, getFullName, getStatusTitle } from "./monitorSource";
import type { MonitorSource } from "./monitorSource";

type FeedContext = Pick<MonitorSource, "students" | "captions" | "ddsStatuses" | "norms">;

type Described = { text: string; isAi: boolean; isAlert: boolean };

function describeIssued(event: Extract<SessionFeedEvent, { kind: "cardIssued" }>, context: FeedContext) {
  const caption = getCaption(context.captions, event.cardId);
  const name = getLastName(getFullName(context.students, event.studentId));
  return { text: `Карточка ${caption.number} выдана: ${name}`, isAi: false, isAlert: false };
}

function describeOpened(fullName: string, cardNumber: string): Described {
  const name = getLastName(fullName);
  return {
    text: `Курсант ${name} ${conjugatePast("открыл", fullName)} карточку ${cardNumber}`,
    isAi: false,
    isAlert: false,
  };
}

function describeStatus(
  event: Extract<SessionFeedEvent, { kind: "statusChanged" }>,
  fullName: string,
  context: FeedContext,
): Described {
  const title = getStatusTitle(context.ddsStatuses, event.mark.ddsStatus);
  return {
    text: `${getLastName(fullName)} ${conjugatePast("проставил", fullName)} «${title}»`,
    isAi: false,
    isAlert: false,
  };
}

function describeCompleted(
  event: Extract<SessionFeedEvent, { kind: "cardCompleted" }>,
  fullName: string,
  cardNumber: string,
  norms: TimeNormsMs,
): Described {
  const name = getLastName(fullName);
  const exceeded = isNormExceeded(event.fullProcessingMs, norms.fullProcessingMs);
  const suffix = exceeded ? " — норматив отработки превышен" : "";
  return {
    text: `${name} ${conjugatePast("завершил", fullName)} карточку ${cardNumber}${suffix}`,
    isAi: false,
    isAlert: exceeded,
  };
}

function describeEvaluation(
  event: Extract<SessionFeedEvent, { kind: "aiEvaluation" }>,
  fullName: string,
  cardNumber: string,
): Described {
  const name = getLastName(fullName);
  return {
    text: `Мок-оценка отработки: ${name}, карточка ${cardNumber} — балл ${event.totalScore}, ошибок ${event.errorCount}`,
    isAi: true,
    isAlert: false,
  };
}

function describe(event: SessionFeedEvent, context: FeedContext): Described {
  const fullName = getFullName(context.students, event.studentId);
  const cardNumber = getCaption(context.captions, event.cardId).number;
  if (event.kind === "cardIssued") return describeIssued(event, context);
  if (event.kind === "cardOpened") return describeOpened(fullName, cardNumber);
  if (event.kind === "statusChanged") return describeStatus(event, fullName, context);
  if (event.kind === "cardCompleted") return describeCompleted(event, fullName, cardNumber, context.norms);
  return describeEvaluation(event, fullName, cardNumber);
}

/**
 * Превышение норматива реакции — отдельная строка ленты: между выдачей и открытием прошло больше нормы
 * (spec/000-фронт/04-pages/10: «11:05 Сидорова превысила норматив реакции»).
 */
function reactionAlert(
  event: SessionFeedEvent,
  issuedAt: string | undefined,
  context: FeedContext,
): FeedItem | null {
  if (event.kind !== "cardOpened" || !issuedAt) return null;
  const reactionMs = parseIsoMs(event.at) - parseIsoMs(issuedAt);
  if (!isNormExceeded(reactionMs, context.norms.primaryReactionMs)) return null;
  const fullName = getFullName(context.students, event.studentId);
  const cardNumber = getCaption(context.captions, event.cardId).number;
  return {
    id: `${event.attemptId}-reaction`,
    time: formatTime(event.at),
    studentId: event.studentId,
    text: `${getLastName(fullName)} ${conjugatePast("превысил", fullName)} норматив реакции (карточка ${cardNumber})`,
    isAi: false,
    isAlert: true,
    kind: "reactionExceeded",
  };
}

export type FeedBuildSource = FeedContext & {
  events: SessionFeedEvent[];
  /** Момент выдачи карточки курсанту — для строки о превышении норматива реакции. */
  issuedAt: (studentId: string, cardId: string) => string | undefined;
};

/** Лента занятия: новые события сверху. */
export function buildFeedItems(source: FeedBuildSource): FeedItem[] {
  const items = source.events.flatMap((event, index): FeedItem[] => {
    const described = describe(event, source);
    const base: FeedItem = {
      id: `${event.kind}-${event.studentId}-${event.cardId}-${event.at}-${index}`,
      time: formatTime(event.at),
      studentId: event.studentId,
      kind: event.kind,
      ...described,
    };
    const alert = reactionAlert(event, source.issuedAt(event.studentId, event.cardId), source);
    return alert ? [base, alert] : [base];
  });
  return items.reverse();
}
