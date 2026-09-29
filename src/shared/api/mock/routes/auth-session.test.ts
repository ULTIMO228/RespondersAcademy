// @vitest-environment node
/* Серверная сессия мок-слоя (паритет с бэкендом, T035): HttpOnly-cookie с подписанным JWT, профиль, выход, пароль. */
import { beforeEach, describe, expect, it } from "vitest";

import { POST as blockRoute } from "../../../../../app/api/mock/admin/users/[id]/block/route";
import { GET as auditRoute } from "../../../../../app/api/mock/admin/audit/route";
import { POST as loginRoute } from "../../../../../app/api/mock/auth/login/route";
import { POST as logoutRoute } from "../../../../../app/api/mock/auth/logout/route";
import { POST as logoutAllRoute } from "../../../../../app/api/mock/auth/logout-all/route";
import { POST as passwordRoute } from "../../../../../app/api/mock/auth/password/route";
import { GET as sessionRoute } from "../../../../../app/api/mock/auth/session/route";
import { SESSION_COOKIE } from "@/shared/config";
import type { ApiErrorBody, AuditLogEntry, PageResponse, PublicUser } from "../../types";
import { readRequestSession, verifySessionToken } from "../auth-tokens";
import { buildSessionCookie } from "../session-cookie";
import { resetMockStore } from "../store";

const ORIGIN = "http://localhost/api/mock/auth";
const STUDENT = { login: "ivanov", password: "student112" };

function post(path: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { ...(cookie ? { cookie } : {}), ...headers },
  });
}

function get(path: string, cookie?: string): Request {
  return new Request(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {} });
}

/** Вход: возвращает значение cookie сессии из Set-Cookie ответа и сам заголовок. */
async function signIn(credentials: object = STUDENT, headers: Record<string, string> = {}) {
  const response = await loginRoute(post("/login", credentials, undefined, headers));
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie") ?? "";
  const value = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(setCookie)?.[1] ?? "";
  return { response, setCookie, cookie: `${SESSION_COOKIE}=${value}`, token: value };
}

async function readError(response: Response): Promise<ApiErrorBody["error"]> {
  return ((await response.json()) as ApiErrorBody).error;
}

beforeEach(() => {
  resetMockStore();
});

describe("POST /auth/login — cookie сессии выдаёт сервер", () => {
  it("Set-Cookie: HttpOnly, SameSite=Lax, Path=/, Max-Age 24 ч, без Secure по http; значение — только JWT", async () => {
    const { setCookie, token } = await signIn();
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).toMatch(/Max-Age=86400/);
    expect(setCookie).not.toMatch(/Secure/);
    expect(token.split(".")).toHaveLength(3);
    expect(token).not.toContain("{");
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    expect(claims).toMatchObject({ sub: "u-005", role: "student" });
    expect(Object.keys(claims).sort()).toEqual(["aud", "exp", "iat", "iss", "jti", "role", "sub"]);
  });

  it("за HTTPS (x-forwarded-proto) добавляет Secure", async () => {
    const { setCookie } = await signIn(STUDENT, { "x-forwarded-proto": "https" });
    expect(setCookie).toMatch(/Secure/);
  });

  it("тело ответа не содержит подписанный токен", async () => {
    const { response, token } = await signIn();
    const text = await response.clone().text();
    expect(text).not.toContain(token);
    expect(text).not.toContain("student112");
  });

  it("armNumber необязателен; переданный неверно → 401; нечисловой → 400", async () => {
    expect((await loginRoute(post("/login", { ...STUDENT, armNumber: 1 }))).status).toBe(200);
    expect((await loginRoute(post("/login", { ...STUDENT, armNumber: "" }))).status).toBe(200);
    const wrong = await loginRoute(post("/login", { ...STUDENT, armNumber: 99 }));
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get("set-cookie")).toBeNull();
    expect((await loginRoute(post("/login", { ...STUDENT, armNumber: "abc" }))).status).toBe(400);
  });
});

