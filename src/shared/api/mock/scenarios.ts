/*
 * Сценарии преподавателя (T1.1-14): GET/POST /api/mock/scenarios, POST /api/mock/scenarios/[id]/validate;
 * фаза 3.1 добавила GET/PATCH/DELETE /api/mock/scenarios/[id] и POST /api/mock/scenarios/generate.
 *
 * Фильтры списка (множественные — повторными ключами): group — группа ЕКП (сценарий подходит, если хотя бы
 * одна его карточка cardIds относится к группе; у Scenario нет своего поля группы), difficulty 1–5,
 * source (template | generated), validationStatus (draft | pending | approved | rejected).
 * РЕШЕНИЕ «только approved для занятий»: выдача для мастера занятия — `?validationStatus=approved`;
 * POST /sessions дополнительно отклоняет не-approved сценарии (400) — см. sessions.ts.
 * source: 'generated' сохраняется как есть (контракт бейджа «ИИ» на UI).
 */
import type { AiGateway } from "../ai-gateway";
import type {
  Difficulty,
  Etalon,
  Scenario,
  ScenarioCreateRequest,
  ScenarioMode,
  ScenarioTimeNorms,
  ScenarioValidateAction,
  ScenarioValidationStatus,
  SuccessCriteria,
} from "../types";
import { readCards } from "./readers";
import { isRecord, readJsonBody, readListParam, readStringParam } from "./request";
import { conflict, HTTP_STATUS, MockApiError, notFound, validationFailed } from "./respond";
import { MOCK_ID_PREFIX, nextMockId } from "./store";
import { findStoredScenario, insertStoredScenario, listStoredScenarios } from "./store-training";
import { listStoredSessions, removeStoredScenario, updateStoredScenario } from "./store-training";
import { findStoredUser } from "./store-admin";
import { auditTeacherAction, requireTeacher } from "./teacher";

const VALIDATION_STATUSES: readonly ScenarioValidationStatus[] = ["draft", "pending", "approved", "rejected"];
const SOURCES: readonly Scenario["source"][] = ["template", "generated"];
const LEVELS: readonly Scenario["level"][] = ["beginner", "advanced"];
const MODES: readonly ScenarioMode[] = ["demo", "follow", "practice"];
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 5;
/** Маппинг spec/05 §6: beginner ↔ difficulty 1–2, advanced ↔ difficulty 3–5. */
const ADVANCED_FROM_DIFFICULTY = 3;

export function toLevel(difficulty: Difficulty): Scenario["level"] {
  return difficulty >= ADVANCED_FROM_DIFFICULTY ? "advanced" : "beginner";
}

function isOneOf<TValue extends string>(values: readonly TValue[], candidate: unknown): candidate is TValue {
  return typeof candidate === "string" && (values as readonly string[]).includes(candidate);
}

function isDifficulty(candidate: unknown): candidate is Difficulty {
  return (
    Number.isInteger(candidate) && Number(candidate) >= MIN_DIFFICULTY && Number(candidate) <= MAX_DIFFICULTY
  );
}

/* ─── Список ────────────────────────────────────────────────────────────────────────────────────── */

function scenarioGroups(scenario: Scenario): Set<string> {
  const cards = readCards();
  return new Set(scenario.cardIds.flatMap((id) => cards.find((card) => card.id === id)?.group ?? []));
}

function readDifficulties(params: URLSearchParams): Difficulty[] {
  return readListParam(params, "difficulty").map((raw) => {
    const value = Number(raw);
    if (!isDifficulty(value)) throw validationFailed(`Некорректная сложность: ${raw} (допустимо 1–5)`);
    return value;
  });
}

function readEnumParam<TValue extends string>(
  params: URLSearchParams,
  key: string,
  values: readonly TValue[],
): TValue | undefined {
  const raw = readStringParam(params, key);
  if (raw !== undefined && !isOneOf(values, raw)) {
    throw validationFailed(`Некорректное значение «${key}»: ${raw}`);
  }
  return raw;
}

