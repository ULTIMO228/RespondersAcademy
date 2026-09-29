// @vitest-environment node
/*
 * Токены платформы (T037, SC-012, SC-014): контраст пар «текст/фон» замеряется по значениям из
 * tokens-platform.css (WCAG 2.2: 4,5:1 для текста, 3:1 для границ полей, графики и индикаторов), а сам файл —
 * единственное место платформы с hex-цветами; в CSS-модулях платформы и симулятора hex запрещён.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const STYLES_DIR = __dirname;
const SRC_DIR = join(__dirname, "../../..");
const tokensCss = readFileSync(join(STYLES_DIR, "tokens-platform.css"), "utf8");
const varsCss = readFileSync(join(STYLES_DIR, "vars.css"), "utf8");

const HEX = /^#([0-9a-f]{6})$/i;
const TEXT_MIN = 4.5;
const NON_TEXT_MIN = 3;

/** Значение токена: hex или ссылка на var(--…) из vars.css / этого файла (без рекурсии глубже двух шагов). */
function resolve(name: string, depth = 0): string {
  const declaration = new RegExp(`${name.replace(/[-]/g, "\\-")}:\\s*([^;]+);`);
  const raw = (declaration.exec(tokensCss) ?? declaration.exec(varsCss))?.[1]?.trim();
  if (!raw) throw new Error(`Токен ${name} не найден`);
  const reference = /^var\((--[a-z0-9-]+)\)$/.exec(raw);
  if (reference && depth < 3) return resolve(reference[1], depth + 1);
  if (!HEX.test(raw)) throw new Error(`Токен ${name} не сводится к hex: ${raw}`);
  return raw;
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((start) => channel(parseInt(hex.slice(start, start + 2), 16)));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const TEXT_PAIRS: [string, string, string][] = [
  ["--pf-text", "--pf-bg-page", "основной текст на странице"],
  ["--pf-text", "--pf-bg-card", "основной текст на карточке"],
  ["--pf-text", "--pf-bg-subtle", "текст в шапке таблицы"],
  ["--pf-text", "--pf-bg-hover", "текст при наведении"],
  ["--pf-text", "--pf-bg-selected", "текст выбранной строки"],
  ["--pf-text-muted", "--pf-bg-page", "вторичный текст на странице"],
  ["--pf-text-muted", "--pf-bg-card", "вторичный текст на карточке"],
  ["--pf-text-muted", "--pf-bg-subtle", "вторичный текст в шапке таблицы"],
  ["--pf-text-muted", "--pf-bg-hover", "вторичный текст при наведении"],
  ["--pf-text-on-action", "--pf-action", "текст главной кнопки"],
  ["--pf-text-on-action", "--pf-action-hover", "текст главной кнопки при наведении"],
  ["--pf-link", "--pf-bg-card", "ссылка на карточке"],
  ["--pf-link", "--pf-bg-page", "ссылка на странице"],
  ["--pf-link", "--pf-bg-subtle", "ссылка в шапке таблицы"],
  ["--pf-link-hover", "--pf-bg-card", "ссылка при наведении"],
  ["--pf-shell-text", "--pf-shell-bg", "пункт меню оболочки"],
  ["--pf-shell-text", "--pf-shell-bg-hover", "пункт меню при наведении"],
  ["--pf-shell-text", "--pf-shell-bg-active", "активный пункт меню"],
  ["--pf-shell-muted", "--pf-shell-bg", "вторичный текст оболочки"],
  ["--pf-shell-muted", "--pf-shell-bg-active", "вторичный текст активного пункта"],
  ["--pf-success", "--pf-success-bg", "плашка «успех»"],
  ["--pf-warning", "--pf-warning-bg", "плашка «предупреждение»"],
  ["--pf-danger", "--pf-danger-bg", "плашка «ошибка»"],
  ["--pf-info", "--pf-info-bg", "плашка «сведения» и бейдж «ИИ»"],
  ["--pf-success", "--pf-bg-card", "показатель в норме на карточке"],
  ["--pf-danger", "--pf-bg-card", "показатель вне нормы на карточке"],
  ["--pf-warning", "--pf-bg-card", "предупреждение на карточке"],
];

const NON_TEXT_PAIRS: [string, string, string][] = [
  ["--pf-border-control", "--pf-bg-card", "граница поля ввода"],
  ["--pf-focus", "--pf-bg-card", "кольцо фокуса на карточке"],
  ["--pf-focus", "--pf-bg-page", "кольцо фокуса на странице"],
  ["--pf-shell-focus", "--pf-shell-bg", "кольцо фокуса в оболочке (синий на графите — 2,78:1, не годится)"],
  ["--pf-brand-orange", "--pf-bg-card", "индикаторы и графика оранжевого"],
  ["--pf-brand-orange", "--pf-shell-bg", "индикатор активного пункта"],
  ["--pf-chart-score", "--pf-bg-card", "линия баллов"],
  ["--pf-chart-reaction", "--pf-bg-card", "линия реакции"],
  ["--pf-chart-duration", "--pf-bg-card", "линия отработки"],
  ["--pf-chart-other", "--pf-bg-card", "прочие серии"],
  ["--pf-chart-norm", "--pf-bg-card", "линия норматива"],
];

describe("tokens-platform.css — контраст (WCAG 2.2 AA)", () => {
  it.each(TEXT_PAIRS)("%s на %s ≥ 4,5:1 — %s", (foreground, background) => {
    expect(contrast(resolve(foreground), resolve(background))).toBeGreaterThanOrEqual(TEXT_MIN);
  });

  it.each(NON_TEXT_PAIRS)("%s на %s ≥ 3:1 — %s", (foreground, background) => {
    expect(contrast(resolve(foreground), resolve(background))).toBeGreaterThanOrEqual(NON_TEXT_MIN);
  });

  it("синий фокус на графите оболочки не проходит 3:1 — поэтому в оболочке кольцо белое", () => {
    expect(contrast(resolve("--pf-focus"), resolve("--pf-shell-bg"))).toBeLessThan(NON_TEXT_MIN);
  });

  it("исходные цвета АРМ, не проходящие AA как текст, не используются для текста: оранжевый и «мягкий» серый", () => {
    expect(contrast(resolve("--color-accent-orange"), "#ffffff")).toBeLessThan(TEXT_MIN);
    expect(contrast(resolve("--color-ink-soft"), "#ffffff")).toBeLessThan(TEXT_MIN);
    for (const forbidden of ["--color-accent-orange", "--color-ink-soft"]) {
      expect(tokensCss).not.toMatch(
        new RegExp(`--pf-(text|text-muted|link)[a-z-]*:\\s*var\\(${forbidden}\\)`),
      );
    }
  });
});

describe("tokens-platform.css — состав", () => {
  it("все токены с префиксом --pf-", () => {
    const names = [...tokensCss.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((match) => match[1]);
    expect(names.length).toBeGreaterThan(60);
    expect(names.filter((name) => !name.startsWith("--pf-"))).toEqual([]);
  });

  it("подключён из vars.css", () => {
    expect(varsCss).toContain('@import "./tokens-platform.css";');
  });
});

function collectCss(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return collectCss(path);
    return path.endsWith(".module.css") ? [path] : [];
  });
}

describe("CSS-модули: цвета только из токенов (SC-014)", () => {
  it("в CSS-модулях платформы нет жёстких hex-цветов", () => {
    const platformModules = collectCss(SRC_DIR).filter((path) => /\/(platform|platform-nav)\//.test(path));
    const offenders = platformModules.filter((path) => /#[0-9a-f]{3,8}\b/i.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});
