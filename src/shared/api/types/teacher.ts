/*
 * Контракты конструктора сценариев преподавателя (фаза 3.1): учебные материалы-заглушки (ТЗ §12),
 * таблица профильных категорий (spec/04-pages/11 «Профильные категории обучающихся»), правка и
 * генерация сценариев, принудительная проверка грамматики (сценарий А шаги 2, 5, 7–9).
 * Сид-данных в mocks/ для материалов и привязки нет — состояние создаёт in-memory store мок-слоя.
 */
import type { Etalon, Scenario, ScenarioTimeNorms, SuccessCriteria } from "./scenario";
import type { ScenarioMode } from "./session";

/** Форматы файлов-заглушек учебных материалов (ТЗ §12). */
export type MaterialFormat = "DOCX" | "PDF" | "MP3";

export interface TrainingMaterial {
  /** "mat-001" */
  id: string;
  name: string;
  format: MaterialFormat;
  sizeBytes: number;
  /** userId преподавателя. */
  uploadedBy: string;
  /** ISO 8601 с московским смещением. */
  uploadedAt: string;
}

/** POST /api/mock/materials — приём файла-заглушки (содержимое не обрабатывается). */
export interface MaterialUploadRequest {
  name: string;
  sizeBytes?: number;
  uploadedBy: string;
}

/** Строка таблицы привязки «служба/группа курсантов → профильные группы ЕКП». */
export interface ProfileMappingRow {
  id: string;
  /** User.service курсанта. */
  profile: string;
  /** Учебная группа (User.group), если профиль закреплён за одной группой. */
  groupName?: string;
  incidentGroups: string[];
  /** ServiceRef.id служб-получателей. */
  serviceIds: string[];
  /** Сколько курсантов с этим User.service (считает мок-слой по users.json). */
  studentCount: number;
}

/** PUT /api/mock/profile-mapping — сохранение привязки (пишется в журнал аудита). */
export interface ProfileMappingSaveRequest {
  rows: { id: string; incidentGroups: string[] }[];
  /** userId преподавателя. */
  savedBy: string;
}

/** PATCH /api/mock/scenarios/[id] — правка параметров, эталона и критериев успешности. */
export interface ScenarioUpdateRequest {
  title?: string;
  difficulty?: Scenario["difficulty"];
  level?: Scenario["level"];
  mode?: ScenarioMode;
  timeNorms?: ScenarioTimeNorms;
  etalon?: Etalon;
  successCriteria?: SuccessCriteria;
  /** userId преподавателя — для записи в журнал аудита. */
  updatedBy: string;
}

/** POST /api/mock/scenarios/generate — мок-генерация 2–3 вариаций по группе ЕКП через AiGateway. */
export interface ScenarioGenerateRequest {
  /** Группа происшествий ЕКП (reference.incidentGroups). */
  category: string;
  /** userId преподавателя. */
  requestedBy: string;
}

/** POST /api/mock/grammar-check — принудительная проверка после ручных правок (сценарий А шаг 9). */
export interface GrammarCheckRequest {
  text: string;
  /** Подпись проверяемого поля (по умолчанию — "text"). */
  field?: string;
}
