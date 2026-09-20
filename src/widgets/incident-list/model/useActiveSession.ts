"use client";

import { useEffect, useState } from "react";

import type { CardFlowItem, PublicUser } from "@/shared/api";

import { buildModuleCardFlow, getSessionEndsAt } from "../lib/modules";
import type { ProfileGroups } from "../lib/profileFilter";
import type { JournalApi } from "./deps";
import { useJournalDeps } from "./deps";
import { toErrorMessage } from "./loadStatus";
import { readStored, STORAGE_KEYS, writeStored } from "./storedValue";
import type { ActiveSession, AssignedModule } from "./types";

export type StartState = { status: "idle" | "starting" | "error"; message: string };

const IDLE: StartState = { status: "idle", message: "" };

function storageKey(studentId: string): string {
  return `${STORAGE_KEYS.activeSession}.${studentId}`;
}

function noProfileMessage(service: string | undefined): string {
  return `В модуле нет карточек профильных групп службы «${service ?? "—"}» — выберите другой модуль`;
}

type StartRequest = { api: JournalApi; module: AssignedModule; studentId: string; cardFlow: CardFlowItem[] };

/** POST /sessions (курсант, сценарий модуля, профильное расписание) → POST /sessions/[id]/start. */
async function createAndStart({ api, module, studentId, cardFlow }: StartRequest): Promise<ActiveSession> {
  const created = await api.createSession({
    teacherId: module.teacherId,
    studentIds: [studentId],
    scenarioIds: [module.id],
    mode: "practice",
    cardSource: "generated",
    cardFlow,
  });
  const started = await api.startSession(created.id);
  return {
    sessionId: started.id,
    scenarioId: module.id,
    title: module.shortTitle,
    startedAt: started.startedAt,
    endsAt: getSessionEndsAt(started.startedAt),
  };
}

/**
 * Занятие по модулю (T2.2-15): клик → POST /sessions (курсант, сценарий, профильное расписание cardFlow)
 * → POST /sessions/[id]/start. Активное занятие переживает перезагрузку (хранилище, ключ по курсанту).
 */
export function useActiveSession(student: PublicUser, profileGroups: ProfileGroups) {
  const { api, clock, storage } = useJournalDeps();
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [startState, setStartState] = useState<StartState>(IDLE);

  useEffect(() => {
    setActive(readStored<ActiveSession | null>(storage, storageKey(student.id), null));
  }, [storage, student.id]);

  function update(next: ActiveSession | null) {
    setActive(next);
    writeStored(storage, storageKey(student.id), next);
  }

  async function start(module: AssignedModule) {
    const cardFlow = buildModuleCardFlow(module, student.id, clock.now(), profileGroups);
    if (cardFlow.length === 0) {
      setStartState({ status: "error", message: noProfileMessage(student.service) });
      return;
    }
    setStartState({ status: "starting", message: "" });
    try {
      update(await createAndStart({ api, module, studentId: student.id, cardFlow }));
      setStartState(IDLE);
    } catch (error) {
      setStartState({ status: "error", message: toErrorMessage(error) });
    }
  }

  return { active, startState, start, clear: () => update(null) };
}
