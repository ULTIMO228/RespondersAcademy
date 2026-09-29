/*
 * Автозапись демо-видео (≤ 5 мин) по сценарию docs/demo-script.md на РЕАЛЬНОМ стенде `./scripts/demo-up.sh`.
 * Экран — настоящая запись Playwright, закадровый голос — синтез macOS (`say -v Milena`), сборка — ffmpeg.
 *
 *   CHROME=<путь к chrome-headless-shell> FFMPEG=<путь к ffmpeg> CHAIN_ADDRESS='<адрес из seed_chain_demo.py>' \
 *   node scripts/demo-video/record.mjs
 *
 * Переменные: BASE_URL (по умолчанию http://localhost:3130), OUT (итоговый mp4, по умолчанию docs/demo.mp4),
 * WORK (каталог промежуточных файлов), FAST=1 — прогон без пауз и без записи (отладка шагов).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3130";
const FAST = process.env.FAST === "1";
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const OUT = resolve(process.env.OUT ?? "docs/demo.mp4");
const WORK = resolve(process.env.WORK ?? "scripts/demo-video/.work");
const ADDRESS = process.env.CHAIN_ADDRESS ?? "";
if (!ADDRESS) throw new Error("Нужен CHAIN_ADDRESS (вывод backend/scripts/seed_chain_demo.py)");

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  locale: "ru-RU",
  timezoneId: "Europe/Moscow",
  ...(FAST ? {} : { recordVideo: { dir: WORK, size: { width: 1920, height: 1080 } } }),
});

/* Оверлей монтажа: титры внизу кадра и точка-курсор (в записи Playwright системного курсора нет). Переживает переходы. */
await context.addInitScript(() => {
  const mount = () => {
    if (document.getElementById("__demo-cap")) return;
    const cap = document.createElement("div");
    cap.id = "__demo-cap";
    cap.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;padding:14px 32px;font:600 26px/1.3 system-ui,sans-serif;" +
      "color:#fff;background:rgba(20,28,40,.86);text-align:center;pointer-events:none;display:none";
    const dot = document.createElement("div");
    dot.id = "__demo-dot";
    dot.style.cssText =
      "position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;" +
      "background:rgba(255,196,0,.75);border:2px solid #fff;pointer-events:none;left:-50px;top:-50px;transition:left .05s,top .05s";
    document.documentElement.append(cap, dot);
    const store = (() => {
      try {
        return sessionStorage;
      } catch {
        return { getItem: () => null, setItem: () => undefined };
      }
    })();
    const saved = store.getItem("__demo-cap");
    if (saved) {
      cap.textContent = saved;
      cap.style.display = "block";
    }
    const pos = store.getItem("__demo-pos");
    if (pos) {
      const [x, y] = pos.split(",");
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
    }
    addEventListener("mousemove", (e) => {
      dot.style.left = `${e.clientX}px`;
      dot.style.top = `${e.clientY}px`;
      store.setItem("__demo-pos", `${e.clientX},${e.clientY}`);
    });
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mount);
  else mount();
});

const page = await context.newPage();
await page.goto(`${BASE}/login`);
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
const pause = (ms) => (FAST ? Promise.resolve() : page.waitForTimeout(ms));

async function caption(text) {
  await page.evaluate((value) => {
    const cap = document.getElementById("__demo-cap");
    try {
      sessionStorage.setItem("__demo-cap", value);
    } catch {}
    if (cap) {
      cap.textContent = value;
      cap.style.display = value ? "block" : "none";
    }
  }, text);
}

/** Плавный подвод курсора и клик — зрителю видно, куда нажимает обучающийся. */
async function click(locator, wait = 700) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: FAST ? 1 : 18 });
  await pause(350);
  await locator.click();
  await pause(wait);
}

async function type(locator, text) {
  await click(locator, 200);
  await locator.fill("");
  if (FAST) await locator.fill(text);
  else await locator.pressSequentially(text, { delay: 35 });
  await pause(300);
}

