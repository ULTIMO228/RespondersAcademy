/*
 * Конструктор сценариев преподавателя (фаза 3.1): учебные материалы-заглушки, таблица профильных
 * категорий и список учебных карточек для редактора.
 *
 * Материалы (T3.1-07, ТЗ §12): содержимое файла не читается и не хранится — мок принимает имя, определяет
 * формат по расширению (DOCX/PDF/MP3) и кладёт запись в store; неподдерживаемый тип → 400 validationFailed.
 * Привязка профилей (T3.1-09): строки заданы сидом (shared/config → PROFILE_MAPPING_SEED), преподаватель
 * меняет только набор групп ЕКП; сохранение фиксируется записью AuditLogEntry.
 */
import type {
  AuditLogEntry,
  IncidentCard,
  MaterialFormat,
  ProfileMappingRow,
  TrainingMaterial,
} from "../types";
import { readCards, readReference } from "./readers";
import { isRecord, readJsonBody } from "./request";
import { notFound, validationFailed } from "./respond";
import { appendAuditEntry, findStoredUser } from "./store-admin";
import { MOCK_ID_PREFIX, nextMockId } from "./store";
import { insertStoredMaterial, listStoredMaterials, listStoredProfileMapping } from "./store-teacher";
import { saveStoredProfileMapping } from "./store-teacher";
import { nowIso } from "./time";

const MATERIAL_FORMATS: Record<string, MaterialFormat> = { docx: "DOCX", pdf: "PDF", mp3: "MP3" };
const SUPPORTED_EXTENSIONS = Object.keys(MATERIAL_FORMATS)
  .map((extension) => extension.toUpperCase())
  .join(", ");
const DEFAULT_MATERIAL_SIZE_BYTES = 0;

/** Формат файла-заглушки по расширению имени; неизвестное расширение → null. */
export function resolveMaterialFormat(name: string): MaterialFormat | null {
  const extension = name.trim().toLowerCase().split(".").pop() ?? "";
  return MATERIAL_FORMATS[extension] ?? null;
}

/** Преподаватель-автор действия (аудит требует userId и роль); иначе 400 validationFailed. */
export function requireTeacher(userId: unknown, field: string) {
  const user = typeof userId === "string" ? findStoredUser(userId) : undefined;
  if (user?.role !== "teacher") throw validationFailed(`Поле «${field}» — userId преподавателя`);
  return user;
}

/** Запись в мок-журнал аудита от имени преподавателя (ТЗ §8: кем/когда/что). */
export function auditTeacherAction(userId: string, action: string, details: string): AuditLogEntry {
  return appendAuditEntry({ userId, role: "teacher", action, details });
}

/* ─── Учебные материалы ─────────────────────────────────────────────────────────────────────────── */

export function listMaterials(): TrainingMaterial[] {
  return listStoredMaterials();
}

/** POST /materials — приём файла-заглушки DOCX/PDF/MP3 (содержимое не обрабатывается). */
export async function uploadMaterial(httpRequest: Request): Promise<TrainingMaterial> {
  const body = await readJsonBody(httpRequest);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw validationFailed("Укажите имя файла материала");
  const format = resolveMaterialFormat(name);
  if (!format)
    throw validationFailed(`Неподдерживаемый тип файла «${name}»: допустимо ${SUPPORTED_EXTENSIONS}`);
  if (body.sizeBytes !== undefined && (typeof body.sizeBytes !== "number" || body.sizeBytes < 0)) {
    throw validationFailed("Размер файла — неотрицательное число байт");
  }
  const teacher = requireTeacher(body.uploadedBy, "uploadedBy");
  const material: TrainingMaterial = {
    id: nextMockId(MOCK_ID_PREFIX.material),
    name,
    format,
    sizeBytes: body.sizeBytes ?? DEFAULT_MATERIAL_SIZE_BYTES,
    uploadedBy: teacher.id,
    uploadedAt: nowIso(),
  };
  auditTeacherAction(teacher.id, "material.upload", `Загружен учебный материал «${name}» (${format})`);
  return insertStoredMaterial(material);
}

/* ─── Профильные категории ──────────────────────────────────────────────────────────────────────── */

export function listProfileMapping(): ProfileMappingRow[] {
  return listStoredProfileMapping();
}

function parseMappingRows(body: Record<string, unknown>): { id: string; incidentGroups: string[] }[] {
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    throw validationFailed("Передайте строки привязки профильных категорий");
  }
  const known = new Set(listStoredProfileMapping().map((row) => row.id));
  const groups = new Set(readReference().incidentGroups);
  return body.rows.map((raw) => {
    if (!isRecord(raw) || typeof raw.id !== "string" || !known.has(raw.id)) {
      throw notFound("Профиль обучающихся не найден");
    }
    if (!Array.isArray(raw.incidentGroups) || raw.incidentGroups.some((item) => typeof item !== "string")) {
      throw validationFailed(`Некорректные группы ЕКП профиля «${raw.id}»`);
    }
    const incidentGroups = raw.incidentGroups as string[];
    const unknownGroup = incidentGroups.find((group) => !groups.has(group));
    if (unknownGroup) throw validationFailed(`Группа происшествий «${unknownGroup}» не найдена`);
    return { id: raw.id, incidentGroups };
  });
}

/** PUT /profile-mapping — сохранение привязки: строки сида, изменяются только группы ЕКП + аудит. */
export async function saveProfileMapping(httpRequest: Request): Promise<ProfileMappingRow[]> {
  const body = await readJsonBody(httpRequest);
  const teacher = requireTeacher(body.savedBy, "savedBy");
  const rows = parseMappingRows(body);
  const saved = saveStoredProfileMapping(rows);
  const details = rows.map((row) => `${row.id}: ${row.incidentGroups.length} гр.`).join("; ");
  auditTeacherAction(
    teacher.id,
    "profileMapping.save",
    `Сохранена привязка профильных категорий — ${details}`,
  );
  return saved;
}

/* ─── Учебные карточки ──────────────────────────────────────────────────────────────────────────── */

/** GET /training-cards — 96 учебных карточек (билет.ситуация) с группой ЕКП и эталонными тегами. */
export function listTrainingCards(): IncidentCard[] {
  return readCards().map((card) => structuredClone(card));
}