export function listScenarios(params: URLSearchParams): Scenario[] {
  const groups = readListParam(params, "group");
  const difficulties = readDifficulties(params);
  const source = readEnumParam(params, "source", SOURCES);
  const status = readEnumParam(params, "validationStatus", VALIDATION_STATUSES);
  return listStoredScenarios().filter((scenario) => {
    if (difficulties.length > 0 && !difficulties.includes(scenario.difficulty)) return false;
    if (source && scenario.source !== source) return false;
    if (status && scenario.validation.status !== status) return false;
    if (groups.length === 0) return true;
    const own = scenarioGroups(scenario);
    return groups.some((group) => own.has(group));
  });
}

/* ─── Создание черновика ────────────────────────────────────────────────────────────────────────── */

function isStringArray(candidate: unknown): candidate is string[] {
  return Array.isArray(candidate) && candidate.every((item) => typeof item === "string");
}

function assertCardIds(cardIds: unknown): asserts cardIds is string[] {
  if (!isStringArray(cardIds) || cardIds.length === 0) throw validationFailed("Добавьте карточки в сценарий");
  const known = new Set(readCards().map((card) => card.id));
  const unknown = cardIds.find((id) => !known.has(id));
  if (unknown) throw validationFailed(`Карточка «${unknown}» не найдена`);
}

function assertScenarioShape(body: Record<string, unknown>): asserts body is ScenarioCreateRequest {
  if (typeof body.title !== "string" || !body.title.trim()) {
    throw validationFailed("Укажите название сценария");
  }
  if (!isOneOf(LEVELS, body.level)) throw validationFailed("Некорректный уровень сценария");
  if (!isDifficulty(body.difficulty)) throw validationFailed("Сложность — целое число от 1 до 5");
  if (!isOneOf(SOURCES, body.source)) throw validationFailed("Некорректный источник сценария");
  if (typeof body.sourceTicketNo !== "number") throw validationFailed("Укажите номер билета-источника");
  assertCardIds(body.cardIds);
  const { timeNorms, hints, etalon, successCriteria } = body;
  const hasNorms =
    isRecord(timeNorms) &&
    typeof timeNorms.primaryReactionSec === "number" &&
    typeof timeNorms.fullProcessingSec === "number";
  if (!hasNorms) throw validationFailed("Укажите нормативы времени");
  if (!isRecord(hints) || typeof hints.enabled !== "boolean" || !isStringArray(hints.texts)) {
    throw validationFailed("Некорректные подсказки сценария");
  }
  if (!isRecord(etalon) || !isStringArray(etalon.expectedActions) || !isStringArray(etalon.keyPhrases)) {
    throw validationFailed("Заполните эталон: ожидаемые действия и ключевые фразы");
  }
  if (!isRecord(successCriteria) || typeof successCriteria.maxGrammarErrors !== "number") {
    throw validationFailed("Заполните критерии успешности");
  }
}

/** POST /scenarios — черновик: id "s-NNN" (продолжает нумерацию моков), validation.status = draft. */
export async function createScenario(httpRequest: Request): Promise<Scenario> {
  const body = await readJsonBody(httpRequest);
  assertScenarioShape(body);
  const scenario: Scenario = {
    id: nextMockId(MOCK_ID_PREFIX.scenario),
    title: body.title.trim(),
    level: body.level,
    sourceTicketNo: body.sourceTicketNo,
    cardIds: body.cardIds,
    timeNorms: body.timeNorms,
    hints: body.hints,
    difficulty: body.difficulty,
    etalon: body.etalon,
    validation: { status: "draft" },
    successCriteria: body.successCriteria,
    source: body.source,
  };
  if (typeof body.callTarget === "string" && body.callTarget.trim())
    scenario.callTarget = body.callTarget.trim();
  if (isOneOf(MODES, body.mode)) scenario.mode = body.mode;
  return insertStoredScenario(scenario);
}

/* ─── Чтение, правка и удаление (T3.1-10, T3.1-16, T3.1-17) ─────────────────────────────────────── */

