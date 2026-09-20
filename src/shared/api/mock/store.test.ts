// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readAuditLog, readSessions, readUsers } from "./readers";
import { MOCK_ID_PREFIX, nextMockId, resetMockStore } from "./store";
import { addCardSms, addCardStatusEvent, addCardWorkLine, readCardRuntime } from "./store-cards";
import { appendAuditEntry, listAuditLog, toPublicUser, updateStoredUser } from "./store-admin";
import {
  addAttemptStatus,
  findStoredAttempt,
  findStoredSession,
  updateStoredSession,
} from "./store-training";

const FIXTURE_ID = "card-881412";
const FIXTURE_WITH_SMS_ID = "card-36814859";
const ATTEMPT_ID = "att-01";
const FINISHED_SESSION_ID = "ses-2026-09-16-01";
const BLOCKED_USER_ID = "u-010";

beforeEach(() => {
  resetMockStore();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-19T09:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("store: статусные события карточки", () => {
  it("запись события → последующее чтение карточки возвращает его (метка +03:00)", () => {
    const created = addCardStatusEvent(FIXTURE_ID, { ddsStatus: "notAccepted", comment: "Вне компетенции" });
    expect(created).toMatchObject({ id: "st-001", cardId: FIXTURE_ID, at: "2026-09-19T12:00:00+03:00" });
    expect(readCardRuntime(FIXTURE_ID).statusEvents).toEqual([created]);
  });

  it("id записей — с префиксами и сквозной нумерацией", () => {
    addCardStatusEvent(FIXTURE_ID, { ddsStatus: "accepted" });
    expect(addCardStatusEvent(FIXTURE_ID, { ddsStatus: "responseStarted" }).id).toBe("st-002");
    const workLine = addCardWorkLine(FIXTURE_ID, {
      operator: "оп. 14",
      at: "2026-09-19T12:00:00+03:00",
      service: "Служба 101",
      calledTo: "101",
      person: "Иванов",
      message: "Сообщение передано",
    });
    expect(workLine.id).toBe("wl-001");
  });

  it("SMS фикстуры засеяны как входящие, новые — добавляются", () => {
    expect(readCardRuntime(FIXTURE_WITH_SMS_ID).sms).toHaveLength(1);
    addCardSms(FIXTURE_WITH_SMS_ID, { direction: "outgoing", text: "Помощь направлена" });
    expect(readCardRuntime(FIXTURE_WITH_SMS_ID).sms.map((sms) => sms.direction)).toEqual([
      "incoming",
      "outgoing",
    ]);
  });
});

describe("store: попытки и занятия", () => {
  it("статус попытки виден при повторном чтении", () => {
    addAttemptStatus(ATTEMPT_ID, { ddsStatus: "arrived", at: "2026-09-16T10:04:00+03:00" });
    const stored = findStoredAttempt(ATTEMPT_ID);
    expect(stored?.sessionId).toBe(FINISHED_SESSION_ID);
    expect(stored?.attempt.statuses.at(-1)?.ddsStatus).toBe("arrived");
  });

  it("новые id не пересекаются с моками (продолжение нумерации)", () => {
    expect(nextMockId(MOCK_ID_PREFIX.scenario)).toBe("s-037");
    expect(nextMockId(MOCK_ID_PREFIX.attempt)).toBe("att-005");
  });

  it("неизвестные id → undefined", () => {
    expect(findStoredSession("ses-nope")).toBeUndefined();
    expect(updateStoredSession("ses-nope", () => undefined)).toBeUndefined();
    expect(addAttemptStatus("att-nope", { ddsStatus: "accepted", at: "" })).toBeUndefined();
  });
});

describe("store: reset, изоляция и неизменность исходных данных", () => {
  it("resetMockStore восстанавливает исходное состояние", () => {
    addCardStatusEvent(FIXTURE_ID, { ddsStatus: "accepted" });
    updateStoredSession(FINISHED_SESSION_ID, (draft) => {
      draft.state = "reported";
    });
    resetMockStore();
    expect(readCardRuntime(FIXTURE_ID).statusEvents).toEqual([]);
    expect(findStoredSession(FINISHED_SESSION_ID)?.state).toBe("finished");
    expect(nextMockId(MOCK_ID_PREFIX.statusEvent)).toBe("st-001");
  });

  it("изоляция между тестами: предыдущие записи не видны", () => {
    expect(readCardRuntime(FIXTURE_ID).statusEvents).toEqual([]);
    // Журнал аудита сидируется mocks/admin/audit-log.json (T4.1-01): рантайм-записей нет.
    expect(listAuditLog()).toEqual([...readAuditLog()]);
  });

  it("мутации store не трогают объекты ридеров", () => {
    updateStoredUser(BLOCKED_USER_ID, (draft) => {
      draft.isActive = true;
    });
    addAttemptStatus(ATTEMPT_ID, { ddsStatus: "arrived", at: "2026-09-16T10:04:00+03:00" });
    expect(readUsers().find((user) => user.id === BLOCKED_USER_ID)?.isActive).toBe(false);
    const originalAttempt = readSessions()[0].cardEvents[0];
    expect(originalAttempt.statuses.map((mark) => mark.ddsStatus)).toEqual(["accepted", "workDone"]);
  });

  it("отданные копии не связаны с живым состоянием", () => {
    const session = findStoredSession(FINISHED_SESSION_ID);
    if (session) session.state = "draft";
    expect(findStoredSession(FINISHED_SESSION_ID)?.state).toBe("finished");
  });
});

describe("store: админка", () => {
  it("аудит-запись с id, ISO-меткой и userId; новые — первыми", () => {
    // Нумерация продолжает сид mocks/admin/audit-log.json (T4.1-01), а не начинается с audit-001.
    const seedCount = readAuditLog().length;
    const first = appendAuditEntry({
      userId: "u-001",
      role: "admin",
      action: "user.block",
      details: "u-010",
    });
    const second = appendAuditEntry({
      userId: "u-001",
      role: "admin",
      action: "user.unblock",
      details: "u-010",
    });
    const expectedId = `audit-${String(seedCount + 2).padStart(3, "0")}`;
    expect(first.id).toBe(`audit-${String(seedCount + 1).padStart(3, "0")}`);
    expect(second).toMatchObject({ id: expectedId, at: "2026-09-19T12:00:00+03:00", userId: "u-001" });
    expect(listAuditLog()[0].id).toBe(expectedId);
    expect(listAuditLog()).toHaveLength(seedCount + 2);
  });

  it("toPublicUser не отдаёт пароль", () => {
    const publicUser = toPublicUser(readUsers()[0]);
    expect(publicUser).not.toHaveProperty("password");
    expect(JSON.stringify(publicUser)).not.toContain("admin112");
  });
});
