/*
 * Безопасная авторизация (спека 002, T058, SC-009/SC-010): серверная HttpOnly-cookie, подделка и повтор токена,
 * выход и «выйти на всех устройствах», смена пароля, две вкладки, блокировка, open redirect.
 * Работает и на моке (штатный Playwright), и на стенде с бэкендом (`E2E_BACKEND=1` — добавляет проверку лимита попыток).
 * Свежий сервер на прогон обязателен: сессии и пароли живут в памяти/БД стенда.
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { DEMO_ACCOUNTS, loginAs } from "./helpers/auth";

const SESSION_COOKIE = "arm112_session";
const IS_BACKEND = process.env.E2E_BACKEND === "1";

/** Отдельные учётки, чтобы смена пароля и блокировки не задевали остальные сценарии. */
const PASSWORD_USER = { login: "grigorev", password: "student112", landing: /\/student(\/|$)/ };
const THROTTLE_USER = { login: "pavlov", landing: /\/student(\/|$)/ };
const BLOCKED_USER = { login: "egorov", password: "student112" };

async function fillLogin(page: Page, login: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Логин").fill(login);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
}

/** Сообщение об ошибке внутри формы (отдельно от служебного объявления маршрута Next). */
const formAlert = (page: Page, formName: string) =>
  page.getByRole("form", { name: formName }).getByRole("alert");

async function readSessionCookie(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === SESSION_COOKIE);
}

