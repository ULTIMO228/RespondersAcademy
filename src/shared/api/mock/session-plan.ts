/*
 * Расписание выдачи карточек занятия (T3.2-02, T3.2-04, T3.2-05, T3.2-09).
 *
 * Логика — только здесь: UI мастера настраивает параметры (SessionPlan), расписание строит мок-слой при
 * POST /sessions/[id]/start. Правила:
 *   пул      — Session.cardSource: generated (карточки сценариев) / studentCreated (карточки, заполненные
 *              курсантами на прошлых занятиях, IncidentCard.createdByStudentId) / mixed (чередование);
 *   фильтры  — группы ЕКП занятия (SessionPlan.categories) и профильная привязка курсанта
 *              (T3.1-09, ProfileMappingRow по User.service): непрофильные карточки не выдаются;
 *   порядок  — manual (порядок сценариев мастера) или adaptive (Q&A в10: от простого к сложному, сильному
 *              курсанту простые карточки уходят в конец, слабому темп снижается и повторяются простые);
 *   темп     — новая карточка через SessionPlan.paceSec после предыдущей (многозадачность, Q&A в6);
 *   конвейер — SessionPlan.conveyor: очередь зацикливается на горизонт занятия (сценарий В, до ручной
 *              остановки преподавателем).
 */
import type { CardFlowItem, IncidentCard, Session, SessionPlan } from "../types";
import { readCards } from "./readers";
import { findStoredScenario, listStoredSessions } from "./store-training";
import { listStoredProfileMapping } from "./store-teacher";
import { findStoredUser } from "./store-admin";
import { parseIso, toMoscowIso } from "./time";

const MS_IN_SECOND = 1000;
/** Горизонт конвейера — длительность занятия (в контракте Session поля нет): 60 мин от старта. */
const CONVEYOR_HORIZON_MS = 60 * 60 * MS_IN_SECOND;
/** Сколько последних оценок курсанта учитывает адаптивная выдача. */
const ADAPTIVE_HISTORY = 3;
/** Интегральный балл, с которого курсант считается справляющимся (сложность растёт). */
const ADAPTIVE_STRONG_SCORE = 80;
/** Балл, ниже которого темп снижается и повторяются простые карточки (Q&A в10). */
const ADAPTIVE_WEAK_SCORE = 60;
/** Во сколько раз реже выдаются карточки слабому курсанту. */
const ADAPTIVE_SLOWDOWN = 1.5;

/** Два раздельных норматива заказчика, сек (Q&A в6) — дефолты плана занятия. */
export const PLAN_REACTION_NORM_SEC = 30;
export const PLAN_PROCESSING_NORM_SEC = 180;

/** План по умолчанию: занятие создано без мастера (например, курсантом по назначенному модулю). */
export const DEFAULT_SESSION_PLAN: SessionPlan = {
  categories: [],
  issueOrder: "adaptive",
  hints: false,
  timeNorms: { primaryReactionSec: PLAN_REACTION_NORM_SEC, fullProcessingSec: PLAN_PROCESSING_NORM_SEC },
  maxGrammarErrors: 0,
  paceSec: PLAN_PROCESSING_NORM_SEC,
  conveyor: false,
};

/** Карточка очереди занятия: id, уровень (адаптивная сложность) и группа ЕКП (фильтры). */
export type PlannedCard = { cardId: string; level: number; group: string };

function cardById(): Map<string, IncidentCard> {
  return new Map(readCards().map((card) => [card.id, card]));
}

/* ─── Пул карточек ──────────────────────────────────────────────────────────────────────────────── */

function scenarioCards(session: Session, plan: SessionPlan, cards: Map<string, IncidentCard>): PlannedCard[] {
  const scenarios = session.scenarioIds.flatMap((id) => findStoredScenario(id) ?? []);
  const ordered =
    plan.issueOrder === "adaptive"
      ? [...scenarios].sort((left, right) => left.difficulty - right.difficulty)
      : scenarios;
  return ordered.flatMap((scenario) =>
    scenario.cardIds.map((cardId) => ({
      cardId,
      level: scenario.difficulty,
      group: cards.get(cardId)?.group ?? "",
    })),
  );
}

