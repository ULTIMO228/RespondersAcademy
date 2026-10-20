/*
 * Конструктор сценариев (фича 005, кликабельный прототип): то, что не проверить в jsdom, — настоящие жесты мышью.
 * Перетаскивание из библиотеки, перемещение блока, соединение от точки выхода, мини-карта, масштаб, удаление и отмена,
 * проверка и пробный прогон. Сервер конструктору не нужен: черновик хранится в браузере.
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { loginAs } from "./helpers/auth";

const SHOTS = process.env.E2E_SHOTS_DIR;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const step = (page: Page, pattern: RegExp) => page.getByRole("button", { name: pattern });
const steps = (page: Page) => page.getByRole("button", { name: /^Шаг \d+, / });

test.describe("конструктор сценариев", () => {
  // Рабочее место оператора и преподавателя — 1920 px (AGENTS.md §7, desktop-first); узкий экран — отдельный тест ниже.
  test.use({ viewport: { width: 1920, height: 1080 } });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, "teacher");
    await page.goto("/teacher/constructor");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Пожар в жилом доме: газ (билет 4.1)");
  });

  test("рабочее место: свёрнутая панель, пример без ошибок, мини-карта", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Конструктор" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("Учебная система. Не является рабочей системой-112")).toBeVisible();
    await expect(steps(page)).toHaveCount(14);
    await expect(page.getByText(/Ошибок нет\./)).toBeVisible();
    await expect(page.getByRole("img", { name: /Мини-карта/ })).toBeVisible();
    await shot(page, "01-editor");
  });

  test("перетаскивание: блок из библиотеки на поле, перемещение блока, отмена", async ({ page }) => {
    const canvas = page.getByLabel("Поле схемы. Стрелки сдвигают поле; Tab — к блокам.");
    const box = (await canvas.boundingBox())!;
    await page
      .getByRole("button", { name: /^Вводная/ })
      .dragTo(canvas, { targetPosition: { x: box.width - 260, y: 120 } });
    await expect(steps(page)).toHaveCount(15);
    const added = step(page, /^Шаг 15, Вводная/);
    await expect(added).toBeVisible();
    await expect(page.getByText(/блок недостижим/).first()).toBeVisible();

    const before = (await added.boundingBox())!;
    await page.mouse.move(before.x + 120, before.y + 20);
    await page.mouse.down();
    await page.mouse.move(before.x + 40, before.y + 140, { steps: 8 });
    await page.mouse.up();
    const after = (await added.boundingBox())!;
    expect(after.y - before.y).toBeGreaterThan(80);
    await shot(page, "02-dropped-and-moved");

    await page.getByRole("button", { name: "Отменить" }).click(); // отмена перемещения
    await expect.poll(async () => Math.round((await added.boundingBox())!.y)).toBe(Math.round(before.y));
    await page.getByRole("button", { name: "Отменить" }).click(); // отмена добавления
    await expect(steps(page)).toHaveCount(14);
  });

  test("соединение: тянуть от точки выхода к блоку; круг не создаётся", async ({ page }) => {
    await step(page, /^Шаг \d+, Подсказка/).click();
    await page.keyboard.press("Delete");
    await expect(page.getByText("Шаг «Подсказка» удалён")).toBeVisible();
    await expect(page.getByText(/не указан следующий шаг для «Нет»/).first()).toBeVisible();
    await shot(page, "03-deleted");

    const condition = step(page, /^Шаг \d+, Условие/);
    const port = condition.locator('[data-flow-port="no"]');
    // Оповещение 104 из ветки «Нет» осталось без входа — вернём его стрелкой от «Нет».
    const target = page.locator('[data-flow-node="n10"]');
    await port.hover();
    await page.mouse.down();
    const box = (await target.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 60, { steps: 10 });
    await page.mouse.up();
    await expect(condition).toHaveAccessibleName(/выход «Нет» ведёт к шагу/);
    await expect(page.getByText(/не указан следующий шаг для «Нет»/)).toHaveCount(0);

    // Связь от «Оповестить 102» назад к «Оповестить 104» (шаг 8 ведёт к ней) замкнула бы круг.
    await page.getByRole("button", { name: "Показать всю схему" }).click();
    const last = step(page, /Оповестить: Служба 102/);
    await last.locator('[data-flow-port="done"]').hover();
    await page.mouse.down();
    const back = (await page.locator('[data-flow-node="n8"]').boundingBox())!;
    await page.mouse.move(back.x + back.width / 2, back.y + back.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(page.getByRole("alert").filter({ hasText: "Так получится круг" })).toBeVisible();
    await shot(page, "04-connected");
  });

  test("связь выделяется щелчком и удаляется; «+» на связи вставляет шаг", async ({ page }) => {
    // Прямая связь «Входящий вызов» → «Реплика»: щелчок по линии выделяет её, Delete удаляет, Ctrl + Z возвращает.
    const wire = page.locator('[data-flow-edge="e2"]');
    const wireBox = (await wire.boundingBox())!;
    await wire.click({ force: true, position: { x: wireBox.width / 2, y: wireBox.height / 2 } });
    await expect(page.getByRole("heading", { name: "Связь" })).toBeVisible();
    await page.keyboard.press("Delete");
    await expect(page.getByText(/Шаг 2 · Входящий вызов: не указан следующий шаг/).first()).toBeVisible();
    await page.keyboard.press("Control+z");
    await expect(page.getByText(/Ошибок нет\./)).toBeVisible();

    // «+» появляется у выделенной связи: сначала выделяем связь «Начало» → «Входящий вызов».
    const first = page.locator('[data-flow-edge="e1"]');
    const firstBox = (await first.boundingBox())!;
    await first.click({ force: true, position: { x: firstBox.width / 2, y: firstBox.height / 2 } });
    await page.getByRole("button", { name: "Вставить шаг между шагами 1 и 2" }).click();
    await page
      .getByRole("dialog", { name: "Вставить шаг сюда" })
      .getByRole("button", { name: "Реплика заявителя" })
      .click();
    await expect(steps(page)).toHaveCount(15);
    await expect(step(page, /^Шаг 1, Начало.*ведёт к шагу 2/)).toBeVisible();
    await expect(step(page, /^Шаг 2, Реплика заявителя/)).toBeVisible();
    await page.getByRole("heading", { name: "Реплика заявителя" }).isVisible();
    const text = page.getByRole("textbox", { name: "Текст реплики" });
    await text.fill("Алло, у нас пожар!");
    await text.press("Tab");
    await expect(step(page, /«Алло, у нас пожар!»/)).toBeVisible();
    await shot(page, "05-inserted");
  });

  test("мини-карта и масштаб: щелчок переносит вид, Ctrl + колесо меняет масштаб", async ({ page }) => {
    const zoom = page.getByRole("toolbar", { name: "Вид схемы" });
    const before = await zoom.textContent();
    const canvas = page.getByLabel("Поле схемы. Стрелки сдвигают поле; Tab — к блокам.");
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -300);
    await page.keyboard.up("Control");
    await expect(zoom).not.toHaveText(before ?? "");

    const end = step(page, /^Шаг \d+, Завершение/);
    await expect(end).not.toBeInViewport();
    // Щелчок по «Завершению» на мини-карте переносит вид к нему.
    await page.locator('[data-minimap-node="n14"]').click({ force: true });
    await expect(end).toBeInViewport();
    await shot(page, "06-minimap");
  });

  test("мини-карта: рамка, протянутая за левый край, останавливается, а не улетает", async ({ page }) => {
    const map = page.getByRole("img", { name: /Мини-карта/ });
    const box = (await map.boundingBox())!;
    const start = step(page, /^Шаг 1, Начало/);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 200, box.y + box.height / 2, { steps: 10 });
    const first = (await start.boundingBox())!;
    for (let i = 0; i < 5; i += 1) await page.mouse.move(box.x - 200, box.y + box.height / 2 + (i % 2));
    const later = (await start.boundingBox())!;
    await page.mouse.up();
    expect(Math.abs(later.x - first.x)).toBeLessThan(5);
  });

  test("«Скрыть ответы» убирает правильные ответы с блоков", async ({ page }) => {
    const question = step(page, /Уточнение адреса/);
    await expect(question).toContainText("ул. Грина, 11");
    await page.getByRole("button", { name: "Скрыть ответы" }).click();
    await expect(question).not.toContainText("ул. Грина, 11");
    await expect(question).toContainText("ответ скрыт");
    await page.getByRole("button", { name: "Показать ответы" }).click();
    await expect(question).toContainText("ул. Грина, 11");
  });

  test("проверка и пробный прогон до итога", async ({ page }) => {
    await page.getByRole("button", { name: /Запустить тест/ }).click();
    const run = page.getByRole("complementary", { name: "Пробный прогон" });
    await expect(run.getByText(/Горит балкон на тринадцатом этаже/)).toBeVisible();
    const record = async (field: string, value: string) => {
      await run.getByLabel("Указать значение поля").selectOption(field);
      await run.getByRole("textbox", { name: "Значение", exact: true }).fill(value);
      await run.getByRole("button", { name: "Записать" }).first().click();
    };
    await record("addressRefined", "ул. Грина, 11");
    await expect(run.getByText(/✓ Записано: .*«ул\. Грина, 11»/)).toBeVisible();
    await record("floors", "14");
    await record("gas", "нет");
    await run.getByRole("button", { name: "+60 с" }).click();
    await expect(run.getByText(/Подсказка:/)).toBeVisible();
    for (const service of ["svc-101", "svc-102"]) {
      await run.getByLabel("Оповестить службу").selectOption(service);
      await run.getByRole("button", { name: "Оповестить", exact: true }).click();
    }
    await shot(page, "07-preview-running");
    await run.getByRole("button", { name: "Завершить прохождение" }).click();
    const result = run.getByRole("region", { name: "Итог прогона" });
    await expect(result).toContainText("70");
    await expect(result).toContainText("Сдано");
    await expect(result).toContainText("взята подсказка");
    await shot(page, "08-preview-result");
  });

  test("сохранение в браузере переживает перезагрузку", async ({ page }) => {
    await page.getByRole("button", { name: /^Шаг \d+, Условие/ }).click();
    await page.getByLabel("Название шага").fill("Газ в доме?");
    await page.getByLabel("Название шага").press("Enter");
    await page.keyboard.press("Control+s");
    await expect(page.getByText(/Сохранено в браузере/)).toBeVisible();
    await page.reload();
    await expect(step(page, /^Шаг \d+, Условие/)).toBeVisible();
    await expect(page.getByText("Газ в доме?").first()).toBeVisible();
    await expect(page.getByText(/черновик восстановлен/)).toBeVisible();
  });
});

test.describe("конструктор сценариев на узком экране", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("1280 px: без горизонтальной прокрутки, библиотека и свойства на месте", async ({ page }) => {
    await loginAs(page, "teacher");
    await page.goto("/teacher/constructor");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole("button", { name: /^Входящий вызов/ })).toBeInViewport();
    await expect(page.getByRole("button", { name: /Опубликовать/ })).toBeInViewport();
    // Панель действий — в одну строку: «Опубликовать» не уезжает под «Сохранить».
    const publishY = (await page.getByRole("button", { name: /Опубликовать/ }).boundingBox())!.y;
    const saveY = (await page.getByRole("button", { name: /Сохранить/ }).boundingBox())!.y;
    expect(Math.abs(publishY - saveY)).toBeLessThan(4);
    await expect(page.getByRole("complementary", { name: "Свойства" })).toBeInViewport();
    await shot(page, "09-narrow-1280");
  });
});
