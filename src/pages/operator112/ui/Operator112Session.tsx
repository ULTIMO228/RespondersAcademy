"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { formatShortName, useLogout, useSessionUser } from "@/entities/user";
import { resolveNorms, resolveTimeLimitSec, useApplicantVoice } from "@/entities/operator112-attempt";
import { IncomingWindow } from "@/features/operator112-incoming";
import { ProblemReportDialog } from "@/features/problem-report";
import { LockedWindow, Operator112Journal } from "@/widgets/operator112-journal";
import { SimulatorBarPortal } from "@/widgets/simulator-bar";
import type {
  AssignmentDetail,
  ClassifierEntry,
  Journal112Row,
  OperatorAttempt,
  OperatorEventRequest,
} from "@/shared/api";
import { ROUTES } from "@/shared/config";
import type { Clock } from "@/shared/lib";

import type { Operator112Api } from "../api/operator112Api";
import { attemptChannel, attemptSmsText } from "../model/channel";
import { useHints } from "../model/useHints";
import { useHotkeys } from "../model/useHotkeys";
import { useJournal } from "../model/useJournal";
import type { useOperator112 } from "../model/useOperator112";
import { Operator112CardView } from "./Operator112CardView";
import { ShortGuideWindow } from "./ShortGuideWindow";
import { TrainerStrip } from "./TrainerStrip";

import styles from "./Operator112Session.module.css";

type Operator112SessionProps = {
  assignment: AssignmentDetail;
  attempt: OperatorAttempt;
  entries: ClassifierEntry[];
  op: ReturnType<typeof useOperator112>;
  api: Operator112Api;
  clock?: Clock;
  nowMs: number;
  /** Alt+M и значок «Сообщить о проблеме»; по умолчанию открывает окно фичи problem-report (T066). */
  onProblem?: () => void;
};

/**
 * Рабочее место 112 по видам (спека 009, data-model): журнал → окно входящего вызова → карточка → связи / история
 * сообщений → разбор. Карточка попытки остаётся смонтированной при уходе в журнал, связи и окна, поэтому черновик
 * не теряется. Учебные показатели уходят в полосу тренажёра, на самом экране их нет (FR-002).
 */
