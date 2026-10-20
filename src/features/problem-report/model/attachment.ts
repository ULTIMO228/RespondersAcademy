/*
 * Проверка вложения в окне «Сообщить о проблеме» до отправки (спека 009, FR-030): png или jpeg не больше 2 МБ.
 * Окончательную проверку (включая сигнатуру файла) делает сервер; здесь — быстрая обратная связь ученику.
 */

export const ATTACHMENT_TYPES = ["image/png", "image/jpeg"] as const;
export const ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;

export const ATTACHMENT_TYPE_MESSAGE = "Вложение — изображение в формате png или jpeg";
export const ATTACHMENT_SIZE_MESSAGE = "Вложение — не больше 2 МБ";

/** Текст ошибки для файла или `null`, если файл подходит. */
export function attachmentError(file: Pick<File, "type" | "size">): string | null {
  if (!(ATTACHMENT_TYPES as readonly string[]).includes(file.type)) return ATTACHMENT_TYPE_MESSAGE;
  if (file.size > ATTACHMENT_MAX_BYTES) return ATTACHMENT_SIZE_MESSAGE;
  return null;
}
