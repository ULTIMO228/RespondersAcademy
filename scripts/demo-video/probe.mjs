import { chromium } from "@playwright/test";
const b = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, locale: "ru-RU" });
const p = await ctx.newPage();
const base = "http://localhost:3130";
await p.goto(base + "/login");
await p.getByLabel("Логин").fill("ivanov");
await p.getByLabel("Пароль").fill("student112");
await p.getByRole("button", { name: "Войти" }).click();
await p.waitForURL(/\/student/);
for (const path of ["/student", "/student/assignments", "/student/results", "/student/analytics", "/reference"]) {
  await p.goto(base + path);
  await p.waitForTimeout(1200);
  console.log("==", path, await p.title());
  console.log((await p.locator("main, body").first().innerText()).slice(0, 500).replace(/\n+/g, " | "));
  console.log("links:", (await p.locator("nav a").allInnerTexts()).join(" / "));
}
await p.screenshot({ path: process.env.SHOT ?? "/tmp/x.png" });
await b.close();
