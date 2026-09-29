/*
 * Автономный режим версионируемых AI-сценариев (app/api/v1/ai/scenarios/**, фронт без BACKEND_URL).
 * Имитация workflow бэкенда «черновик → правка полей → утверждение» на синтетических учебных карточках
 * (mocks/cards.json): «очищенным билетом» служит id учебной карточки (например, c-010). Реальной генерации
 * ИИ нет: поля версии — детерминированная выжимка карточки, метка автономного режима — в etalonVersion.
 * Права как у бэкенда: операции — преподавателю и администратору; версию преподавателя правит и утверждает автор.
 */
import { STANDALONE_AI_RELEASE } from "../ai-standalone-marker";
import type {
  AIFieldDecision,
  AIFieldDecisionInput,
  AIScenarioDraftRequest,
  AIScenarioVersion,
  AIValidationError,
  AIWorkflowMode,
  IncidentCard,
} from "../types";
import { readCards } from "./readers";
import { isRecord, readJsonBody } from "./request";
import { conflict, forbidden, notFound, unauthorized, validationFailed } from "./respond";
import {
  findStoredAiRequest,
  insertStoredAiVersion,
  listStoredAiVersions,
  nextAiScenarioId,
  replaceStoredAiVersion,
  saveStoredAiRequest,
} from "./store-ai";
import { nowIso } from "./time";
import type { MockViewer } from "./viewer";

const SESSION_REQUIRED = "Войдите в систему, чтобы просмотреть AI-ресурсы";
const TEACHER_ONLY = "Операции с версиями доступны преподавателю или администратору";
const NO_ACCESS = "Нет доступа к сценарию";
const MAX_SUMMARY_LENGTH = 1999;
const MAX_DRAFT_COUNT = 5;
const CLASSIFIER_VERSION = "v046_24";
const RULE_SOURCE_ID = `ekp:${CLASSIFIER_VERSION}`;
const MODES: readonly AIWorkflowMode[] = ["operator112", "dds"];

function requireTeacher(viewer: MockViewer | null): MockViewer {
  if (!viewer) throw unauthorized(SESSION_REQUIRED);
  if (viewer.role === "student") throw forbidden(TEACHER_ONLY);
  return viewer;
}

function readRequiredString(body: Record<string, unknown>, key: string, maxLength: number): string {
  const value = typeof body[key] === "string" ? (body[key] as string).trim() : "";
  if (!value || value.length > maxLength) throw validationFailed(`Некорректное поле «${key}»`);
  return value;
}

