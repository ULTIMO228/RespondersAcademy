/*
 * Карта ошибок — контракт /api/v1/error-map/* и /api/v1/me/focus (спека 003; backend/app/schemas/error_map.py,
 * spec/003-error-map/contracts/error-map-endpoints.md). Опциональные поля — `?`; обязательные nullable — `| null`.
 */

export type ErrorMapMode = "operator112" | "dds";
export type ErrorMapPeriod = "2w" | "1m" | "all";
export type StageLevelWord = "rare" | "sometimes" | "often" | "noData";
export type StageComparison = "better" | "same" | "worse";
export type ErrorMapSeverity = "critical" | "major" | "minor";
/** Фактический источник текста; `ai` поддерживается только для старых ответов. */
export type ExplanationSource = "cloud" | "local" | "template" | "ai";
/** Временная совместимость с ответами предыдущей версии API; новые ответы кодируют это в `source`. */
export type ExplanationSourceKind = "cloud" | "local" | "template";
/** Исторический источник в API записи вердикта: новая облачная/локальная модель по-прежнему записывается как `ai`. */
export type ExplanationVerdictSource = "ai" | "template";
export type VerdictKind = "agree" | "disagree";
export type HeadlineKind = "problems" | "clean" | "noData";
export type ScopeKind = "group" | "student";

export interface ErrorMapGroup {
  groupId: string;
  title: string;
  studentCount: number;
}

export interface ErrorMapStage {
  id: string;
  order: number;
  title: string;
  articleId?: string;
}

export interface ErrorMapStageLevel {
  stageId: string;
  attempts: number;
  attemptsWithError: number;
  /** null при noData (серая плитка). */
  share: number | null;
  level: StageLevelWord;
  /** Только для карты обучающегося. */
  comparison?: StageComparison;
  affectedStudents: number;
}

export interface ErrorMapScope {
  kind: ScopeKind;
  groupId: string;
  studentId?: string;
  title: string;
}

export interface ErrorMapHeadline {
  kind: HeadlineKind;
  stageIds: string[];
  text: string;
}

export interface ErrorMapResponse {
  scope: ErrorMapScope;
  mode: ErrorMapMode;
  period: ErrorMapPeriod;
  attempts: number;
  /** Включая "other", если на нём есть ошибки. */
  stages: ErrorMapStage[];
  levels: ErrorMapStageLevel[];
  headline: ErrorMapHeadline;
  /** ISO 8601, МСК. */
  generatedAt: string;
}

export interface ErrorMapStudentRef {
  id: string;
  name: string;
}

export interface ErrorMapTypicalError {
  ruleId: string;
  plainText: string;
  severity: ErrorMapSeverity;
  studentCount: number;
  students: ErrorMapStudentRef[];
  exampleAttemptId?: string;
  exampleSessionId?: string;
}

export interface ErrorMapChainLink {
  from: string;
  to: string;
  caption: string;
}

export interface ErrorMapExplanation {
  /** 1–2 фразы. */
  text: string;
  /** Фактический источник текста; старое `ai` остаётся допустимым для сохранённых ответов. */
  source: ExplanationSource;
  textHash: string;
  /** Текущий вердикт этого преподавателя. */
  verdict?: VerdictKind;
  /** Устаревшее уточнение к `source: "ai"`, пока фронт совместим со старой версией API. */
  sourceKind?: ExplanationSourceKind;
  /** Модель, давшая текст; у шаблона нет. */
  model?: string;
}

export interface ErrorMapStageDetail {
  stage: ErrorMapStage;
  level: ErrorMapStageLevel;
  /** ≤ 3. */
  typicalErrors: ErrorMapTypicalError[];
  /** Связи, исходящие из этапа. */
  chain: ErrorMapChainLink[];
  /** null при noData. */
  explanation: ErrorMapExplanation | null;
}

export interface ErrorMapJournalRow {
  studentId: string;
  name: string;
  attempts: number;
  levels: ErrorMapStageLevel[];
}

export interface ErrorMapJournalResponse {
  mode: ErrorMapMode;
  period: ErrorMapPeriod;
  groupId: string;
  stages: ErrorMapStage[];
  rows: ErrorMapJournalRow[];
}

export interface ErrorMapVerdictRequest {
  groupId: string;
  studentId?: string;
  mode: ErrorMapMode;
  period: ErrorMapPeriod;
  stageId: string;
  textHash: string;
  source: ExplanationVerdictSource;
  verdict: VerdictKind;
}

export interface MyFocusItem {
  stageId: string;
  title: string;
  hint: string;
  articleId?: string;
}

export interface MyFocusResponse {
  mode: ErrorMapMode | null;
  /** ≤ 3. */
  items: MyFocusItem[];
  /** «Пока замечаний нет» / «Пройдите ещё несколько тренировок…». */
  message?: string;
}

export interface ErrorMapSettings {
  sometimesFrom: number;
  oftenFrom: number;
  minAttemptsGroup: number;
  minAttemptsStudent: number;
  sameBandPoints: number;
}
