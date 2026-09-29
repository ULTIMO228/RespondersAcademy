"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { EXPIRY_RECHECK_MS, useOperator112 } from "../model/useOperator112";
import { examRemainingSec, resolveTimeLimitSec, useNow } from "@/entities/operator112-attempt";
import type { Clock } from "@/shared/lib";
import { ROUTES } from "@/shared/config";

import { operator112Api } from "../api/operator112Api";
import type { Operator112Api } from "../api/operator112Api";
import { Operator112Problem } from "./Operator112Problem";
import { Operator112Result } from "./Operator112Result";
import { Operator112Workspace } from "./Operator112Workspace";

import styles from "./Operator112.module.css";

type Operator112ScreenProps = {
  assignmentId: string;
  api?: Operator112Api;
  clock?: Clock;
};

/** Экран режима 112: loading / problem / рабочее место / разбор. Попытка выдаётся и восстанавливается через start задания. */
export function Operator112Screen({ assignmentId, api = operator112Api, clock }: Operator112ScreenProps) {
  const router = useRouter();
  const op = useOperator112(assignmentId, api);
  const { screen, attempt } = op;
  const isWorking = screen.status === "ready" && !op.result && !op.expired;
  const nowMs = useNow(isWorking, clock);

  useEffect(() => {
    if (screen.status === "redirect") router.replace(ROUTES.armCard(screen.cardId));
  }, [router, screen]);

  // Лимит экзамена на попытку: по нулю индикатора спрашиваем сервер (он применяет истечение при чтении задания).
  const limitSec = screen.status === "ready" ? resolveTimeLimitSec(screen.assignment.params) : null;
  const zero = isWorking && attempt !== null && examRemainingSec(attempt, limitSec, nowMs) === 0;
  const recheckBucket = zero ? Math.floor(nowMs / EXPIRY_RECHECK_MS) : -1;
  const { checkExpiry } = op;
  useEffect(() => {
    if (recheckBucket >= 0) void checkExpiry();
  }, [recheckBucket, checkExpiry]);

  if (screen.status === "problem") return <Operator112Problem problem={screen.problem} />;
  if (screen.status !== "ready" || !attempt) {
    return (
      <p className={styles.problem} role="status" data-kind="loading">
        {screen.status === "redirect" ? "Открываем карточку ДДС…" : "Выдача вызова…"}
      </p>
    );
  }
  if (op.result || op.expired) {
    return (
      <Operator112Result
        assignment={screen.assignment}
        result={op.result}
        expired={op.expired}
        nextProblem={op.nextProblem}
        onNext={() => void op.next()}
      />
    );
  }
  return (
    <Operator112Workspace
      key={attempt.id}
      assignment={screen.assignment}
      attempt={attempt}
      entries={screen.entries}
      nowMs={nowMs}
      isAnswering={op.isAnswering}
      answerError={op.answerError}
      isSubmitting={op.isSubmitting}
      errors={op.errors}
      sendEvent={(event) => api.sendEvent(attempt.id, event)}
      onAnswer={() => void op.answer()}
      onSubmit={(draft, examZero) => void op.submit(draft, examZero)}
    />
  );
}