/** FNV-1a по строке → 64 hex-символа (метка происхождения; криптостойкость мока не нужна). */
function fingerprint(source: string): string {
  let hash = 0x811c9dc5;
  let out = "";
  for (let round = 0; round < 8; round += 1) {
    for (const char of `${round}:${source}`) {
      hash ^= char.codePointAt(0) ?? 0;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    out += hash.toString(16).padStart(8, "0");
  }
  return out;
}

function validateFields(fields: Record<string, unknown>): AIValidationError[] {
  const errors: AIValidationError[] = [];
  const summary = fields.summary;
  if (typeof summary !== "string" || !summary.trim()) {
    errors.push({ fieldPath: "summary", code: "required", message: "Фабула карточки не заполнена" });
  } else if (summary.length > MAX_SUMMARY_LENGTH) {
    errors.push({
      fieldPath: "summary",
      code: "too_long",
      message: `Фабула длиннее ${MAX_SUMMARY_LENGTH} символов`,
    });
  }
  if (typeof fields.address !== "string" || !fields.address.trim()) {
    errors.push({ fieldPath: "address", code: "required", message: "Адрес карточки не заполнен" });
  }
  return errors;
}

/** Поле карточки по пути через точку («caller.status»); вложенные объекты копируются, исходник не мутируется. */
function setFieldByPath(fields: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let target = fields;
  for (const key of keys.slice(0, -1)) {
    const next = isRecord(target[key]) ? { ...(target[key] as Record<string, unknown>) } : {};
    target[key] = next;
    target = next;
  }
  target[keys[keys.length - 1]] = value;
}

function buildEtalon(card: IncidentCard, fields: Record<string, unknown>): AIScenarioVersion["etalon"] {
  return {
    expectedFields: { group: card.group, services: card.expectedServices, tags: card.expectedTags },
    expectedActions: card.expectedServices.map((service) => ({
      action: `notify:${service}`,
      sourceRef: [`card:${card.id}`],
    })),
    semanticFacts: [{ id: `${card.id}-summary`, text: String(fields.summary ?? "") }],
    ruleSourceIds: [RULE_SOURCE_ID],
    classifierVersion: CLASSIFIER_VERSION,
  };
}

function buildDraft(
  card: IncidentCard,
  mode: AIWorkflowMode,
  scenarioId: string,
  createdBy: string,
): AIScenarioVersion {
  const fields: Record<string, unknown> = {
    summary: card.summary,
    address: card.addressRefined ?? card.address,
    group: card.group,
    caller: { status: card.caller.status },
    expectedServices: card.expectedServices,
    expectedTags: card.expectedTags,
  };
  const validationErrors = validateFields(fields);
  const etalon = buildEtalon(card, fields);
  return {
    schemaVersion: "ai-workflow/1",
    scenarioId,
    version: 1,
    mode,
    sourceTicketId: card.id,
    sourceSituationNo: card.situationNo,
    sourceKind: "template",
    sourceHash: fingerprint(JSON.stringify(card)),
    validation: validationErrors.length ? "failed" : "passed",
    validationErrors,
    approval: validationErrors.length ? "validation_failed" : "draft",
    cardSnapshot: { id: `aic-${scenarioId.replace(/^ais-/, "")}`, fields },
    etalonVersion: `${STANDALONE_AI_RELEASE}:${createdBy}`,
    ruleSourceIds: etalon.ruleSourceIds,
    semanticFacts: etalon.semanticFacts,
    classifierVersion: CLASSIFIER_VERSION,
    etalon,
    fieldDecisions: [],
  };
}

function replayOrCompute<TResponse>(key: string, compute: () => TResponse): TResponse {
  const cached = findStoredAiRequest<TResponse>(key);
  return cached ?? saveStoredAiRequest(key, compute());
}

/** POST /ai/scenarios/drafts → 201 + версии 1 новых сценариев. */
export async function createAiScenarioDrafts(
  request: Request,
  viewerOrNull: MockViewer | null,
): Promise<AIScenarioVersion[]> {
  const viewer = requireTeacher(viewerOrNull);
  const body = await readJsonBody(request);
  const mode = body.mode as AIScenarioDraftRequest["mode"];
  if (!MODES.includes(mode)) throw validationFailed("Режим — operator112 или dds");
  const sourceTicketId = readRequiredString(body, "sourceTicketId", 64);
  const category = readRequiredString(body, "category", 160);
  const requestId = readRequiredString(body, "requestId", 128);
  const count = body.count === undefined ? 1 : body.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > MAX_DRAFT_COUNT) {
    throw validationFailed(`«count» — целое число от 1 до ${MAX_DRAFT_COUNT}`);
  }
  const card = readCards().find((candidate) => candidate.id === sourceTicketId);
  if (!card) {
    throw notFound(
      `Очищенный билет «${sourceTicketId}» не найден (автономный режим: укажите id учебной карточки, например c-010)`,
    );
  }
  if (card.group.toLowerCase() !== category.toLowerCase()) {
    throw validationFailed(`Категория «${category}» не совпадает с группой билета «${card.group}»`);
  }
  return replayOrCompute(`drafts:${viewer.userId}:${requestId}`, () =>
    Array.from({ length: count }, () => {
      const draft = buildDraft(card, mode, nextAiScenarioId(), viewer.userId);
      return insertStoredAiVersion(viewer.userId, draft);
    }),
  );
}

function requireOwnVersions(scenarioId: string, viewer: MockViewer) {
  const entries = listStoredAiVersions(scenarioId);
  if (!entries.length) throw notFound(`Версии сценария «${scenarioId}» не найдены`);
  if (viewer.role !== "admin" && entries[0].createdBy !== viewer.userId) throw forbidden(NO_ACCESS);
  return entries;
}

