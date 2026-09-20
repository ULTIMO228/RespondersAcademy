/* Учебные материалы (ТЗ §12) и принудительная проверка грамматики (сценарий А шаги 8–9). */
import type { MaterialFormat } from "@/shared/api";

/** Расширения файлов-заглушек, которые принимает мок-слой (`POST /api/mock/materials`). */
export const MATERIAL_ACCEPT = ".docx,.pdf,.mp3";

export const MATERIAL_FORMAT_HINT = "Поддерживаются DOCX, PDF и MP3; содержимое файла не обрабатывается.";

export const MATERIAL_FORMATS: MaterialFormat[] = ["DOCX", "PDF", "MP3"];

const BYTES_IN_KB = 1024;
const KB_IN_MB = 1024;
const MB_FRACTION_DIGITS = 1;

/** Размер файла по-русски: «184 КБ», «2,1 МБ». */
export function formatFileSize(sizeBytes: number): string {
  if (sizeBytes <= 0) return "—";
  const kb = sizeBytes / BYTES_IN_KB;
  if (kb < KB_IN_MB) return `${Math.max(1, Math.round(kb))} КБ`;
  return `${(kb / KB_IN_MB).toFixed(MB_FRACTION_DIGITS).replace(".", ",")} МБ`;
}

/** Типы грамматических ошибок (Evaluation.grammarErrors) — русские подписи. */
export const GRAMMAR_TYPE_TITLES: Record<string, string> = {
  spelling: "орфография",
  syntax: "синтаксис",
};

export const GRAMMAR_CHECK_FIELD = "Эталонная формулировка (после ручной правки)";

/** Текст-образец с типовыми опечатками ручного ввода — стартовое значение поля проверки. */
export const GRAMMAR_SAMPLE_TEXT =
  "сообщение пренято, дежурная бригадда напрвлена на адресс  утечка топлива, 3 пострадавщих";
