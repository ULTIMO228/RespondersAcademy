import { describe, expect, it } from "vitest";

import { createCookieStorage, createMemoryStorage, createWebStorage } from "./index";

describe("createCookieStorage", () => {
  it("пишет cookie с Path=/, SameSite=Lax, Max-Age и кодированием; читает обратно", () => {
    const writes: string[] = [];
    const fakeDocument = {
      get cookie() {
        return "other=1; arm112_session=%7B%22a%22%3A1%7D";
      },
      set cookie(value: string) {
        writes.push(value);
      },
    };
    const storage = createCookieStorage(fakeDocument);
    expect(storage.get("arm112_session")).toBe('{"a":1}');
    expect(storage.get("missing")).toBeNull();
    storage.set("arm112_session", '{"a":1}', { maxAgeSeconds: 60 });
    storage.remove("arm112_session");
    expect(writes).toEqual([
      "arm112_session=%7B%22a%22%3A1%7D; Path=/; SameSite=Lax; Max-Age=60",
      "arm112_session=; Path=/; SameSite=Lax; Max-Age=0",
    ]);
  });

  it("в jsdom работает с document.cookie: set → get → remove", () => {
    const storage = createCookieStorage();
    storage.set("probe", "значение");
    expect(storage.get("probe")).toBe("значение");
    storage.remove("probe");
    expect(storage.get("probe")).toBeNull();
  });
});

describe("createMemoryStorage / createWebStorage", () => {
  it("память: начальные значения, set, remove", () => {
    const storage = createMemoryStorage({ a: "1" });
    storage.set("b", "2");
    storage.remove("a");
    expect([storage.get("a"), storage.get("b")]).toEqual([null, "2"]);
  });

  it("Web Storage: недоступность хранилища не бросает исключений", () => {
    const broken = createWebStorage(() => {
      throw new Error("SecurityError");
    });
    expect(broken.get("x")).toBeNull();
    expect(() => broken.set("x", "1")).not.toThrow();
    const local = createWebStorage(() => window.localStorage);
    local.set("x", "1");
    expect(local.get("x")).toBe("1");
    local.remove("x");
  });
});