/** GET /scenarios/[id] — сценарий с мутациями store; неизвестный id → 404. */
export function getScenario(scenarioId: string): Scenario {
  const scenario = findStoredScenario(scenarioId);
  if (!scenario) throw notFound(`Сценарий «${scenarioId}» не найден`);
  return scenario;
}

function parseTimeNorms(candidate: unknown): ScenarioTimeNorms {
  const isShape =
    isRecord(candidate) &&
    typeof candidate.primaryReactionSec === "number" &&
    typeof candidate.fullProcessingSec === "number";
  if (!isShape) throw validationFailed("Некорректные нормативы времени");
  const { primaryReactionSec, fullProcessingSec } = candidate as unknown as ScenarioTimeNorms;
  if (primaryReactionSec <= 0 || fullProcessingSec <= 0) {
    throw validationFailed("Нормативы времени — положительные значения в секундах");
  }
  return { primaryReactionSec, fullProcessingSec };
}

function parseEtalon(candidate: unknown): Etalon {
  if (!isRecord(candidate) || !isStringArray(candidate.expectedActions)) {
    throw validationFailed("Некорректный эталон: ожидаемая последовательность действий");
  }
  if (!isStringArray(candidate.keyPhrases)) throw validationFailed("Некорректные ключевые фразы эталона");
  const etalon: Etalon = { expectedActions: candidate.expectedActions, keyPhrases: candidate.keyPhrases };
  if (isRecord(candidate.expectedFields)) {
    etalon.expectedFields = candidate.expectedFields as Record<string, string>;
  }
  if (typeof candidate.expectedText === "string") etalon.expectedText = candidate.expectedText;
  return etalon;
}

function parseSuccessCriteria(candidate: unknown): SuccessCriteria {
  const isShape =
    isRecord(candidate) &&
    typeof candidate.maxGrammarErrors === "number" &&
    isStringArray(candidate.requiredFields) &&
    typeof candidate.syntaxRequirements === "string";
  if (!isShape) throw validationFailed("Некорректные критерии успешности");
  const criteria = candidate as unknown as SuccessCriteria;
  if (!Number.isInteger(criteria.maxGrammarErrors) || criteria.maxGrammarErrors < 0) {
    throw validationFailed("Порог грамматических ошибок — целое число не меньше 0");
  }
  return {
    maxGrammarErrors: criteria.maxGrammarErrors,
    requiredFields: [...criteria.requiredFields],
    syntaxRequirements: criteria.syntaxRequirements,
  };
}

/** PATCH /scenarios/[id] — правка параметров, эталона и критериев (только переданные поля) + аудит. */
export async function updateScenario(scenarioId: string, httpRequest: Request): Promise<Scenario> {
  if (!findStoredScenario(scenarioId)) throw notFound(`Сценарий «${scenarioId}» не найден`);
  const body = await readJsonBody(httpRequest);
  const teacher = requireTeacher(body.updatedBy, "updatedBy");
  const changed: string[] = [];
  const updated = updateStoredScenario(scenarioId, (draft) => {
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim()) {
        throw validationFailed("Укажите название сценария");
      }
      draft.title = body.title.trim();
      changed.push("название");
    }
    if (body.difficulty !== undefined) {
      if (!isDifficulty(body.difficulty)) throw validationFailed("Сложность — целое число от 1 до 5");
      draft.difficulty = body.difficulty;
      draft.level = toLevel(body.difficulty);
      changed.push(`сложность ${body.difficulty}`);
    }
    if (body.level !== undefined) {
      if (!isOneOf(LEVELS, body.level)) throw validationFailed("Некорректный уровень сценария");
      draft.level = body.level;
    }
    if (body.mode !== undefined) {
      if (!isOneOf(MODES, body.mode)) throw validationFailed("Некорректный режим сценария");
      draft.mode = body.mode;
      changed.push(`режим ${body.mode}`);
    }
    if (body.timeNorms !== undefined) {
      draft.timeNorms = parseTimeNorms(body.timeNorms);
      changed.push("тайминги");
    }
    if (body.etalon !== undefined) {
      draft.etalon = parseEtalon(body.etalon);
      changed.push("эталон");
    }
    if (body.successCriteria !== undefined) {
      draft.successCriteria = parseSuccessCriteria(body.successCriteria);
      changed.push("критерии успешности");
    }
  });
  if (!updated) throw notFound(`Сценарий «${scenarioId}» не найден`);
  const details = changed.length > 0 ? changed.join(", ") : "без изменений";
  auditTeacherAction(teacher.id, "scenario.update", `Изменён сценарий ${scenarioId}: ${details}`);
  return updated;
}