async function login(role) {
  await context.clearCookies();
  await page.goto(`${BASE}/login`);
  await pause(800);
  await type(page.getByLabel("Логин"), role.login);
  await type(page.getByLabel("Пароль"), role.password);
  await click(page.getByRole("button", { name: "Войти" }), 400);
  await page.waitForURL(role.landing, { timeout: 30_000 });
  await pause(1200);
}

const STUDENT = { login: "ivanov", password: "student112", landing: /\/student/ };
const TEACHER = { login: "morozova", password: "teacher112", landing: /\/teacher/ };
const ADMIN = { login: "admin", password: "admin112", landing: /\/admin/ };

/* ---------- Сцены: [название, реплика диктора, шаги] ---------- */

let operatorUrl = `${BASE}/arm/operator112?assignmentId=asg-003`;
const scenes = [];
const scene = (title, narration, run) => scenes.push({ title, narration, run });

scene(
  "Сценарии демонстрации",
  "Учебный эмулятор АРМ-112 для подготовки операторов ДДС Москвы. Покажем четыре сценария: обучающийся принимает вызов в режиме сто двенадцать, сквозная цепочка до диспетчера ДДС с подтверждением преподавателя, работа преподавателя и работа администратора. Всё работает в закрытом контуре, на синтетических данных.",
  async () => {
    await page.goto(`${BASE}/login`);
    await page.evaluate(() => {
      const el = document.createElement("div");
      el.id = "__demo-title";
      el.style.cssText =
        "position:fixed;inset:0;z-index:2147483000;background:#0f2a4a;color:#fff;font-family:system-ui,sans-serif;" +
        "display:flex;flex-direction:column;justify-content:center;padding:0 200px;gap:22px";
      el.innerHTML =
        "<div style='font-size:64px;font-weight:700'>Responders Academy — учебный АРМ-112</div>" +
        "<div style='font-size:30px;opacity:.85;margin-bottom:24px'>Тренажёр операторов ДДС. Демонстрация сценариев работы</div>" +
        "<div style='font-size:34px'>1 · Обучающийся: приём вызова 112, опросная карта, разбор</div>" +
        "<div style='font-size:34px'>2 · Цепочка 112 → ДДС: подтверждение преподавателем и этап диспетчера</div>" +
        "<div style='font-size:34px'>3 · Преподаватель: назначения, сценарии, контроль</div>" +
        "<div style='font-size:34px'>4 · Администратор: состояние системы, аудит, безопасность</div>" +
        "<div style='font-size:24px;opacity:.7;margin-top:30px'>Локальный контур · синтетические данные · ИИ — только имитация, решение за преподавателем</div>";
      document.body.append(el);
    });
    await pause(1000);
  },
);

scene(
  "Вход обучающегося",
  "Сценарий первый. Обучающийся входит по логину и паролю. Сессия выдаётся сервером в защищённой куки. На главной сразу видны показатели, нормативы реакции тридцать секунд и отработки три минуты, и ближайшее задание.",
  async () => {
    await page.evaluate(() => document.getElementById("__demo-title")?.remove());
    await login(STUDENT);
    await pause(2500);
  },
);

scene(
  "Задание и рабочее место 112",
  "Открываем задания и запускаем тренировочную цепочку. Внутри симулятора экран повторяет боевое рабочее место: поля, термины и статусы как в системе сто двенадцать. Отвечаем на входящий вызов, фиксируем заявителя, описание и адрес из локального справочника.",
  async () => {
    await click(page.getByRole("link", { name: "Задания", exact: true }).first());
    await pause(1500);
    const card = page.getByRole("article", { name: "Цепочка 112 → ДДС (демо)" });
    await card.waitFor();
    await click(card.getByRole("button", { name: "Начать" }), 1500);
    await page.waitForURL(/\/arm\/operator112\?assignmentId=/);
    await click(page.getByRole("button", { name: "Ответить на вызов" }), 1500);
    await type(page.getByLabel("ФИО"), "Учебный заявитель");
    await type(page.getByLabel("Статус заявителя"), "очевидец");
    await type(
      page.getByLabel("Описание"),
      "Сильный ветер повалил дерево на проезжую часть, пострадавших нет",
    );
    await type(page.getByLabel("Описательный адрес"), ADDRESS);
  },
);

