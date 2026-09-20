/* Общие шаги RTL-тестов ленты: рендер с тестовыми зависимостями и прокрутка fake timers с промисами. */
import { act, render } from "@testing-library/react";
import { vi } from "vitest";

import usersJson from "@mocks/users.json";
import type { PublicUser } from "@/shared/api";

import { createTestDeps } from "../lib/journalFakeApi.testing";
import { IncidentJournal } from "./IncidentJournal";

export const DEMO_NOW = "2026-09-17T11:50:44+03:00";
const FLUSH_ROUNDS = 5;

export function findStudent(id: string): PublicUser {
  const user = (usersJson.users as unknown as PublicUser[]).find((item) => item.id === id);
  if (!user) throw new Error(id);
  return user;
}

export const STUDENT = findStudent("u-005");

/** Прокрутка времени с отработкой промисов мок-клиента (fetch → setState). */
export async function advance(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    for (let round = 0; round < FLUSH_ROUNDS; round += 1) await Promise.resolve();
  });
}

export async function renderJournal(deps = createTestDeps(), student: PublicUser = STUDENT) {
  const view = render(<IncidentJournal student={student} deps={deps} />);
  await advance();
  await advance();
  return { ...view, deps };
}