export type ScenarioDeleteBlock = "system" | "inSession";

/**
 * Правило удаления (ТЗ §8, spec/02-roles.md): преподаватель удаляет только неактуальные собственные
 * сценарии. Системные — 32 билета-шаблона (`source: 'template'`); используемые — попавшие в `Session.scenarioIds`.
 * null — удалять можно.
 */
export function getScenarioDeleteBlock(
  scenario: Scenario,
  sessionScenarioIds: readonly string[],
): ScenarioDeleteBlock | null {
  if (scenario.source === "template") return "system";
  if (sessionScenarioIds.includes(scenario.id)) return "inSession";
  return null;
}

export const SCENARIO_DELETE_BLOCK_MESSAGES: Record<ScenarioDeleteBlock, string> = {
  system: "Системные сценарии-шаблоны преподаватель удалять не может",
  inSession: "Сценарий назначен в занятие — удаление недоступно",
};

/** DELETE /scenarios/[id] — удаление неактуального сценария с записью в журнал аудита. */
export async function deleteScenario(scenarioId: string, httpRequest: Request): Promise<Scenario> {
  const scenario = getScenario(scenarioId);
  const params = new URL(httpRequest.url).searchParams;
  const teacher = requireTeacher(readStringParam(params, "deletedBy"), "deletedBy");
  const sessionScenarioIds = listStoredSessions().flatMap((session) => session.scenarioIds);
  const block = getScenarioDeleteBlock(scenario, sessionScenarioIds);
  if (block) throw conflict(SCENARIO_DELETE_BLOCK_MESSAGES[block]);
  removeStoredScenario(scenarioId);
  auditTeacherAction(
    teacher.id,
    "scenario.delete",
    `Удалён сценарий ${scenarioId} «${scenario.title}» (${scenario.source})`,
  );
  return scenario;
}

/* ─── Мок-генерация через AiGateway (T3.1-06) ───────────────────────────────────────────────────── */

const GENERATED_CARD_LIMIT = 2;

/** Карточки группы ЕКП — очередь сгенерированного сценария (у мок-шлюза своих карточек нет). */
function cardIdsForGroup(group: string): string[] {
  return readCards()
    .filter((card) => card.group === group)
    .slice(0, GENERATED_CARD_LIMIT)
    .map((card) => card.id);
}

/**
 * POST /scenarios/generate — 2–3 вариации по группе ЕКП со статусом `pending` и `source: 'generated'`.
 * Генерация целиком в адаптере AiGateway (ИИ-модуль: заменить на реальный сервис); мок-слой присваивает
 * id по конвенции `s-NNN` и подставляет карточки группы. Повторный вызов по той же категории
 * детерминирован и не плодит дубли: сценарии с теми же названиями возвращаются как есть.
 */
