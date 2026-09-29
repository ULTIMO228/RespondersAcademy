"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { IncidentCardView } from "@/widgets/incident-card";
import { ServicePanel } from "@/widgets/service-panel";
import { getMainServiceIds } from "@/entities/service";
import { isNormExceeded, resolveTimeNorms } from "@/entities/session";
import type { PublicUser } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { formatDuration } from "@/shared/lib";
import type { Clock, KeyValueStorage } from "@/shared/lib";

import { getServiceNames, pickMyServiceId } from "../lib/cardView";
import { getHintText } from "../lib/hints";
import { findNextCardId } from "../lib/nextCard";
import { buildTraineeHistory } from "../lib/serviceHistory";
import type { IncidentData } from "../model/loadIncident";
import { useAttemptEvaluation } from "../model/useAttemptEvaluation";
import { useCardControls } from "../model/useCardControls";
import { useCardHotkeys } from "../model/useCardHotkeys";
import { browserStorage, useCardSession } from "../model/useCardSession";
import { useCardStatuses } from "../model/useCardStatuses";
import { useProcessingTimer } from "../model/useProcessingTimer";
import { AttemptResult } from "./attempt-result/AttemptResult";
import { AudioReportUpload } from "./AudioReportUpload";
import { ConnectionBanner } from "./ConnectionBanner";
import { HintBar } from "./HintBar";
import { HotkeyHints } from "./HotkeyHints";

import styles from "./IncidentPage.module.css";

export type IncidentWorkspaceProps = {
  data: IncidentData;
  student: PublicUser;
  amendLockSeconds?: number;
  storage?: KeyValueStorage;
  clock?: Clock;
};

/** Рабочее место по открытой карточке: карточка, панель служб, таймеры, статусы, итог попытки. */
export function IncidentWorkspace({
  data,
  student,
  amendLockSeconds = 0,
  storage = browserStorage,
  clock,
}: IncidentWorkspaceProps) {
  const router = useRouter();
  const { card, reference, scenario } = data;
  const attempt = data.attempt.attempt;
  const session = useCardSession({ cardId: card.id, studentId: student.id, runtime: data.runtime, storage });
  const statuses = useCardStatuses({
    cardId: card.id,
    attempt,
    serverStatus: session.runtime.statusEvents.at(-1)?.ddsStatus ?? null,
    ddsStatuses: reference.ddsStatuses,
    dispatch: session.outbox.dispatch,
    clock,
  });
  const norms = resolveTimeNorms(scenario);
  const timer = useProcessingTimer({
    openedAt: attempt.openedAt,
    completedAt: statuses.completedAt,
    normMs: norms.fullProcessingMs,
    clock,
  });
  const isReactionExceeded = isNormExceeded(attempt.primaryReactionMs, norms.primaryReactionMs);
  const controls = useCardControls({
    data,
    student,
    session,
    isLocked: statuses.isCompleted,
    isReactionExceeded,
    amendLockSeconds,
    storage,
    clock,
  });
  const [isStatusFormOpen, setStatusFormOpen] = useState(false);
  const [isResultShown, setResultShown] = useState(statuses.isCompleted);
  const evaluation = useAttemptEvaluation(attempt.id, statuses.isCompleted);
  const { isAltHeld } = useCardHotkeys({
    onClose: () => router.push(ROUTES.arm),
    onView: controls.amend.onView,
    onAmend: () => (statuses.isCompleted ? undefined : controls.amend.onStart()),
    onFinish: () => setStatusFormOpen(!statuses.isCompleted),
  });

  useEffect(() => {
    if (statuses.isCompleted) setResultShown(true);
  }, [statuses.isCompleted]);

  const myServiceId = pickMyServiceId(card.notificationList, reference.services);
  const mainService = data.classifierEntries.find(
    (entry) => entry.code === card.what.classifierCode,
  )?.mainService;
  const history = buildTraineeHistory({
    notificationList: card.notificationList,
    myServiceId,
    openedAt: attempt.openedAt,
    marks: statuses.marks,
  });
  const hint = getHintText(scenario?.hints, { statuses: statuses.marks.length, calls: attempt.calls.length });

  return (
    <main className={styles.page}>
      <ConnectionBanner
        isOnline={session.isOnline}
        pendingCount={session.outbox.pendingCount}
        lastError={session.outbox.lastError}
      />
      {isResultShown ? (
        <AttemptResult
          cardNumber={card.number}
          evaluation={evaluation}
          reactionMs={attempt.primaryReactionMs}
          processingMs={timer.elapsedMs}
          nextCardId={findNextCardId(card.id, student.id, data.sessions, scenario)}
          onShowCard={() => setResultShown(false)}
        />
      ) : (
        <>
          <HintBar hint={hint} />
          <IncidentCardView
            card={card}
            classifierEntries={data.classifierEntries}
            linkedCards={data.linkedCards}
            isExceeded={timer.isExceeded}
            timerValue={timer.value}
            reactionValue={formatDuration(attempt.primaryReactionMs)}
            serviceNames={getServiceNames(card.notificationList, reference.services)}
            controls={controls}
          />
          <AudioReportUpload attemptId={attempt.id} />
          <ServicePanel
            card={card}
            services={reference.services}
            serviceStatuses={reference.serviceStatuses}
            ddsStatuses={reference.ddsStatuses}
            myServiceId={myServiceId}
            mainServiceIds={getMainServiceIds(mainService ?? "")}
            history={history}
            currentDdsStatus={statuses.currentStatus}
            onStatusSubmit={statuses.submit}
            isStatusLocked={statuses.isCompleted}
            isStatusFormOpen={isStatusFormOpen}
            onStatusFormOpenChange={setStatusFormOpen}
          />
        </>
      )}
      <HotkeyHints isVisible={isAltHeld} />
    </main>
  );
}
