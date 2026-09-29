/*
 * Неизменность симулятора (спека 002, T055, SC-013): снимки экранов `/arm/*` эталонного вида (правило №1 —
 * 1:1 с боевой АРМ-112). Платформа (`/student`, `/teacher`, `/admin`) их не затрагивает; спек сравнивает
 * текущую сборку с закоммиченными эталонами, снятыми ДО появления платформы (волна W2).
 *
 * Воспроизведение (мок-режим, без бэкенда; порт не 3000):
 *   npm run build && npx next start -p 3141 &
 *   E2E_REUSE_SERVER=true E2E_BASE_URL=http://127.0.0.1:3141 npx playwright test e2e/simulator-visual.spec.ts
 * Обновить эталон (только осознанно, с записью в docs/platform-design.md):
 *   … npx playwright test e2e/simulator-visual.spec.ts --update-snapshots
 *
 * Панель «В кабинет» (`[data-simulator-bar]`, единственное добавление платформы в симулятор, T039) на снимках экранов
 * скрыта: они сверяют сам симулятор с эталоном «до». Сама панель снимается отдельным эталоном (`simulator-bar`).
 *
 * Сервер ОБЯЗАТЕЛЬНО свежий на каждый прогон: мок-стор в памяти, и открытие карточки меняет блок «Мои назначенные
 * модули» журнала (эталон снят на свежем сервере, журнал — первым тестом); повтор на том же сервере даст расхождение.
 * Детерминизм: время браузера заморожено (таймеры карточек и «поступила N мин назад» не дрейфуют), анимации
 * выключены. Эталоны привязаны к платформе и версии браузера (`*-chromium-darwin.png`); при смене браузера
 * снимаются заново на старом и новом коде. Допуск — `maxDiffPixelRatio` 0,002 (сглаживание шрифтов).
 */
import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";
import { DEMO_CARD } from "./helpers/demo-data";

/** Замороженное «сейчас» браузера — внутри дня мока, чтобы относительные времена не дрейфовали. */
const FROZEN_NOW = new Date("2026-09-16T10:00:00+03:00");

/** Скрывает панель «В кабинет», чтобы экран сравнивался с эталоном, снятым до появления платформы. */
const HIDE_SIMULATOR_BAR = "[data-simulator-bar] { display: none !important; }";

const SCREENS = [
  { name: "arm-journal", path: "/arm" },
  { name: "arm-card", path: `/arm/card/${DEMO_CARD.id}` },
  { name: "arm-phone", path: "/arm/phone" },
  /* Без `assignmentId` экран режима 112 показывает пояснение; состояние попытки снимается на стенде с бэкендом. */
  { name: "arm-operator112", path: "/arm/operator112" },
] as const;

test.describe("симулятор /arm/*: визуальные эталоны", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_NOW);
    await loginAs(page, "student");
  });

  for (const screen of SCREENS) {
    test(`${screen.path} совпадает с эталоном`, async ({ page }) => {
      const response = await page.goto(screen.path);
      expect(response?.status()).toBe(200);
      await page.waitForLoadState("networkidle");
      await page.addStyleTag({ content: HIDE_SIMULATOR_BAR });
      await expect(page).toHaveScreenshot(`${screen.name}.png`, {
        fullPage: true,
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.002,
      });
    });
  }

  test("панель «В кабинет» над журналом", async ({ page }) => {
    await page.goto("/arm");
    await page.waitForLoadState("networkidle");
    const bar = page.locator("[data-simulator-bar]");
    await expect(bar).toBeVisible();
    await expect(bar.getByRole("link", { name: /В кабинет/ })).toHaveAttribute("href", "/student");
    await expect(bar).toHaveScreenshot("simulator-bar.png", { animations: "disabled", caret: "hide" });
  });
});