describe("проверка токена: подделка, срок, отзыв, блокировка", () => {
  it("GET /auth/session возвращает профиль без пароля; без cookie — 401", async () => {
    const { cookie } = await signIn();
    const response = await sessionRoute(get("/session", cookie));
    expect(response.status).toBe(200);
    const profile: PublicUser & { password?: string } = await response.json();
    expect(profile).toMatchObject({ id: "u-005", login: "ivanov", role: "student" });
    expect(profile.password).toBeUndefined();
    expect((await sessionRoute(get("/session"))).status).toBe(401);
  });

  it("подделанные значения отвергаются: JSON с role admin, подмена роли в полезной нагрузке, чужая подпись", async () => {
    const { token } = await signIn();
    const [header, , signature] = token.split(".");
    const forgedClaims = Buffer.from(
      JSON.stringify({
        sub: "u-005",
        role: "admin",
        jti: "x".repeat(43),
        iss: "responders-academy",
        aud: "responders-academy-mock",
        iat: 1,
        exp: 9_999_999_999,
      }),
    ).toString("base64url");
    const forged = [
      encodeURIComponent(
        JSON.stringify({
          userId: "u-001",
          role: "admin",
          token: "x",
          twoFactorUsed: false,
          issuedAt: new Date().toISOString(),
        }),
      ),
      `${header}.${forgedClaims}.${signature}`,
      `${header}.${forgedClaims}.${"A".repeat(43)}`,
      "garbage",
    ];
    for (const value of forged) {
      expect((await sessionRoute(get("/session", `${SESSION_COOKIE}=${value}`))).status).toBe(401);
    }
  });

  it("истёкшая сессия (старше 24 ч) отвергается", () => {
    const expired = buildSessionCookie("u-005", { issuedAtMs: Date.now() - 24 * 3600 * 1000 - 5000 });
    expect(readRequestSession(get("/session", expired), Date.now())).toBeNull();
    const fresh = buildSessionCookie("u-005");
    expect(readRequestSession(get("/session", fresh), Date.now())).toMatchObject({
      userId: "u-005",
      role: "student",
    });
  });

  it("токен другого процесса (иной секрет) не проходит проверку", async () => {
    const { token } = await signIn();
    const [header, body] = token.split(".");
    expect(verifySessionToken(`${header}.${body}.${"B".repeat(43)}`, Date.now())).toBeNull();
    expect(verifySessionToken(token, Date.now())).not.toBeNull();
  });

  it("пользователь заблокирован администратором посреди сессии → следующий запрос 401", async () => {
    const { cookie } = await signIn();
    expect((await sessionRoute(get("/session", cookie))).status).toBe(200);
    const blocked = await blockRoute(post("/block", { adminId: "u-001" }), {
      params: Promise.resolve({ id: "u-005" }),
    });
    expect(blocked.status).toBe(200);
    expect((await sessionRoute(get("/session", cookie))).status).toBe(401);
  });
});

describe("POST /auth/logout, /auth/logout-all", () => {
  it("выход очищает cookie, отзывает сессию и пишет аудит; повторный выход идемпотентен", async () => {
    const { cookie } = await signIn();
    const response = await logoutRoute(post("/logout", undefined, cookie));
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toMatch(new RegExp(`${SESSION_COOKIE}=;.*Max-Age=0`));
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/);
    expect((await sessionRoute(get("/session", cookie))).status).toBe(401);
    const again = await logoutRoute(post("/logout", undefined, cookie));
    expect(again.status).toBe(204);
    const anonymous = await logoutRoute(post("/logout"));
    expect(anonymous.status).toBe(204);
    const audit = (await (
      await auditRoute(new Request("http://localhost/api/mock/admin/audit?perPage=100"))
    ).json()) as PageResponse<AuditLogEntry>;
    expect(audit.items.filter((entry) => entry.action === "auth.logout")).toHaveLength(1);
  });

  it("«выйти на всех устройствах» отзывает все сессии пользователя и требует сессию", async () => {
    const first = await signIn();
    const second = await signIn();
    expect((await logoutAllRoute(post("/logout-all"))).status).toBe(401);
    const response = await logoutAllRoute(post("/logout-all", undefined, first.cookie));
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect((await sessionRoute(get("/session", first.cookie))).status).toBe(401);
    expect((await sessionRoute(get("/session", second.cookie))).status).toBe(401);
  });
});

describe("POST /auth/password", () => {
  const change = { currentPassword: "student112", newPassword: "Novyj-parol-77" };

  it("меняет пароль: другая сессия отозвана, текущая жива, старый пароль не входит", async () => {
    const first = await signIn();
    const second = await signIn();
    const response = await passwordRoute(post("/password", change, first.cookie));
    expect(response.status).toBe(204);
    expect((await sessionRoute(get("/session", first.cookie))).status).toBe(200);
    expect((await sessionRoute(get("/session", second.cookie))).status).toBe(401);
    expect((await loginRoute(post("/login", STUDENT))).status).toBe(401);
    expect((await loginRoute(post("/login", { login: "ivanov", password: change.newPassword }))).status).toBe(
      200,
    );
  });

  it("неверный текущий, короткий и совпадающий пароль → 400 (не 401), сессия жива", async () => {
    const { cookie } = await signIn();
    const wrong = await passwordRoute(post("/password", { ...change, currentPassword: "nope" }, cookie));
    expect(wrong.status).toBe(400);
    expect((await readError(wrong)).message).toBe("Текущий пароль указан неверно");
    const weak = await passwordRoute(post("/password", { ...change, newPassword: "short" }, cookie));
    expect(weak.status).toBe(400);
    expect((await readError(weak)).message).toMatch(/не менее 8/);
    const same = await passwordRoute(post("/password", { ...change, newPassword: "student112" }, cookie));
    expect((await readError(same)).message).toMatch(/отличаться/);
    expect((await sessionRoute(get("/session", cookie))).status).toBe(200);
  });

  it("без сессии → 401", async () => {
    expect((await passwordRoute(post("/password", change))).status).toBe(401);
  });
});
