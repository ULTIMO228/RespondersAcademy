import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_SIZE_MESSAGE,
  ATTACHMENT_TYPE_MESSAGE,
  attachmentError,
} from "./attachment";

describe("проверка вложения «Сообщить о проблеме»", () => {
  it("png и jpeg до 2 МБ включительно — без ошибки", () => {
    expect(attachmentError({ type: "image/png", size: 1024 })).toBeNull();
    expect(attachmentError({ type: "image/jpeg", size: ATTACHMENT_MAX_BYTES })).toBeNull();
  });

  it("другой тип (лог, gif) — ошибка типа, даже если файл маленький", () => {
    expect(attachmentError({ type: "text/plain", size: 10 })).toBe(ATTACHMENT_TYPE_MESSAGE);
    expect(attachmentError({ type: "image/gif", size: 10 })).toBe(ATTACHMENT_TYPE_MESSAGE);
    expect(attachmentError({ type: "", size: 10 })).toBe(ATTACHMENT_TYPE_MESSAGE);
  });

  it("больше 2 МБ на один байт — ошибка размера", () => {
    expect(attachmentError({ type: "image/png", size: ATTACHMENT_MAX_BYTES + 1 })).toBe(
      ATTACHMENT_SIZE_MESSAGE,
    );
  });
});
