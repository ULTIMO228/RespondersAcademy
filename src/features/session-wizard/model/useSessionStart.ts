"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ROUTES } from "@/shared/config";
import type { SessionCreateRequest } from "@/shared/api";

import { useSessionWizardApi } from "./deps";
import type { WizardState } from "./useWizardState";

export type StartStatus = "idle" | "starting" | "error";

const FALLBACK_ERROR = "Не удалось начать занятие";

function toMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : FALLBACK_ERROR;
}

/** Конфигурация занятия из состояния мастера: контракт POST /sessions + план расписания (SessionPlan). */
export function buildCreateRequest(teacherId: string, state: WizardState): SessionCreateRequest {
  return {
    teacherId,
    studentIds: [...state.studentIds],
    scenarioIds: [...state.scenarioIds],
    mode: state.mode,
    cardSource: state.cardSource,
    timeNorms: { primaryReactionSec: state.reactionSec, fullProcessingSec: state.processingSec },
    plan: {
      categories: [...state.categories],
      issueOrder: state.order,
      hints: state.hasHints,
      timeNorms: { primaryReactionSec: state.reactionSec, fullProcessingSec: state.processingSec },
      maxGrammarErrors: state.maxGrammarErrors,
      paceSec: state.paceSec,
      conveyor: state.isConveyor,
    },
  };
}

/**
 * «Начать занятие» (T3.2-10): POST /sessions (state `configured`) → POST /sessions/[id]/start
 * (state `running`, расписание по плану мастера) → переход на мониторинг `/teacher`.
 */
export function useSessionStart(teacherId: string, state: WizardState) {
  const api = useSessionWizardApi();
  const router = useRouter();
  const [status, setStatus] = useState<StartStatus>("idle");
  const [message, setMessage] = useState("");

  async function start() {
    setStatus("starting");
    setMessage("");
    try {
      const created = await api.createSession(buildCreateRequest(teacherId, state));
      await api.startSession(created.id);
      router.push(ROUTES.teacher);
    } catch (error: unknown) {
      setStatus("error");
      setMessage(toMessage(error));
    }
  }

  return { status, message, start };
}
