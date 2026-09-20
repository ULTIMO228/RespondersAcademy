/*
 * Сертификат-заглушка PDF (T2.5-05; ТЗ §12 «PDF для сертификатов» — этап 2 / опционально).
 * Без сети и без новых зависимостей: страница рисуется на canvas (кириллица — системным шрифтом браузера),
 * JPEG вкладывается в минимальный PDF 1.4 как изображение (/DCTDecode). Генератор и сохранение файла —
 * за интерфейсами (в тестах подменяются).
 */
import { systemClock } from "@/shared/lib";

export type CertificateData = {
  fullName: string;
  integralScore: number | null;
  cardCount: number;
  /** «19.09.2026» */
  issuedOn: string;
};

export interface CertificateGenerator {
  generate(data: CertificateData): Promise<Blob>;
}

export interface FileSaver {
  save(file: Blob, fileName: string): void;
}

/** A4 альбомная, пункты PDF. */
const PAGE = { width: 842, height: 595 } as const;
const PIXEL_RATIO = 2;
const JPEG_QUALITY = 0.92;

const encoder = new TextEncoder();

function pad10(value: number): string {
  return String(value).padStart(10, "0");
}

function concatBytes(chunks: Uint8Array[], totalLength: number): Uint8Array {
  const result = new Uint8Array(totalLength);
  let position = 0;
  for (const chunk of chunks) {
    result.set(chunk, position);
    position += chunk.length;
  }
  return result;
}

/** Минимальный одностраничный PDF с изображением JPEG на весь лист; xref-смещения — точные. */
export function buildImagePdf(jpeg: Uint8Array, widthPx: number, heightPx: number): Uint8Array {
  const drawing = `q ${PAGE.width} 0 0 ${PAGE.height} 0 0 cm /Im0 Do Q`;
  const objects: (string | Uint8Array)[][] = [
    ["<< /Type /Catalog /Pages 2 0 R >>"],
    ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"],
    [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
        "/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>",
    ],
    [
      `<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      jpeg,
      "\nendstream",
    ],
    [`<< /Length ${drawing.length} >>\nstream\n${drawing}\nendstream`],
  ];
  const chunks: Uint8Array[] = [encoder.encode("%PDF-1.4\n")];
  let offset = chunks[0].length;
  const offsets: number[] = [];
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    chunks.push(bytes);
    offset += bytes.length;
  };
  objects.forEach((parts, index) => {
    offsets.push(offset);
    push(`${index + 1} 0 obj\n`);
    parts.forEach(push);
    push("\nendobj\n");
  });
  const xrefOffset = offset;
  const entries = offsets.map((value) => `${pad10(value)} 00000 n \n`).join("");
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries}`);
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return concatBytes(chunks, offset);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Цвета — из токенов темы (vars.css), чтобы сертификат был в палитре АРМ. */
function readToken(doc: Document, name: string): string {
  return getComputedStyle(doc.documentElement).getPropertyValue(name).trim() || "black";
}

/** Макет листа (пункты PDF): рамка и строки по центру. */
const FRAME = { inset: 24, lineWidth: 4 } as const;

type CertificateLine = {
  y: number;
  font: string;
  isAccent?: boolean;
  text: (data: CertificateData) => string;
};

const CERTIFICATE_LINES: CertificateLine[] = [
  { y: 130, font: "bold 40px sans-serif", isAccent: true, text: () => "СЕРТИФИКАТ" },
  { y: 170, font: "18px sans-serif", text: () => "о прохождении обучения на учебном тренажёре АРМ-112" },
  { y: 260, font: "bold 30px sans-serif", text: (data) => data.fullName },
  { y: 320, font: "20px sans-serif", text: (data) => `Интегральный балл: ${data.integralScore ?? "—"}` },
  { y: 355, font: "20px sans-serif", text: (data) => `Отработано карточек: ${data.cardCount}` },
  { y: 390, font: "20px sans-serif", text: (data) => `Дата выдачи: ${data.issuedOn}` },
  { y: 520, font: "14px sans-serif", text: () => "Файл-заглушка: этап 2 / опционально (ТЗ §12)" },
];

function drawCertificate(context: CanvasRenderingContext2D, doc: Document, data: CertificateData): void {
  const ink = readToken(doc, "--color-ink");
  const accent = readToken(doc, "--color-accent-blue");
  context.fillStyle = "white";
  context.fillRect(0, 0, PAGE.width, PAGE.height);
  context.strokeStyle = accent;
  context.lineWidth = FRAME.lineWidth;
  context.strokeRect(FRAME.inset, FRAME.inset, PAGE.width - 2 * FRAME.inset, PAGE.height - 2 * FRAME.inset);
  context.textAlign = "center";
  for (const line of CERTIFICATE_LINES) {
    context.font = line.font;
    context.fillStyle = line.isAccent ? accent : ink;
    context.fillText(line.text(data), PAGE.width / 2, line.y);
  }
}

/** Генератор браузера: canvas → JPEG → PDF (без обращения к сети). */
export function createCanvasCertificateGenerator(doc: Document = document): CertificateGenerator {
  return {
    async generate(data) {
      const canvas = doc.createElement("canvas");
      canvas.width = PAGE.width * PIXEL_RATIO;
      canvas.height = PAGE.height * PIXEL_RATIO;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Генерация сертификата недоступна в этом браузере");
      context.scale(PIXEL_RATIO, PIXEL_RATIO);
      drawCertificate(context, doc, data);
      const jpeg = dataUrlToBytes(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      const pdf = buildImagePdf(jpeg, canvas.width, canvas.height);
      return new Blob([pdf.buffer as ArrayBuffer], { type: "application/pdf" });
    },
  };
}

/** Сохранение через временную ссылку blob: (локально, без сети). */
export function createBrowserFileSaver(doc: Document = document): FileSaver {
  return {
    save(file, fileName) {
      const url = URL.createObjectURL(file);
      const link = doc.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      // Отзыв ссылки — после старта загрузки (часть браузеров читает blob асинхронно).
      systemClock.setTimeout(() => URL.revokeObjectURL(url), 0);
    },
  };
}
