/* Доступность карты ошибок (спека 003, T065, FR-023…FR-025, SC-006): проверки по исходникам и токенам. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ERROR_MAP_LEVEL_META } from "@/entities/error-map";

const ROOT = process.cwd();
const SLICES = [
  "src/widgets/error-map",
  "src/widgets/my-focus",
  "src/pages/teacher/error-map",
  "src/entities/error-map",
  "src/features/error-map-assign",
];

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = join(dir, name);
    return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
  });
}

const files = SLICES.flatMap(walk);
const sources = files.filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
const styleFiles = files.filter((f) => f.endsWith(".module.css"));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

/* Токены: первое определение каждого `--имя: значение;` (светлая тема). */
const tokenSource = ["vars.css", "tokens-platform.css"]
  .map((name) => read(join("src/shared/ui/styles", name)))
  .join("\n");
const tokens = new Map<string, string>();
for (const match of tokenSource.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
  if (!tokens.has(match[1])) tokens.set(match[1], match[2].replace(/\/\*.*?\*\//g, "").trim());
}

function resolve(value: string, depth = 0): string {
  const ref = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (!ref || depth > 8) return value.trim();
  return resolve(tokens.get(ref[1]) ?? "", depth + 1);
}

function px(value: string): number | null {
  const resolved = resolve(value);
  const match = /^(\d+(?:\.\d+)?)px$/.exec(resolved);
  return match ? Number(match[1]) : null;
}

function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const full = n.length === 3 ? [...n].map((c) => c + c).join("") : n;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = parseInt(full.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function rules(css: string): Array<{ selector: string; body: string }> {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1].trim(),
    body: m[2],
  }));
}

describe("карта ошибок: доступность", () => {
  it("у каждого уровня есть и значок, и слово, и они различимы", () => {
    const metas = Object.values(ERROR_MAP_LEVEL_META);
    expect(metas).toHaveLength(4);
    for (const meta of metas) {
      expect(meta.icon.trim()).not.toBe("");
      expect(meta.label.trim()).not.toBe("");
    }
    expect(new Set(metas.map((m) => m.icon)).size).toBe(4);
    expect(new Set(metas.map((m) => m.label)).size).toBe(4);
  });

  it("контраст цвета уровня на белом не ниже WCAG AA (4,5:1)", () => {
    const background = resolve("var(--pf-bg-card)");
    for (const meta of Object.values(ERROR_MAP_LEVEL_META)) {
      const color = resolve(`var(${meta.colorToken})`);
      expect(color, meta.colorToken).toMatch(/^#/);
      expect(contrast(color, background), meta.colorToken).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(resolve("var(--pf-text)"), background)).toBeGreaterThanOrEqual(4.5);
  });

  it("основной текст не мельче 16 px, кроме режима показа (там крупнее)", () => {
    for (const file of styleFiles) {
      for (const { selector, body } of rules(read(file))) {
        for (const match of body.matchAll(/font-size\s*:\s*([^;]+);/g)) {
          const size = px(match[1]);
          expect(size, `${file} ${selector}: ${match[1]}`).not.toBeNull();
          expect(size!, `${file} ${selector}`).toBeGreaterThanOrEqual(16);
        }
      }
    }
  });

  it("всё, что нажимается мышью, не ниже 44 px по высоте", () => {
    for (const file of styleFiles) {
      for (const { selector, body } of rules(read(file))) {
        if (!/cursor\s*:\s*pointer/.test(body) || selector.includes(":")) continue;
        const height = /min-height\s*:\s*([^;]+);/.exec(body);
        expect(height, `${file} ${selector}: нет min-height`).not.toBeNull();
        expect(px(height![1]), `${file} ${selector}`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  it("в интерфейсе нет жаргона", () => {
    const banned = /кластер|парето|\bграф(?!ик)|агрегат/i;
    for (const file of sources) {
      const text = [...read(file).matchAll(/(["'`])((?:\\.|(?!\1).)*?[А-Яа-яЁё](?:\\.|(?!\1).)*?)\1/g)].map(
        (m) => m[2],
      );
      const jsx = [...read(file).matchAll(/>([^<>{}]*[А-Яа-яЁё][^<>{}]*)</g)].map((m) => m[1]);
      for (const piece of [...text, ...jsx]) expect(piece, file).not.toMatch(banned);
    }
  });

  it("нет жестов и подсказок только при наведении", () => {
    for (const file of sources) {
      const code = read(file);
      expect(code, file).not.toMatch(
        /onMouseEnter|onMouseOver|onDrag|onTouch|onPointerMove|onWheel|draggable/,
      );
      // Атрибут title на обычном элементе — подсказка только при наведении; у компонентов (Card, AiBadge) это проп.
      expect(code, file).not.toMatch(/<[a-z][\w-]*\s[^>]*\stitle=/);
    }
    for (const file of styleFiles) {
      for (const { selector, body } of rules(read(file))) {
        if (selector.includes(":hover")) {
          expect(body, `${file} ${selector}`).not.toMatch(/display|visibility|content|opacity/);
        }
      }
    }
  });
});
