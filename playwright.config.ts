import { defineConfig, devices } from "@playwright/test";

/*
 * Конфигурация e2e (spec/000-фронт/11-implementation-plan.md §6 «Тестовая стратегия», e2e — Ф6).
 *
 * Локальный контур: webServer поднимает production-сборку из этого же репозитория,
 * внешних хостов нет; браузеры Playwright — dev-only зависимость, в прод-сборку не попадают.
 *
 * Порт задаётся переменной окружения E2E_PORT (по умолчанию 3140), чтобы прогон не конфликтовал
 * с dev-сервером разработчика на 3000/3112.
 */
const PORT = Number(process.env.E2E_PORT ?? 3140);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  /* Демо-путь — один сквозной сценарий с общим состоянием мок-стора: строго последовательно. */
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"]],
  /* Демо-путь по спеке укладывается в 5 минут; общий таймаут спека — с запасом на прогрев сборки. */
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1920, height: 1080 },
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    /*
     * Мок-стор живёт в памяти процесса, поэтому каждый прогон стартует свежий сервер
     * (reuseExistingServer только при явном E2E_REUSE_SERVER=true — для отладки).
     */
    command: `npm run build && npx next start -p ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "true",
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
