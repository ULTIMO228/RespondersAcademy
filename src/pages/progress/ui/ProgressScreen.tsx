"use client";

import { Button, Panel } from "@/shared/ui";

import type { ProgressApi } from "../api/progressApi";
import type { StudentProgress } from "../lib/selectStudentProgress";
import { useStudentProgress } from "../model/useStudentProgress";
import type { ProgressState } from "../model/useStudentProgress";
import { AttemptHistory } from "./attempts-table/AttemptHistory";
import type { CertificateGenerator, FileSaver } from "../lib/certificate-pdf";
import { CertificateButton } from "./certificate/CertificateButton";
import { ProgressCharts } from "./charts/ProgressCharts";
import { MyMistakes } from "./my-mistakes/MyMistakes";
import { AiRecommendations } from "./recommendations/AiRecommendations";
import { ProgressSummary } from "./summary/ProgressSummary";

import styles from "./ProgressPage.module.css";

type ProgressScreenProps = {
  /** ФИО курсанта сессии (серверный профиль) — для сертификата. */
  fullName: string;
  /** Подмены для тестов. */
  api?: ProgressApi;
  certificate?: { generator?: CertificateGenerator; saver?: FileSaver };
};

type ProgressContentProps = Pick<ProgressScreenProps, "fullName" | "certificate"> & {
  progress: StudentProgress;
};

function ProgressContent({ progress, fullName, certificate }: ProgressContentProps) {
  return (
    <>
      <ProgressSummary summary={progress.summary} />
      <AttemptHistory attempts={progress.attempts} pendingCount={progress.pendingCount} />
      <div className={styles.progress__columns}>
        <MyMistakes groups={progress.mistakeGroups} />
        <AiRecommendations recommendations={progress.recommendations}>
          <CertificateButton
            fullName={fullName}
            integralScore={progress.summary.integralScore}
            cardCount={progress.summary.cardCount}
            generator={certificate?.generator}
            saver={certificate?.saver}
          />
        </AiRecommendations>
      </div>
      <ProgressCharts scoreDynamics={progress.scoreDynamics} errorDistribution={progress.errorDistribution} />
    </>
  );
}

function ProgressStatus({
  state,
  onRetry,
}: {
  state: Exclude<ProgressState, { status: "ready" }>;
  onRetry: () => void;
}) {
  if (state.status === "loading") {
    return (
      <Panel title="Мой прогресс" headerTone="dark">
        <p className={styles.progress__muted} role="status">
          Загрузка результатов…
        </p>
      </Panel>
    );
  }
  if (state.status === "noSession") {
    return (
      <Panel title="Мой прогресс" headerTone="dark">
        <p className={styles.progress__muted}>Войдите в систему, чтобы увидеть свои результаты</p>
      </Panel>
    );
  }
  return (
    <Panel title="Мой прогресс" headerTone="dark">
      <div className={styles.progress__state} role="alert">
        <p>{state.isOffline ? "Нет соединения с сервером — результаты недоступны" : state.message}</p>
        <Button size="sm" onClick={onRetry}>
          Повторить
        </Button>
      </div>
    </Panel>
  );
}

/** Клиентский экран «Мой прогресс»: данные курсанта сессии из мок-API (T2.5-01…06). */
export function ProgressScreen({ fullName, api, certificate }: ProgressScreenProps) {
  const { state, retry } = useStudentProgress(api);
  return (
    <div className={styles.progress}>
      <h1 className="visually-hidden">Мой прогресс</h1>
      {state.status === "ready" ? (
        <ProgressContent progress={state.progress} fullName={fullName} certificate={certificate} />
      ) : (
        <ProgressStatus state={state} onRetry={retry} />
      )}
    </div>
  );
}