/**
 * Пул «сформированные обучающимися» (сценарий В): карточки с пометкой автора-курсанта и карточки,
 * заполненные курсантами на прошлых занятиях (CardEvent.enteredText завершённых занятий).
 */
function studentCreatedCards(
  session: Session,
  cards: Map<string, IncidentCard>,
  levelOf: (cardId: string) => number,
): PlannedCard[] {
  const fromCards = readCards()
    .filter((card) => card.createdByStudentId)
    .map((card) => card.id);
  const fromAttempts = listStoredSessions()
    .filter((stored) => stored.id !== session.id)
    .flatMap((stored) =>
      stored.cardEvents
        .filter((attempt) => Object.keys(attempt.enteredText).length > 0)
        .map((attempt) => attempt.cardId),
    );
  return [...new Set([...fromCards, ...fromAttempts])].map((cardId) => ({
    cardId,
    level: levelOf(cardId),
    group: cards.get(cardId)?.group ?? "",
  }));
}

/** Чередование двух пулов для cardSource `mixed` (состав прозрачен преподавателю — без случайности). */
function interleave(first: PlannedCard[], second: PlannedCard[]): PlannedCard[] {
  const merged: PlannedCard[] = [];
  for (let index = 0; index < Math.max(first.length, second.length); index += 1) {
    if (first[index]) merged.push(first[index]);
    if (second[index]) merged.push(second[index]);
  }
  return merged;
}

function uniqueByCard(pool: readonly PlannedCard[]): PlannedCard[] {
  const seen = new Set<string>();
  const unique: PlannedCard[] = [];
  for (const card of pool) {
    if (seen.has(card.cardId)) continue;
    seen.add(card.cardId);
    unique.push(card);
  }
  return unique;
}

/** Пул занятия по Session.cardSource; дубли карточек снимаются, порядок сохраняется. */
export function buildSessionPool(session: Session, plan: SessionPlan): PlannedCard[] {
  const cards = cardById();
  const generated = scenarioCards(session, plan, cards);
  const levelOf = (cardId: string) => generated.find((card) => card.cardId === cardId)?.level ?? 1;
  const studentMade = studentCreatedCards(session, cards, levelOf);
  if (session.cardSource === "generated") return uniqueByCard(generated);
  if (session.cardSource === "studentCreated") return uniqueByCard(studentMade);
  return uniqueByCard(interleave(generated, studentMade));
}

/* ─── Фильтры: категории занятия и профиль курсанта ─────────────────────────────────────────────── */

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU");
}

/**
 * Профильные группы ЕКП курсанта (T3.1-09 → ProfileMappingRow по User.service); null — привязки нет,
 * фильтр не применяется.
 */
export function resolveStudentProfileGroups(studentId: string): Set<string> | null {
  const service = findStoredUser(studentId)?.service;
  if (!service) return null;
  const row = listStoredProfileMapping().find(
    (candidate) => normalize(candidate.profile) === normalize(service),
  );
  return row ? new Set(row.incidentGroups.map(normalize)) : null;
}

/** Карточки, доступные курсанту: группы занятия (если выбраны) ∩ профильные группы курсанта. */
export function filterCardsForStudent(
  pool: readonly PlannedCard[],
  studentId: string,
  categories: readonly string[],
): PlannedCard[] {
  const selected = categories.length > 0 ? new Set(categories.map(normalize)) : null;
  const profile = resolveStudentProfileGroups(studentId);
  return pool.filter(
    (card) =>
      (!selected || selected.has(normalize(card.group))) && (!profile || profile.has(normalize(card.group))),
  );
}

/* ─── Адаптивная сложность (Q&A в10) ────────────────────────────────────────────────────────────── */

