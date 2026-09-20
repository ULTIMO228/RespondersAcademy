import { describe, expect, it } from "vitest";

import { buildImagePdf } from "./certificate-pdf";

const decoder = new TextDecoder("latin1");
/** Маркеры начала/конца JPEG (SOI/EOI) + условное тело — для проверки вложения без canvas. */
const FAKE_JPEG = Uint8Array.from([0xff, 0xd8, 0x01, 0x02, 0x03, 0xff, 0xd9]);

describe("buildImagePdf (сертификат-заглушка)", () => {
  const pdf = buildImagePdf(FAKE_JPEG, 1684, 1190);
  const text = decoder.decode(pdf);

  it("валидная структура PDF 1.4 с JPEG-изображением на листе A4", () => {
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Filter /DCTDecode /Length 7");
    expect(text).toContain("/Width 1684 /Height 1190");
    expect(text).toContain("/MediaBox [0 0 842 595]");
  });

  it("таблица xref указывает точно на объекты, startxref — на xref", () => {
    const startXref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(startXref, startXref + 4)).toBe("xref");
    const offsets = [...text.matchAll(/(\d{10}) 00000 n /g)].map((match) => Number(match[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((offset, index) => {
      expect(text.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
    });
  });
});
