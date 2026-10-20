/*
 * Граница чата разбора (спека 020, T019, FR-001/FR-014/SC-006): виджет подключается только на экране результатов
 * обучающегося. В симуляторе (/arm/*), кабинетах преподавателя и администратора, на общих страницах его быть не должно.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const APP = join(process.cwd(), "app");
const IMPORT = /widgets\/attempt-chat|attempt-chat\/(ui|model)/;
/** Единственный потребитель — экран разбора попытки обучающегося. */
const ALLOWED = "src/pages/student/results/ui/StudentResultDetailScreen.tsx";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === "attempt-chat" ? [] : sources(path);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

describe("граница чата разбора", () => {
  const importers = [...sources(SRC), ...sources(APP)]
    .filter((path) => IMPORT.test(readFileSync(path, "utf8")))
    .map((path) => relative(process.cwd(), path));

  it("виджет подключает только экран результатов обучающегося", () => {
    expect(importers).toEqual([ALLOWED]);
  });

  it("ни симулятор, ни кабинеты преподавателя и администратора, ни маршруты /arm, /teacher, /admin его не импортируют", () => {
    const forbidden = importers.filter((path) =>
      /^(src\/pages\/(arm|teacher|admin|journal|incident|phone|operator112)|app\/(arm|teacher|admin))/.test(
        path,
      ),
    );
    expect(forbidden).toEqual([]);
  });
});
