import type { CardFlowItem, Scenario, SessionContract } from "@/shared/api";
import { formatDate, formatHourMinute } from "@/shared/lib";

import type { AssignedModule } from "../model/types";
import type { ProfileGroups } from "./profileFilter";
import { isProfileCard } from "./profileFilter";
import { toMoscowIso } from "./time";

/*
 * «Мои назначенные модули» (T2.2-15, ТЗ §8): сценарии approved из занятий, куда преподаватель включил курсанта
 * (Session.studentIds), в состоянии «Настроено»/«Идёт занятие». Дедлайн — окончание занятия.
 */

/** Длительность занятия (в контракте Session поля нет): 60 мин от начала. */
export const SESSION_DURATION_MS = 60 * 60_000;
/** Шаг выдачи карточек по умолчанию — норматив полной обработки 3 мин (как расписание мок-слоя). */
export const ISSUE_INTERVAL_MS = 180_000;

const ASSIGNED_SESSION_STATES = new Set<SessionContract["state"]>(["configured", "running"]);
const APPROVED = "approved";
const TITLE_SEPARATOR = ":";
const LEVEL_TITLES: Record<Scenario["level"], string> = {
  beginner: "базовый",
  advanced: "продвинутый",
};

export function getSessionEndsAt(startedAt: string): string {
  return toMoscowIso(Date.parse(startedAt) + SESSION_DURATION_MS);
}

function formatDeadline(startedAt: string): string {
  const endsAt = getSessionEndsAt(startedAt);
  return `${formatDate(endsAt)} ${formatHourMinute(endsAt)}`;
}

/** «Билет 05: пожар-окно…» → «Билет 05». */
export function toShortTitle(title: string): string {
  return title.split(TITLE_SEPARATOR)[0].trim();
}

function toModule(
  scenario: Scenario,
  session: SessionContract,
  groups: Record<string, string>,
): AssignedModule {
  const cards = scenario.cardIds.map((id) => ({ id, group: groups[id] ?? "" }));
  return {
    id: scenario.id,
    title: scenario.title,
    shortTitle: toShortTitle(scenario.title),
    categories: [...new Set(cards.map((card) => card.group).filter(Boolean))],
    difficulty: scenario.difficulty,
    levelTitle: LEVEL_TITLES[scenario.level] ?? scenario.level,
    deadline: formatDeadline(session.startedAt),
    teacherId: session.teacherId,
    cards,
  };
}

/** Модули курсанта: только его занятия и только approved-сценарии; повтор сценария — один модуль. */
export function buildAssignedModules(
  studentId: string,
  sessions: readonly SessionContract[],
  scenarios: readonly Scenario[],
  cardGroups: Record<string, string>,
): AssignedModule[] {
  const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const modules = new Map<string, AssignedModule>();
  sessions
    .filter((session) => ASSIGNED_SESSION_STATES.has(session.state) && session.studentIds.includes(studentId))
    .forEach((session) =>
      session.scenarioIds.forEach((scenarioId) => {
        const scenario = byId.get(scenarioId);
        if (!scenario || scenario.validation.status !== APPROVED || modules.has(scenarioId)) return;
        modules.set(scenarioId, toModule(scenario, session, cardGroups));
      }),
    );
  return [...modules.values()];
}

/** Id карточек, группы которых нужны модулям (для запросов карточек). */
export function collectModuleCardIds(
  studentId: string,
  sessions: readonly SessionContract[],
  scenarios: readonly Scenario[],
): string[] {
  const modules = buildAssignedModules(studentId, sessions, scenarios, {});
  return [...new Set(modules.flatMap((module) => module.cards.map((card) => card.id)))];
}

/**
 * Расписание выдачи занятия по модулю: только карточки профильных групп (spec/04-pages/11 «Поведение» —
 * фильтрация при формировании cardFlow), первая — сразу, далее с шагом ISSUE_INTERVAL_MS.
 */
export function buildModuleCardFlow(
  module: AssignedModule,
  studentId: string,
  startMs: number,
  profileGroups: ProfileGroups,
): CardFlowItem[] {
  return module.cards
    .filter((card) => isProfileCard(card.group, profileGroups))
    .map((card, index) => ({
      cardId: card.id,
      studentId,
      issuedAt: toMoscowIso(startMs + index * ISSUE_INTERVAL_MS),
      level: module.difficulty,
    }));
}
