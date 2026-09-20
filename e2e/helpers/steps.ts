/*
 * Повторяемые действия демо-пути (spec/06-user-flows.md): подготовка класса, смена статуса реагирования,
 * ожидание строки поступившей карточки. Локаторы — по ролям, доступным именам и подписям экранов.
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/**
 * Мок-стор живёт в памяти процесса и хранит занятия сида: перед демо преподаватель завершает всё, что
 * ещё идёт, — иначе дашборд показывает чужое занятие (берётся первое идущее занятие преподавателя).
 */
export async function finishRunningSessions(page: Page): Promise<void> {
  await page.goto("/teacher");
  const placeholder = page.getByRole("heading", { name: "Занятие не идёт" });
  const finish = page.getByRole("button", { name: "Завершить занятие" });
  for (let guard = 0; guard < 10; guard += 1) {
    await expect(placeholder.or(finish).first()).toBeVisible();
    if (await placeholder.isVisible().catch(() => false)) return;
    if (!(await finish.isVisible().catch(() => false))) return;
    await finish.click();
    await page.getByRole("button", { name: "Завершить", exact: true }).click();
    await expect(page.getByLabel("Занятие завершено")).toBeVisible();
    await page.goto("/teacher");
  }
  throw new Error("Не удалось завершить идущие занятия преподавателя");
}

/** Форма смены статуса реагирования карточки (ДДС_image8–20): «Сменить статус» → дропдаун «Статус». */
export async function openStatusForm(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Сменить статус (Alt + E)" }).click();
  const form = page.getByRole("form", { name: "Смена статуса реагирования" });
  await expect(form).toBeVisible();
  return form;
}

/** Пункт дропдауна «Статус» по подписи справочника (reference.ddsStatuses). */
export async function pickStatus(page: Page, title: string): Promise<Locator> {
  const form = page.getByRole("form", { name: "Смена статуса реагирования" });
  await form.getByRole("button", { name: "Статус", exact: true }).click();
  const option = form.getByRole("option", { name: title, exact: true });
  await option.click();
  return form;
}

/** Смена статуса целиком: открыть форму → выбрать статус → комментарий → сохранить. */
export async function setStatus(
  page: Page,
  title: string,
  options: { comment?: string; dutyNumber?: string; isFinal?: boolean } = {},
): Promise<void> {
  await openStatusForm(page);
  const form = await pickStatus(page, title);
  if (options.dutyNumber) await form.getByLabel("Номер наряда").fill(options.dutyNumber);
  if (options.comment) await form.getByLabel("Комментарий").fill(options.comment);
  const save = form.getByRole("button", { name: "Сохранить статус (Enter)" });
  await save.scrollIntoViewIfNeeded();
  await save.click();
  if (options.isFinal) {
    await page.getByRole("button", { name: "Сохранить статус и закрыть карточку" }).click();
  }
  await expect(page.getByRole("form", { name: "Смена статуса реагирования" })).toBeHidden();
}

/**
 * Строка поступившей карточки занятия в журнале АРМ: строка со ссылкой на эту учебную карточку
 * (`/arm/card/c-NNN`). Ссылка — единственный устойчивый признак: номер строки берётся из учебной
 * карточки, а в общем списке рядом живут строки фикстур ПОВ-112 с другими номерами.
 */
export function sessionRow(page: Page, cardId: string): Locator {
  return page
    .getByRole("row")
    .filter({ has: page.locator(`a[href="/arm/card/${cardId}"]`) })
    .first();
}