scene(
  "Опросная карта и передача",
  "Выбираем происшествие «Дерево» и заполняем опросную карту по классификатору ЕКП. Система определяет состав служб реагирования. Передаём карточку и сразу получаем разбор: баллы, сличение с эталоном. Подсказки помечены бейджем ИИ, итоговое решение остаётся за преподавателем.",
  async () => {
    await page.getByLabel("Происшествие").selectOption("Дерево");
    await pause(1500);
    const chips = page.locator('section[aria-label="Опросная карта"] button[aria-pressed="false"]');
    for (let step = 0; step < 4; step += 1) {
      if (await page.getByText("не определён").isHidden()) break;
      await click(chips.first(), 900);
    }
    await pause(1500);
    await click(page.getByRole("button", { name: "Передать карточку" }), 1000);
    await page.getByLabel("Разбор попытки").waitFor({ timeout: 30_000 });
    await pause(4000);
  },
);

scene(
  "Этап ДДС ждёт преподавателя",
  "Сценарий второй, сквозная цепочка. Этап диспетчера ДДС не открывается, пока преподаватель не подтвердит карточку обучающегося. Система прямо объясняет причину.",
  async () => {
    await click(page.getByRole("button", { name: "Начать этап ДДС" }), 1200);
    await page.getByRole("alert").filter({ hasText: "подтверждения преподавателя" }).waitFor();
    await pause(2500);
  },
);

scene(
  "Преподаватель подтверждает карточку",
  "Переходим в кабинет преподавателя. В назначении цепочки видна версия сценария, ожидающая проверки. Преподаватель открывает её, просматривает и утверждает. После этого обучающийся может продолжить.",
  async () => {
    operatorUrl = page.url();
    await login(TEACHER);
    await page.goto(`${BASE}/teacher/assignments`);
    await pause(1500);
    await page.goto(`${BASE}/teacher/assignments/asg-003`);
    await pause(2000);
    const link = page.getByRole("link", { name: /scn-|версия/ }).first();
    await click(link, 2000);
    await page.getByRole("button", { name: "Утвердить версию" }).waitFor({ timeout: 20_000 });
    await pause(1500);
    await click(page.getByRole("button", { name: "Утвердить версию" }), 1500);
    await pause(2500);
  },
);