/** Средний интегральный балл последних попыток курсанта; null — оценок ещё нет. */
export function readStudentScore(studentId: string, exceptSessionId?: string): number | null {
  const scores = listStoredSessions()
    .filter((session) => session.id !== exceptSessionId)
    .flatMap((session) => session.cardEvents.filter((attempt) => attempt.studentId === studentId))
    .sort((left, right) => parseIso(left.openedAt) - parseIso(right.openedAt))
    .slice(-ADAPTIVE_HISTORY)
    .flatMap((attempt) => (attempt.evaluation ? [attempt.evaluation.totalScore] : []));
  if (scores.length === 0) return null;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

/**
 * Очередь курсанта с учётом стратегии: manual — как выбрал преподаватель; adaptive — от простого к
 * сложному, сильному курсанту самые простые карточки уходят в конец, слабому простая повторяется.
 */
export function orderForStudent(
  cards: readonly PlannedCard[],
  issueOrder: SessionPlan["issueOrder"],
  score: number | null,
): PlannedCard[] {
  if (issueOrder === "manual" || cards.length === 0) return [...cards];
  const byLevel = [...cards].sort((left, right) => left.level - right.level);
  if (score !== null && score >= ADAPTIVE_STRONG_SCORE) {
    const easiest = byLevel[0].level;
    const harder = byLevel.filter((card) => card.level > easiest);
    return harder.length > 0 ? [...harder, ...byLevel.filter((card) => card.level === easiest)] : byLevel;
  }
  if (score !== null && score <= ADAPTIVE_WEAK_SCORE) return [byLevel[0], ...byLevel];
  return byLevel;
}

/** Темп курсанта: слабому карточки выдаются реже (Q&A в10 «ошибается — темп снижается»). */
export function paceMsForStudent(plan: SessionPlan, score: number | null): number {
  const base = plan.paceSec * MS_IN_SECOND;
  return score !== null && score <= ADAPTIVE_WEAK_SCORE ? Math.round(base * ADAPTIVE_SLOWDOWN) : base;
}

/* ─── Расписание ────────────────────────────────────────────────────────────────────────────────── */

function scheduleForStudent(
  queue: readonly PlannedCard[],
  studentId: string,
  startMs: number,
  paceMs: number,
  conveyor: boolean,
): CardFlowItem[] {
  if (queue.length === 0) return [];
  const count = conveyor ? Math.max(queue.length, Math.ceil(CONVEYOR_HORIZON_MS / paceMs)) : queue.length;
  return Array.from({ length: count }, (_unused, index) => {
    const card = queue[index % queue.length];
    return {
      cardId: card.cardId,
      studentId,
      issuedAt: toMoscowIso(new Date(startMs + index * paceMs)),
      level: card.level,
    };
  });
}

/**
 * Расписание занятия по настройкам мастера: каждому курсанту — свой профильный пул, первая карточка
 * в момент старта, далее с шагом темпа; конвейер зацикливает очередь на горизонт занятия.
 */
export function buildPlannedCardFlow(session: Session, plan: SessionPlan, startedAt: string): CardFlowItem[] {
  const startMs = parseIso(startedAt);
  const pool = buildSessionPool(session, plan);
  return session.studentIds.flatMap((studentId) => {
    const score = readStudentScore(studentId, session.id);
    const queue = orderForStudent(
      filterCardsForStudent(pool, studentId, plan.categories),
      plan.issueOrder,
      score,
    );
    return scheduleForStudent(queue, studentId, startMs, paceMsForStudent(plan, score), plan.conveyor);
  });
}

/** Следующая карточка курсанта вне расписания: первая из пула, которую ему ещё не выдавали. */
export function nextCardForStudent(
  session: Session,
  plan: SessionPlan,
  studentId: string,
): PlannedCard | undefined {
  const issued = new Set(
    session.cardFlow.filter((item) => item.studentId === studentId).map((item) => item.cardId),
  );
  const queue = filterCardsForStudent(buildSessionPool(session, plan), studentId, plan.categories);
  return queue.find((card) => !issued.has(card.cardId)) ?? queue[0];
}