/** Поддельный токен нужной формы (заголовок.полезная нагрузка.подпись) без действительной подписи. */
function forgeToken(role: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "u-005", role, jti: "forged", exp })}.c2lnbmF0dXJl`;
}

test.describe("авторизация: cookie и токен", () => {
  test("сессия — серверная HttpOnly-cookie; JS страницы её не видит, в хранилищах токена нет", async ({
    page,
  }) => {
    await loginAs(page, "student");
    const cookie = await readSessionCookie(page);
    expect(cookie, "сервер выставил cookie сессии").toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.path).toBe("/");
    const visible = await page.evaluate(() => ({
      cookie: document.cookie,
      local: JSON.stringify(window.localStorage),
      session: JSON.stringify(window.sessionStorage),
    }));
    expect(visible.cookie).not.toContain(SESSION_COOKIE);
    expect(visible.local).not.toContain(cookie?.value ?? "?");
    expect(visible.session).not.toContain(cookie?.value ?? "?");
  });

  test("подделка cookie: неподписанный токен нужной формы не открывает кабинет", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: SESSION_COOKIE, value: forgeToken("student"), url: baseURL ?? "http://127.0.0.1:3140" },
    ]);
    await page.goto("/student");
    await page.waitForURL(/\/login/);
    await expect(page.getByLabel("Логин")).toBeVisible();
    const api = await page.request.get("/api/mock/auth/session");
    expect(api.status()).toBe(401);
  });

  test("подделка роли: токен обучающегося с ролью преподавателя не даёт данных преподавателя", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: SESSION_COOKIE, value: forgeToken("teacher"), url: baseURL ?? "http://127.0.0.1:3140" },
    ]);
    await page.goto("/teacher");
    await page.waitForURL(/\/login/);
    expect((await page.request.get("/api/mock/auth/session")).status()).toBe(401);
  });

  test("повтор токена после выхода отвергается", async ({ page, context, baseURL }) => {
    await loginAs(page, "student");
    const token = (await readSessionCookie(page))?.value ?? "";
    expect(token).not.toBe("");
    await page.getByRole("link", { name: "Выйти" }).click();
    await page.waitForURL(/\/login/);
    expect(await readSessionCookie(page)).toBeUndefined();

    await context.addCookies([
      { name: SESSION_COOKIE, value: token, url: baseURL ?? "http://127.0.0.1:3140" },
    ]);
    expect((await page.request.get("/api/mock/auth/session")).status()).toBe(401);
    await page.goto("/student");
    await page.waitForURL(/\/login/);
  });

  test("чужая роль: обучающийся получает 403 на разделах преподавателя и администратора", async ({
    page,
  }) => {
    await loginAs(page, "student");
    for (const path of ["/teacher", "/admin/users"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(403);
    }
    expect((await page.request.get("/api/mock/users")).status()).toBe(403);
  });

  test("без сессии защищённые разделы ведут на вход с returnUrl", async ({ page }) => {
    await page.goto("/student/results");
    await page.waitForURL(/\/login\?returnUrl=%2Fstudent%2Fresults/);
  });

  test("залогиненный пользователь со страницы входа уходит в свой кабинет, корень ведёт по роли", async ({
    page,
  }) => {
    await loginAs(page, "teacher");
    await page.goto("/login");
    await page.waitForURL(DEMO_ACCOUNTS.teacher.landing);
    await page.goto("/");
    await page.waitForURL(DEMO_ACCOUNTS.teacher.landing);
  });
});

test.describe("вход: ошибки, returnUrl, блокировка", () => {
  test("неверный пароль — нейтральное сообщение, остаёмся на входе, cookie нет", async ({ page }) => {
    await fillLogin(page, "ivanov", "неверный-пароль");
    await expect(formAlert(page, "Вход в систему")).toHaveText("Неверный логин или пароль");
    await expect(page).toHaveURL(/\/login/);
    expect(await readSessionCookie(page)).toBeUndefined();
  });

  test("неизвестный логин даёт то же сообщение, что и неверный пароль (не раскрываем, что именно неверно)", async ({
    page,
  }) => {
    await fillLogin(page, "нет-такого", "student112");
    await expect(formAlert(page, "Вход в систему")).toHaveText("Неверный логин или пароль");
  });

  test("заблокированная учётка — отдельное сообщение, сессии нет", async ({ page }) => {
    await fillLogin(page, BLOCKED_USER.login, BLOCKED_USER.password);
    await expect(formAlert(page, "Вход в систему")).toContainText("Учётная запись заблокирована");
    expect(await readSessionCookie(page)).toBeUndefined();
  });

  test("returnUrl: после входа возврат на запрошенную страницу", async ({ page }) => {
    await page.goto("/login?returnUrl=%2Freference");
    await page.getByLabel("Логин").fill("ivanov");
    await page.getByLabel("Пароль").fill("student112");
    await page.getByRole("button", { name: "Войти" }).click();
    await page.waitForURL(/\/reference$/);
  });

  for (const returnUrl of ["https://evil.example/", "//evil.example", "/\\evil.example"]) {
    test(`open redirect: returnUrl «${returnUrl}» игнорируется`, async ({ page }) => {
      await page.goto(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
      await page.getByLabel("Логин").fill("ivanov");
      await page.getByLabel("Пароль").fill("student112");
      await page.getByRole("button", { name: "Войти" }).click();
      await page.waitForURL(/\/student$/);
      expect(new URL(page.url()).host).not.toContain("evil");
    });
  }

  test("нет номера АРМ и шага 2FA на входе", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel(/номер АРМ/i)).toHaveCount(0);
    await expect(page.getByLabel(/код из сообщения/i)).toHaveCount(0);
  });

  test("лимит попыток входа: после серии неверных паролей вход блокируется", async ({ page }) => {
    test.skip(
      !IS_BACKEND,
      "лимит попыток входа работает на бэкенде (auth_throttle); мок-слой его не имитирует",
    );
    for (let attempt = 0; attempt < 5; attempt += 1)
      await fillLogin(page, THROTTLE_USER.login, `неверно-${attempt}`);
    await fillLogin(page, THROTTLE_USER.login, "student112");
    await expect(formAlert(page, "Вход в систему")).toContainText(/Слишком много попыток|заблокирована/);
    expect(await readSessionCookie(page)).toBeUndefined();
  });
});

test.describe("сессии: две вкладки и смена пароля", () => {
  test("«Выйти на всех устройствах» завершает сессию во второй вкладке", async ({ page, context }) => {
    await loginAs(page, "student");
    const second = await context.newPage();
    await second.goto("/student");
    await expect(second.getByRole("heading", { level: 1 })).toContainText("Здравствуйте");

    await page.goto("/account/security");
    await page.getByRole("button", { name: "Выйти на всех устройствах" }).click();
    await page.getByRole("button", { name: "Да, выйти везде" }).click();
    await page.waitForURL(/\/login/);

    await second.reload();
    await second.waitForURL(/\/login/);
    expect(await readSessionCookie(second)).toBeUndefined();
  });

  test("выход в одной вкладке — вторая теряет доступ при следующем запросе", async ({ page, context }) => {
    await loginAs(page, "student");
    const second = await context.newPage();
    await second.goto("/student/results");
    await page.getByRole("link", { name: "Выйти" }).click();
    await page.waitForURL(/\/login/);
    await second.reload();
    await second.waitForURL(/\/login/);
  });

  test("смена пароля: старый перестаёт работать, новый входит; другие устройства завершены", async ({
    page,
    browser,
  }) => {
    const changed = "Новый-пароль-2026";
    await fillLogin(page, PASSWORD_USER.login, PASSWORD_USER.password);
    await page.waitForURL(PASSWORD_USER.landing);

    /* Второе «устройство» с отдельным контекстом входит теми же данными. */
    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await fillLogin(other, PASSWORD_USER.login, PASSWORD_USER.password);
    await other.waitForURL(PASSWORD_USER.landing);

    await page.goto("/account/security");
    await page.getByLabel("Текущий пароль").fill("неверный-текущий");
    await page.getByLabel("Новый пароль", { exact: true }).fill(changed);
    await page.getByLabel("Повторите новый пароль").fill(changed);
    await page.getByRole("button", { name: "Сменить пароль" }).click();
    await expect(formAlert(page, "Смена пароля")).toContainText(/указан неверно/i);
    await expect(page).toHaveURL(/\/account\/security/);

    await page.getByLabel("Текущий пароль").fill(PASSWORD_USER.password);
    await page.getByRole("button", { name: "Сменить пароль" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Пароль изменён" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Безопасность");

    await other.reload();
    await other.waitForURL(/\/login/);
    await otherContext.close();

    await page.getByRole("link", { name: "Выйти" }).click();
    await page.waitForURL(/\/login/);
    await fillLogin(page, PASSWORD_USER.login, PASSWORD_USER.password);
    await expect(formAlert(page, "Вход в систему")).toHaveText("Неверный логин или пароль");
    await fillLogin(page, PASSWORD_USER.login, changed);
    await page.waitForURL(PASSWORD_USER.landing);

    /* Возвращаем исходный пароль: остальные сценарии не должны зависеть от порядка. */
    await page.goto("/account/security");
    await page.getByLabel("Текущий пароль").fill(changed);
    await page.getByLabel("Новый пароль", { exact: true }).fill(PASSWORD_USER.password);
    await page.getByLabel("Повторите новый пароль").fill(PASSWORD_USER.password);
    await page.getByRole("button", { name: "Сменить пароль" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Пароль изменён" })).toBeVisible();
  });

  test("слабый пароль отклоняется до запроса, подтверждение должно совпадать", async ({ page }) => {
    await loginAs(page, "student");
    await page.goto("/account/security");
    await page.getByLabel("Текущий пароль").fill("student112");
    await page.getByLabel("Новый пароль", { exact: true }).fill("abc");
    await page.getByLabel("Повторите новый пароль").fill("abd");
    await page.getByRole("button", { name: "Сменить пароль" }).click();
    await expect(page.getByText(/не менее \d+ символов/)).toBeVisible();
    await expect(page.getByText("Пароли не совпадают")).toBeVisible();
  });
});
