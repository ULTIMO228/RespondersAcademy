"use client";

import Link from "next/link";

import { RecordingsButton } from "@/widgets/incident-card";
import { compareWithEtalon, StudentActions } from "@/widgets/monitor-grid";
import { getCardEtalonSegment, STUDENT_STATE_TITLES } from "@/entities/session";
import { formatShortName } from "@/entities/user";
import type { Specialization } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { formatDuration } from "@/shared/lib";
import { ConnectionBanner } from "@/shared/ui";

import { buildActionDictionary } from "../lib/buildActionDictionary";
import { useEtalon } from "../model/useEtalon";
import { useStudentMonitor } from "../model/useStudentMonitor";
import { AccessDenied } from "./AccessDenied";
import { AIAssessmentPanel } from "./AIAssessmentPanel";
import { CallTranscript } from "./CallTranscript";
import { StudentMirror } from "./StudentMirror";

import styles from "./TeacherMonitorPage.module.css";

type MonitorScreenProps = {
  teacherId: string;
  studentId: string;
};

const BACK_LABEL = "Вернуться к классу";

/**
 * Какое рабочее место зеркалить (FR-015): обучающийся только со специализацией 112 — рабочее место 112;
 * с обеими — ДДС, если у него открыта карточка ДДС, иначе 112; без поля специализаций — ДДС (миграция бэкенда).
 */
function resolveMirrorMode(
  specializations: Specialization[] | undefined,
  hasDdsCard: boolean,
): "dds" | "operator112" {
  const own = specializations ?? ["dds"];
  if (!own.includes("operator112")) return "dds";
  if (!own.includes("dds")) return "operator112";
  return hasDdsCard ? "dds" : "operator112";
}

/** `/teacher/monitor/[studentId]` — живое зеркало экрана курсанта, только просмотр (spec/000-фронт/04-pages/10). */
export function MonitorScreen({ teacherId, studentId }: MonitorScreenProps) {
  const view = useStudentMonitor(teacherId, studentId);
  const etalon = useEtalon(view.current?.cardId ?? null, view.session?.scenarioIds ?? []);
  const backLink = (
    <Link href={ROUTES.teacher} className={styles.monitor__back}>
      {BACK_LABEL}
    </Link>
  );
  if (view.access !== "granted") return <AccessDenied access={view.access} backLink={backLink} />;

  const { current, mirror, reference, attempt } = view;
  const cardNumber = mirror ? String(mirror.card.number) : "—";
  const rows = compareWithEtalon({
    actions: view.actions,
    expected: getCardEtalonSegment(etalon.expectedActions, current?.cardId ?? ""),
    isCardFinished: current?.state === "finished",
    dictionary: buildActionDictionary(reference, current?.cardId ?? "", cardNumber),
  });
  const mirrorMode = resolveMirrorMode(view.student?.specializations, Boolean(mirror));
  return (
    <>
      <ConnectionBanner isOnline={view.isOnline} />
      <div className={styles.monitor__bar}>
        {backLink}
        <h1 className={styles.monitor__title}>
          Экран курсанта: {view.student ? formatShortName(view.student.fullName) : studentId}, АРМ{" "}
          {view.student?.armNumber ?? "—"}
        </h1>
        <span className={styles.monitor__readonly}>только просмотр</span>
        <p className={styles.monitor__note}>
          Происшествие {cardNumber} · {STUDENT_STATE_TITLES[current?.state ?? "waiting"]} · вмешательство в
          работу курсанта недоступно, оценка и комментарии — после занятия в отчёте.
        </p>
      </div>
      <div className={styles.monitor__layout}>
        {mirrorMode === "operator112" ? (
          /* Канала чтения попыток 112 для преподавателя нет: зеркало честно сообщает об отсутствии данных. */
          <StudentMirror mode="operator112" attempt={null} />
        ) : mirror ? (
          <StudentMirror
            card={mirror.card}
            classifierEntries={mirror.classifierEntries}
            services={reference.services}
            serviceStatuses={reference.serviceStatuses}
            ddsStatuses={reference.ddsStatuses}
            isExceeded={Boolean(current?.isProcessingExceeded)}
            timerValue={formatDuration(current?.processingMs ?? 0)}
            reactionValue={formatDuration(current?.reactionMs ?? 0)}
            currentDdsStatus={current?.ddsStatus ?? null}
          />
        ) : (
          <p className={styles.monitor__empty}>Курсант ещё не открыл выданную карточку — зеркало пустое.</p>
        )}
        <div className={styles.monitor__side}>
          {mirror ? <RecordingsButton card={mirror.card} /> : null}
          <AIAssessmentPanel
            attemptId={attempt?.id ?? current?.attempt?.attemptId ?? null}
            cardCompleted={current?.state === "finished" || Boolean(attempt?.completedAt)}
            initialEvaluation={attempt?.evaluation}
            onEvaluationResolved={view.reload}
          />
          <StudentActions rows={rows} caption={`Эталон: ${etalon.scenarioTitle} (карточка ${cardNumber})`} />
          <CallTranscript calls={attempt?.calls ?? []} internalNumbers={reference.internalNumbers} />
        </div>
      </div>
    </>
  );
}
