// @vitest-environment node
/*
 * T4.1-01: сид журнала аудита mocks/admin/audit-log.json.
 * Проверяем схему AuditLogEntry (обязательные поля, ISO-метки со смещением +03:00, id-формат
 * spec/mocks/README.md), наличие примеров всех типов событий из 21-admin-system.md §4 и обезличенность.
 */
import { describe, expect, it } from "vitest";

import type { AuditLogEntry, Role } from "../types";
import { readAuditLog } from "./readers";
import { listAuditLog } from "./store-admin";
import { resetMockStore } from "./store";

const ROLES: readonly Role[] = ["student", "teacher", "admin"];
const AUDIT_ID = /^audit-\d{3}$/;
const USER_ID = /^u-\d{3}$/;
const MOSCOW_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+03:00$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const CARD_ID = /^(c-\d{3}|card-[a-z0-9-]+)$/;
const RETENTION_MONTHS = 6;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/** Типы событий журнала аудита (21-admin-system.md §4), включая «Нарушения исправлены» (ПОВ-112 v2.1). */
const REQUIRED_ACTIONS = [
  "auth.login",
  "user.create",
  "user.update",
  "user.roleChange",
  "user.block",
  "user.unblock",
  "user.passwordReset",
  "evaluation.override",
  "settings.update",
  "backup.run",
  "card.notNotified",
  "card.notCompleted",
  "card.refused",
  "card.registered",
  "card.processed",
  "card.checked",
  "card.violationsFixed",
];

const entries: readonly AuditLogEntry[] = readAuditLog();

describe("сид журнала аудита (mocks/admin/audit-log.json)", () => {
  it("каждая запись соответствует схеме AuditLogEntry", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.id).toMatch(AUDIT_ID);
      expect(entry.at).toMatch(MOSCOW_ISO);
      expect(Number.isNaN(Date.parse(entry.at))).toBe(false);
      expect(entry.userId).toMatch(USER_ID);
      expect(ROLES).toContain(entry.role);
      expect(entry.action).toMatch(/^[a-z]+\.[a-zA-Z]+$/);
      expect(entry.details).toMatch(/[А-Яа-яЁё]/);
      if (entry.ip !== undefined) expect(entry.ip).toMatch(IPV4);
      if (entry.cardId !== undefined) expect(entry.cardId).toMatch(CARD_ID);
      if (entry.operatorArm !== undefined) expect(Number.isInteger(entry.operatorArm)).toBe(true);
    }
  });

  it("id уникальны, записи упорядочены от новых к старым", () => {
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
    const times = entries.map((entry) => Date.parse(entry.at));
    expect([...times].sort((left, right) => right - left)).toEqual(times);
  });

  it("есть хотя бы одна запись каждого типа события, включая «Нарушения исправлены»", () => {
    const actions = new Set(entries.map((entry) => entry.action));
    for (const action of REQUIRED_ACTIONS) expect([...actions]).toContain(action);
    expect(actions.has("card.violationsFixed")).toBe(true);
  });

  it("события карточек и операторов заполняют поля фильтров «по карточке» / «по оператору»", () => {
    const cardEvents = entries.filter((entry) => entry.action.startsWith("card."));
    expect(cardEvents.length).toBeGreaterThan(0);
    expect(cardEvents.every((entry) => entry.cardId !== undefined)).toBe(true);
    expect(cardEvents.every((entry) => entry.operatorArm !== undefined)).toBe(true);
  });

  it("глубина сида покрывает срок хранения журналов (≥ 6 мес, ТЗ §9)", () => {
    const times = entries.map((entry) => Date.parse(entry.at));
    expect(Math.max(...times) - Math.min(...times)).toBeGreaterThanOrEqual(RETENTION_MONTHS * MONTH_MS);
  });

  it("данные обезличены: нет паролей, телефонов и e-mail (Q&A в10)", () => {
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toMatch(/"password"/);
    expect(serialized).not.toMatch(/admin112|teacher112|student112/);
    expect(serialized).not.toMatch(/\+7\d{10}|\b8\d{10}\b/);
    expect(serialized).not.toMatch(/[\w.]+@[\w.]+/);
  });

  it("store сидируется журналом и продолжает нумерацию id", () => {
    resetMockStore();
    expect(listAuditLog()).toEqual([...entries]);
  });
});
