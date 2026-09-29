/*
 * Граница «симулятор ↔ платформа» (спека 002, A11, T039): экраны `/arm/*` — точная реплика АРМ-112 (правило №1, AGENTS §9)
 * и не используют ни компоненты платформы (`shared/ui/platform`), ни её токены (`--pf-*`), ни платформенные виджеты.
 * Тест читает исходники симулятора и ищет запрещённые ссылки; добавляя новый файл симулятора, включите его каталог в список.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

/** Каталоги и файлы симулятора (маршруты /arm/*, их страницы, виджеты, фичи и лэйауты АРМ). */
const SIMULATOR_PATHS = [
  "app/arm",
  "src/pages/journal",
  "src/pages/incident",
  "src/pages/phone",
  "src/pages/operator112",
  "src/widgets/incident-list",
  "src/widgets/incident-card",
  "src/widgets/service-panel",
  "src/widgets/app-nav",
  "src/widgets/operator112-softphone",
  "src/widgets/work-message-feed",
  "src/widgets/simulator-bar",
  "src/features/call-control",
  "src/features/incident-type-picker",
  "src/features/operator112-address",
  "src/features/operator112-questionnaire",
  "src/features/statement-form",
  "src/features/status-form",
  "src/app/layouts/ArmSectionLayout.tsx",
  "src/app/layouts/ArmSectionLayout.module.css",
  "src/app/layouts/ArmCardLayout.tsx",
  "src/app/layouts/ArmJournalLayout.tsx",
  "src/app/layouts/LightArmLayout.tsx",
];

/** Запрещённые в симуляторе ссылки: компоненты и токены платформы, платформенные виджеты. */
const FORBIDDEN: { pattern: RegExp; what: string }[] = [
  { pattern: /shared\/ui\/platform/, what: "компоненты платформы" },
  { pattern: /tokens-platform/, what: "файл токенов платформы" },
  { pattern: /var\(\s*--pf-/, what: "токены --pf-*" },
  { pattern: /widgets\/(platform-nav|recommendation-list|attempt-review)/, what: "виджеты платформы" },
  { pattern: /pages\/(student|account|reference)\b/, what: "страницы платформы" },
];

const SOURCE_FILE = /\.(ts|tsx|css)$/;
/** Комментарии могут упоминать границу — проверяются только код и значения. */
const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

function collectFiles(path: string): string[] {
  const absolute = resolve(ROOT, path);
  if (!statSync(absolute).isDirectory()) return [absolute];
  return readdirSync(absolute).flatMap((name) => collectFiles(join(path, name)));
}

describe("граница симулятора и платформы", () => {
  const files = SIMULATOR_PATHS.flatMap(collectFiles).filter(
    (file) => SOURCE_FILE.test(file) && !/\.test\.tsx?$/.test(file),
  );

  it("список файлов симулятора не пуст и охватывает все четыре эталонных экрана", () => {
    expect(files.length).toBeGreaterThan(50);
    for (const marker of ["app/arm", "pages/journal", "pages/incident", "pages/phone", "pages/operator112"]) {
      expect(
        files.some((file) => file.includes(marker)),
        marker,
      ).toBe(true);
    }
  });

  for (const { pattern, what } of FORBIDDEN) {
    it(`симулятор не использует ${what}`, () => {
      const offenders = files.filter((file) =>
        pattern.test(readFileSync(file, "utf8").replace(COMMENTS, "")),
      );
      expect(offenders.map((file) => file.replace(`${ROOT}/`, ""))).toEqual([]);
    });
  }
});