scene(
  "Этап ДДС: диспетчер принимает карточку",
  "Возвращаемся к обучающемуся и начинаем этап ДДС. Диспетчер принимает карточку, указывает номер наряда и меняет статус реагирования. Служба отвечает: расчёт выехал к месту вызова. Ниже доступна запись голосового доклада дежурной смене.",
  async () => {
    await login(STUDENT);
    await page.goto(operatorUrl);
    await pause(1500);
    const start = page.getByRole("button", { name: "Начать этап ДДС" });
    if (await start.isVisible().catch(() => false)) await click(start, 1500);
    await page.waitForURL(/\/arm\/card\//, { timeout: 30_000 });
    await page.getByLabel("Действие диспетчера").waitFor({ timeout: 30_000 });
    await pause(2000);
    await click(page.getByRole("button", { name: "Сменить статус (Alt + E)" }), 800);
    const form = page.getByRole("form", { name: "Смена статуса реагирования" });
    await click(form.getByRole("button", { name: "Статус", exact: true }), 800);
    await click(form.getByRole("option", { name: "Принята", exact: true }), 600);
    await type(form.getByLabel("Номер наряда"), "32");
    const save = form.getByRole("button", { name: "Сохранить статус (Enter)" });
    await click(save, 800);
    await page.getByText(/Расчёт выехал к месту вызова/).waitFor({ timeout: 30_000 });
    await pause(2500);
  },
);

scene(
  "Работы завершены",
  "Сообщения служб приходят в ленту в реальном времени: выезд, прибытие, работы завершены. Полный цикл статусов реагирования обязателен по нормативу.",
  async () => {
    await page.getByText(/Работы завершены/).waitFor({ timeout: 90_000 });
    await pause(2500);
  },
);

scene(
  "Результаты и аналитика обучающегося",
  "В кабинете обучающегося накапливается история попыток и аналитика: динамика баллов, соблюдение нормативов, типичные ошибки. Рекомендации ведут в справочник, где сто пять статей базы знаний, служебные номера и горячие клавиши АРМ.",
  async () => {
    await page.goto(`${BASE}/student/results`);
    await pause(3000);
    await page.goto(`${BASE}/student/analytics`);
    await pause(4000);
    await page.goto(`${BASE}/reference`);
    await pause(3500);
  },
);

scene(
  "Кабинет преподавателя",
  "Сценарий третий, преподаватель. На главной подсвечены обучающиеся в зоне риска. В назначениях он создаёт тренировки и экзамены, выбирает группу, билеты и нормативы, а в сценариях проверяет эталоны и утверждает их.",
  async () => {
    await login(TEACHER);
    await pause(3500);
    await page.goto(`${BASE}/teacher/assignments`);
    await pause(3500);
    await page.goto(`${BASE}/teacher/scenarios`);
    await pause(4000);
  },
);

scene(
  "Кабинет администратора",
  "Сценарий четвёртый, администратор. Состояние системы и локальных моделей, журнал аудита событий безопасности и политика паролей и блокировок. Двухфакторная аутентификация вынесена на второй этап.",
  async () => {
    await login(ADMIN);
    await pause(3000);
    await page.goto(`${BASE}/admin/audit`);
    await pause(3500);
    await page.goto(`${BASE}/admin/security`);
    await pause(3500);
  },
);

scene(
  "Итоги",
  "Итог. Полный учебный контур от настройки занятия преподавателем до отработки карточек и отчёта. Работает автономно, без внешних сервисов. Искусственный интеллект честно помечен, а окончательная оценка остаётся за преподавателем. Спасибо за внимание.",
  async () => {
    await page.goto(`${BASE}/login`);
    await pause(1500);
  },
);

/* ---------- Выполнение и озвучка ---------- */

const timeline = [];
for (const [index, item] of scenes.entries()) {
  const audio = resolve(WORK, `s${String(index).padStart(2, "0")}.aiff`);
  execFileSync("say", ["-v", "Milena", "-r", "170", "-o", audio, item.narration]);
  const info = execFileSync("afinfo", [audio]).toString();
  const duration = Number(info.match(/estimated duration: ([\d.]+)/)?.[1] ?? 0);

  const start = now();
  await caption(item.title);
  console.log(`▸ [${start.toFixed(1)} с] ${item.title} (реплика ${duration.toFixed(1)} с)`);
  await item.run();
  await caption(item.title);
  const spent = now() - start;
  if (!FAST && spent < duration + 0.7) await page.waitForTimeout((duration + 0.7 - spent) * 1000);
  timeline.push({ audio, start, end: now() });
}
const total = now();
console.log(`Итого сценарий: ${total.toFixed(1)} с`);

await context.close();
await browser.close();

if (FAST) process.exit(0);

const webm = readdirSync(WORK).find((name) => name.endsWith(".webm"));
if (!webm) throw new Error("Playwright не сохранил видео");
renameSync(resolve(WORK, webm), resolve(WORK, "screen.webm"));

const inputs = ["-i", resolve(WORK, "screen.webm"), ...timeline.flatMap((t) => ["-i", t.audio])];
const delays = timeline.map((t, i) => `[${i + 1}:a]adelay=${Math.round(t.start * 1000)}|${Math.round(t.start * 1000)}[a${i}]`);
const mix = `${timeline.map((_, i) => `[a${i}]`).join("")}amix=inputs=${timeline.length}:normalize=0[aout]`;
mkdirSync(resolve(OUT, ".."), { recursive: true });
execFileSync(
  FFMPEG,
  [
    "-y", ...inputs,
    "-filter_complex", `${delays.join(";")};${mix}`,
    "-map", "0:v", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
    "-t", String(total + 0.5), "-movflags", "+faststart", OUT,
  ],
  { stdio: "inherit" },
);
console.log(`Готово: ${OUT}, длительность сценария ${total.toFixed(1)} с`);