function readDecisions(value: unknown): AIFieldDecisionInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw validationFailed("Укажите решения по полям в «acceptedFields»");
  }
  return value.map((item) => {
    const decision = isRecord(item) ? item.decision : undefined;
    const fieldPath = isRecord(item) && typeof item.fieldPath === "string" ? item.fieldPath.trim() : "";
    if (!fieldPath || (decision !== "accepted" && decision !== "edited" && decision !== "rejected")) {
      throw validationFailed("Решение по полю: «fieldPath» и «decision» (accepted, edited, rejected)");
    }
    if (decision === "edited" && !("value" in (item as Record<string, unknown>))) {
      throw validationFailed("Для решения edited укажите value");
    }
    return { fieldPath, decision, value: (item as Record<string, unknown>).value };
  });
}

/** POST /ai/scenarios/[id]/revise → 201 + новая версия (base + решения преподавателя). */
export async function reviseAiScenario(
  scenarioId: string,
  request: Request,
  viewerOrNull: MockViewer | null,
): Promise<AIScenarioVersion> {
  const viewer = requireTeacher(viewerOrNull);
  const body = await readJsonBody(request);
  const requestId = readRequiredString(body, "requestId", 128);
  const baseVersion = body.baseVersion;
  if (typeof baseVersion !== "number" || !Number.isInteger(baseVersion) || baseVersion < 1) {
    throw validationFailed("«baseVersion» — номер версии, целое число от 1");
  }
  const decisions = readDecisions(body.acceptedFields);
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  const entries = requireOwnVersions(scenarioId, viewer);
  return replayOrCompute(`revise:${scenarioId}:${requestId}`, () => {
    const latest = entries[entries.length - 1].version;
    if (baseVersion !== latest.version) {
      throw conflict(`Устаревшая baseVersion: текущая версия сценария — ${latest.version}`);
    }
    const fields = structuredClone(latest.cardSnapshot.fields);
    for (const item of decisions) {
      if (item.decision === "edited") setFieldByPath(fields, item.fieldPath, item.value);
    }
    const validationErrors = validateFields(fields);
    const at = nowIso();
    const fieldDecisions: AIFieldDecision[] = decisions.map((item) => ({
      fieldPath: item.fieldPath,
      decision: item.decision,
      ...(item.decision === "edited" ? { value: item.value } : {}),
      teacherId: viewer.userId,
      at,
      ...(comment ? { comment } : {}),
    }));
    const revised: AIScenarioVersion = {
      ...structuredClone(latest),
      version: latest.version + 1,
      parentVersion: latest.version,
      validation: validationErrors.length ? "failed" : "passed",
      validationErrors,
      approval: validationErrors.length ? "validation_failed" : "draft",
      cardSnapshot: { id: latest.cardSnapshot.id, fields },
      fieldDecisions,
      ...(comment ? { teacherComment: comment } : {}),
    };
    delete revised.approvedBy;
    return insertStoredAiVersion(entries[0].createdBy, revised);
  });
}

/** POST /ai/scenarios/[id]/approve → версия со статусом approved (идемпотентно). */
export async function approveAiScenario(
  scenarioId: string,
  request: Request,
  viewerOrNull: MockViewer | null,
): Promise<AIScenarioVersion> {
  const viewer = requireTeacher(viewerOrNull);
  const body = await readJsonBody(request);
  readRequiredString(body, "requestId", 128);
  const versionNumber = body.version;
  if (typeof versionNumber !== "number" || !Number.isInteger(versionNumber) || versionNumber < 1) {
    throw validationFailed("«version» — номер версии, целое число от 1");
  }
  const entries = requireOwnVersions(scenarioId, viewer);
  const target = entries.find((entry) => entry.version.version === versionNumber)?.version;
  if (!target) throw notFound(`Версия ${versionNumber} сценария «${scenarioId}» не найдена`);
  if (target.approval === "approved") return target;
  if (target.validation !== "passed") {
    throw conflict("Утвердить можно только версию, прошедшую структурную проверку");
  }
  return replaceStoredAiVersion({ ...target, approval: "approved", approvedBy: viewer.userId });
}

/** GET /ai/scenarios/[id]/versions; сценарий без AI-версий — пустой список (панель покажет «нет версий»). */
export function listAiScenarioVersionsFor(
  scenarioId: string,
  viewerOrNull: MockViewer | null,
): AIScenarioVersion[] {
  const viewer = requireTeacher(viewerOrNull);
  const entries = listStoredAiVersions(scenarioId);
  if (entries.length && viewer.role !== "admin" && entries[0].createdBy !== viewer.userId) {
    throw forbidden(NO_ACCESS);
  }
  return entries.map((entry) => entry.version);
}