export async function generateScenarios(gateway: AiGateway, httpRequest: Request): Promise<Scenario[]> {
  const body = await readJsonBody(httpRequest);
  const category = typeof body.category === "string" ? body.category.trim() : "";
  if (!category) throw validationFailed("Выберите категорию событий (группу ЕКП)");
  const teacher = requireTeacher(body.requestedBy, "requestedBy");
  const generated = (await gateway.generateScenario(category)).data;
  const existing = listStoredScenarios();
  const cardIds = cardIdsForGroup(category);
  const saved = generated.map((scenario) => {
    const twin = existing.find(
      (candidate) => candidate.source === "generated" && candidate.title === scenario.title,
    );
    if (twin) return twin;
    return insertStoredScenario({
      ...scenario,
      id: nextMockId(MOCK_ID_PREFIX.scenario),
      cardIds: scenario.cardIds.length > 0 ? scenario.cardIds : cardIds,
      validation: { status: "pending" },
      source: "generated",
    });
  });
  auditTeacherAction(
    teacher.id,
    "scenario.generate",
    `Сгенерировано сценариев (ИИ, мок): ${saved.length} по категории «${category}»`,
  );
  return saved;
}

/* ─── Валидация эталона ─────────────────────────────────────────────────────────────────────────── */

const VALIDATE_ACTIONS: readonly ScenarioValidateAction[] = ["approve", "approvePartial", "reject", "submit"];

/** Допустимые исходные статусы действия (иначе 409 invalidTransition). */
const ACTION_FROM: Record<ScenarioValidateAction, readonly ScenarioValidationStatus[]> = {
  submit: ["draft", "rejected", "approved"],
  approve: ["pending"],
  approvePartial: ["pending"],
  reject: ["pending"],
};

const ACTION_TO: Record<ScenarioValidateAction, ScenarioValidationStatus> = {
  submit: "pending",
  approve: "approved",
  approvePartial: "approved",
  reject: "rejected",
};

interface ValidateInput {
  action: ScenarioValidateAction;
  reviewedBy: string;
  comment?: string;
  fields?: string[];
}

function parseValidateInput(body: Record<string, unknown>): ValidateInput {
  if (!isOneOf(VALIDATE_ACTIONS, body.action)) throw validationFailed("Некорректное действие валидации");
  const reviewer = typeof body.reviewedBy === "string" ? findStoredUser(body.reviewedBy) : undefined;
  if (reviewer?.role !== "teacher") throw validationFailed("Проверяющий должен быть преподавателем");
  if (body.comment !== undefined && typeof body.comment !== "string") {
    throw validationFailed("Комментарий должен быть строкой");
  }
  const input: ValidateInput = { action: body.action, reviewedBy: reviewer.id };
  if (body.comment?.trim()) input.comment = body.comment.trim();
  if (body.action !== "approvePartial") return input;
  if (!isStringArray(body.fields) || body.fields.length === 0) {
    throw validationFailed("Для частичного утверждения выберите поля эталона");
  }
  return { ...input, fields: body.fields };
}

/** POST /scenarios/[id]/validate — смена validation.status с записью reviewedBy/comment (/approvedFields). */
export async function validateScenario(scenarioId: string, httpRequest: Request): Promise<Scenario> {
  const current = findStoredScenario(scenarioId);
  if (!current) throw notFound(`Сценарий «${scenarioId}» не найден`);
  const input = parseValidateInput(await readJsonBody(httpRequest));
  if (!ACTION_FROM[input.action].includes(current.validation.status)) {
    const message = `Действие «${input.action}» недоступно для сценария в статусе «${current.validation.status}»`;
    throw new MockApiError(HTTP_STATUS.conflict, "invalidTransition", message);
  }
  const updated = updateStoredScenario(scenarioId, (draft) => {
    draft.validation = { status: ACTION_TO[input.action], reviewedBy: input.reviewedBy };
    if (input.comment) draft.validation.comment = input.comment;
    if (input.fields) draft.validation.approvedFields = input.fields;
  });
  if (!updated) throw notFound(`Сценарий «${scenarioId}» не найден`);
  auditTeacherAction(
    input.reviewedBy,
    `scenario.${input.action}`,
    [
      `Сценарий ${scenarioId} → «${updated.validation.status}»`,
      input.fields ? `поля: ${input.fields.join(", ")}` : "",
      input.comment ? `комментарий: ${input.comment}` : "",
    ]
      .filter(Boolean)
      .join("; "),
  );
  return updated;
}
