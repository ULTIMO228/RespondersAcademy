"use client";

import Link from "next/link";

import type { LobbyMode } from "@/shared/api";
import { ApiError } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { formatDate } from "@/shared/lib";
import { AiTag, Card, EmptyState, PageHeader, ResourceView, Tag, useResource } from "@/shared/ui/platform";
import { AttemptReview } from "@/widgets/attempt-review";
import type { ReviewModel } from "@/widgets/attempt-review";

import { studentResultsApi } from "../api/resultsApi";
import type { StudentResultsApi } from "../api/resultsApi";
import styles from "./StudentResults.module.css";

const MODE_TITLES: Record<LobbyMode, string> = { operator112: "Режим «Специалист-112»", dds: "Режим ДДС" };
const HTTP_NOT_FOUND = 404;

type StudentResultDetailScreenProps = {
  attemptId: string;
  mode: LobbyMode;
  api?: StudentResultsApi;
};

type Loaded = { review: ReviewModel | null; title: string; at: string | null; format: string | null };

/** Разбор попытки (T043): оценка по составляющим, сличение с эталоном, ошибки, комментарий ИИ, решение преподавателя. */
export function StudentResultDetailScreen({
  attemptId,
  mode,
  api = studentResultsApi,
}: StudentResultDetailScreenProps) {
  const detail = useResource<Loaded>(
    async (signal) => {
      const [item, review] = await Promise.all([
        api.findAttempt(attemptId, signal).catch(() => null),
        api.review(mode, attemptId, signal).catch((error: unknown) => {
          // Оценки ещё нет (попытка не передана / ждёт оценщика) — не ошибка страницы.
          if (error instanceof ApiError && error.status === HTTP_NOT_FOUND && error.code !== "serverRequired")
            return null;
          throw error;
        }),
      ]);
      return {
        review,
        title: item?.title ?? `Попытка ${attemptId}`,
        at: item?.at ?? null,
        format: item?.format ?? null,
      };
    },
    [api, attemptId, mode],
  );

  return (
    <>
      <Link className={styles.back} href={ROUTES.studentResults}>
        ← Ко всем результатам
      </Link>
      <ResourceView
        state={detail.state}
        onRetry={detail.reload}
        errorTitle="Не удалось загрузить разбор"
        skeletonLines={6}
      >
        {(loaded) => (
          <>
            <PageHeader
              title={`Разбор: ${loaded.title}`}
              description={[loaded.at ? formatDate(loaded.at) : null, MODE_TITLES[mode]]
                .filter(Boolean)
                .join(" · ")}
              actions={
                loaded.review ? (
                  <div className={styles.meta}>
                    <AiTag title="Оценку выставил ИИ-модуль" />
                    {typeof loaded.review.passed === "boolean" ? (
                      <Tag tone={loaded.review.passed ? "success" : "danger"}>
                        {loaded.review.passed ? "Сдан" : "Не сдан"}
                      </Tag>
                    ) : null}
                    <Tag tone="info">{loaded.review.totalScore} баллов</Tag>
                  </div>
                ) : undefined
              }
            />
            {loaded.review ? (
              <AttemptReview model={loaded.review} />
            ) : (
              <Card>
                <EmptyState
                  title="Оценки пока нет"
                  text="Попытка ещё не передана или ждёт оценки. Загляните позже."
                />
              </Card>
            )}
          </>
        )}
      </ResourceView>
    </>
  );
}