export function Operator112Session({
  assignment,
  attempt,
  entries,
  op,
  api,
  clock,
  nowMs,
  onProblem,
}: Operator112SessionProps) {
  const router = useRouter();
  const user = useSessionUser();
  const logout = useLogout();
  const { view } = op;
  const [notice, setNotice] = useState<string | null>(null);
  const [locked, setLocked] = useState<Journal112Row | null>(null);
  const [isProblemOpen, setProblemOpen] = useState(false);
  const [isGuideOpen, setGuideOpen] = useState(false);
  const openProblem = onProblem ?? (() => setProblemOpen(true));
  const norms = resolveNorms(assignment.params);
  const limitSec = resolveTimeLimitSec(assignment.params);
  const channel = attemptChannel(attempt);

  const sendEvent = useCallback(
    (event: OperatorEventRequest) => api.sendEvent(attempt.id, event),
    [api, attempt.id],
  );
  const hints = useHints(attempt, nowMs, sendEvent);
  const voice = useApplicantVoice({ attempt, format: assignment.format });
  const voiceStarted = useRef(false);

  // Голос заявителя стартует с «Принять» (жест пользователя); после перезагрузки страницы — при входе в принятую попытку.
  const { start } = voice;
  useEffect(() => {
    if (attempt.state !== "answered" || channel !== "call" || voiceStarted.current) return;
    voiceStarted.current = true;
    void start();
  }, [attempt.state, channel, start]);

  const isJournalShown = view === "journal" || view === "incoming";
  const journal = useJournal(
    api,
    assignment.id,
    `${attempt.id}:${attempt.state}:${isJournalShown}:${op.hiddenCount}`,
  );

  const accept = () => {
    if (channel === "call" && !voiceStarted.current) {
      voiceStarted.current = true;
      void start();
    }
    void op.accept();
  };

  const openRow = (row: Journal112Row) => {
    if (row.lockedBy) setLocked(row);
    else if (row.queued) op.showIncoming();
    else if (attempt.state === "answered" && row.cardId === attempt.cardId) op.backToCard();
  };

  // Журнал по памятке АРМ-112 §3.17: Insert — новая карточка, Enter — «Принять» в окне вызова, Esc — скрыть окно.
  useHotkeys(
    {
      Insert: () => {
        if (view === "journal") op.openPractice();
      },
      Enter: () => {
        if (view === "incoming" && !op.isAnswering) accept();
      },
      Escape: () => {
        if (view === "incoming") op.hideCall();
      },
    },
    isJournalShown,
  );

  const operatorName = user ? formatShortName(user.fullName) : "";
  const operatorLine = user ? `Опер. ${operatorName}, АРМ ${user.armNumber}` : "Опер.";
  const isCardFamily = view === "card" || view === "links" || view === "smsHistory";
  const cardView = view === "links" || view === "smsHistory" ? view : "card";
  const cardVoice = channel === "call" && attempt.state === "answered" ? voice : null;
  const common = {
    assignment,
    entries,
    api,
    clock,
    nowMs,
    operatorLine,
    journalRows: journal.rows,
    isSubmitting: op.isSubmitting,
    errors: op.errors,
    onOpenLinks: op.openLinks,
    onOpenSmsHistory: op.openSmsHistory,
    onBackToCard: op.backToCard,
    onNotice: setNotice,
    onJournalChanged: journal.reload,
    onProblem: openProblem,
  };

  return (
    <>
      {isGuideOpen ? <ShortGuideWindow onClose={() => setGuideOpen(false)} /> : null}
      {isProblemOpen ? (
        <ProblemReportDialog
          senderName={user?.fullName ?? ""}
          incidentNumber={attempt.incidentNumber}
          attemptId={attempt.id}
          onClose={() => setProblemOpen(false)}
        />
      ) : null}
      <SimulatorBarPortal>
        <TrainerStrip
          assignment={assignment}
          attempt={attempt}
          norms={norms}
          limitSec={limitSec}
          nowMs={nowMs}
          hintText={hints.hintText}
          answerError={op.answerError}
          notice={notice}
          voice={cardVoice}
        />
      </SimulatorBarPortal>

      {isJournalShown ? (
        <div className={styles.journal}>
          <Operator112Journal
            state={journal.status}
            errorMessage={journal.error}
            rows={journal.rows}
            operatorName={operatorName}
            nowMs={nowMs}
            onOpenRow={openRow}
            onCreateCard={op.openPractice}
            onShortGuide={() => setGuideOpen(true)}
            onProblem={openProblem}
            onLogout={() => void logout().then(() => router.replace(ROUTES.login))}
          />
          {journal.status === "ready" && journal.rows.length === 0 ? (
            <p className={styles.journal__empty} role="status">
              В журнале пока нет карточек
            </p>
          ) : null}
          {locked?.lockedBy ? (
            <div className={styles.journal__locked} onClick={() => setLocked(null)}>
              <LockedWindow {...locked.lockedBy} />
            </div>
          ) : null}
        </div>
      ) : null}

      {view === "incoming" ? (
        <IncomingWindow
          channel={channel}
          aon={attempt.aon}
          isAnswering={op.isAnswering}
          onAccept={accept}
          onHide={op.hideCall}
        />
      ) : null}

      {attempt.state === "answered" ? (
        <Operator112CardView
          key={attempt.id}
          {...common}
          attempt={attempt}
          active={isCardFamily}
          view={cardView}
          channel={channel}
          smsText={attemptSmsText(attempt)}
          voice={cardVoice}
          onSubmit={(draft, examZero) => void op.submit(draft, examZero)}
          onClose={op.closePractice}
          onProgress={hints.report}
        />
      ) : null}

      {view === "practiceCard" ? (
        <Operator112CardView
          key="practice"
          {...common}
          attempt={null}
          active
          view="card"
          channel="call"
          smsText=""
          voice={null}
          onSubmit={() => undefined}
          onClose={op.closePractice}
          onProgress={() => undefined}
        />
      ) : null}
    </>
  );
}
