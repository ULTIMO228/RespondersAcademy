/* Генератор CSV (T3.4-16): BOM, разделитель «;», экранирование, имя файла с датой и id занятия. */
import { describe, expect, it, vi } from "vitest";

import { buildExportFileName, downloadCsv } from "../model/export";
import { CSV_BOM, escapeCsvCell, toCsv } from "./csv";

describe("CSV отчёта", () => {
  it("начинается с BOM, колонки разделены «;», строки — CRLF", () => {
    const csv = toCsv([
      ["ФИО", "Балл"],
      ["Петрова Анна Дмитриевна", 66],
    ]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv).toContain("ФИО;Балл\r\n");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("экранирует разделитель, кавычки и переводы строк", () => {
    expect(escapeCsvCell("Пожар; взрыв")).toBe('"Пожар; взрыв"');
    expect(escapeCsvCell('фраза "в кавычках"')).toBe('"фраза ""в кавычках"""');
    expect(escapeCsvCell("две\nстроки")).toBe('"две\nстроки"');
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(96)).toBe("96");
  });

  it("имя файла содержит id занятия и дату", () => {
    expect(buildExportFileName("ses-2026-09-16-01", "2026-09-16T10:00:00+03:00", "csv")).toBe(
      "otchet-ses-2026-09-16-01-2026-09-16.csv",
    );
  });

  it("downloadCsv отдаёт сохранялке один файл с заголовком и строками", () => {
    const saver = { save: vi.fn() };
    downloadCsv(
      {
        fileName: "otchet.csv",
        header: ["ФИО", "Балл"],
        rows: [["Иванов Сергей Петрович", 96]],
      },
      saver,
    );
    expect(saver.save).toHaveBeenCalledTimes(1);
    expect(saver.save.mock.calls[0][1]).toBe("otchet.csv");
    expect(saver.save.mock.calls[0][0].type).toContain("text/csv");
  });
});
