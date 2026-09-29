"use client";

import Link from "next/link";
import { useState } from "react";

import { LINK_STATE_TITLES, MODE_TITLES, formatLimit } from "@/entities/assignment";
import type { AssignmentDetail, AssignmentProgress, PublicUser } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import {
  Alert,
  Card,
  DataTable,
  LinkButton,
  PageHeader,
  PlatformButton,
  ResourceView,
  Tag,
  useResource,
} from "@/shared/ui/platform";
import type { DataColumn } from "@/shared/ui/platform";

import { teacherAssignmentsApi } from "../api/teacherAssignmentsApi";
import type { TeacherAssignmentsApi } from "../api/teacherAssignmentsApi";
import { formatDate } from "../lib/format";

import styles from "./TeacherAssignments.module.css";

type Loaded = { detail: AssignmentDetail; students: PublicUser[] };

const APPROVAL_TITLES: Record<string, string> = {
  pending_review: "ожидает подтверждения",
  approved: "подтверждён",
  rejected: "отклонён",
  draft: "черновик",
  validation_failed: "не прошёл проверку",
};

function progressColumns(nameOf: (studentId: string) => string): DataColumn<AssignmentProgress>[] {
  return [
    { key: "student", title: "Обучающийся", render: (row) => nameOf(row.studentId) },
    { key: "card", title: "Билет", render: (row) => row.cardId },
    { key: "state", title: "Состояние", render: (row) => LINK_STATE_TITLES[row.state] ?? row.state },
    {
      key: "score",
      title: "Балл",
      numeric: true,
      render: (row) => (typeof row.score === "number" ? row.score : "—"),
    },
    {
      key: "passed",
      title: "Итог",
      render: (row) =>
        row.passed === undefined ? (
          "—"
        ) : row.passed ? (
          <Tag tone="success">Сдал</Tag>
        ) : (
          <Tag tone="danger">Не сдал</Tag>
        ),
    },
    {
      key: "chain",
      title: "Вход ДДС",
      render: (row) =>
        row.chainReview ? (
          <span>
            <Link href={ROUTES.teacherScenario(row.chainReview.scenarioId)}>
              {row.chainReview.scenarioId}, версия {row.chainReview.version}
            </Link>{" "}
            <Tag tone={row.chainReview.approval === "approved" ? "success" : "warning"}>
              {APPROVAL_TITLES[row.chainReview.approval] ?? row.chainReview.approval}
            </Tag>
          </span>
        ) : (
          "—"
        ),
    },
  ];
}

type TeacherAssignmentDetailScreenProps = { assignmentId: string; api?: TeacherAssignmentsApi };

/** `/teacher/assignments/[id]` — условия, прогресс по обучающимся, вход ДДС цепочки, завершение задания. */
export function TeacherAssignmentDetailScreen({
  assignmentId,
  api = teacherAssignmentsApi,
}: TeacherAssignmentDetailScreenProps) {
  const { state, reload } = useResource<Loaded>(async () => {
    const [detail, students] = await Promise.all([
      api.detail(assignmentId),
      api.listStudents().catch(() => [] as PublicUser[]),
    ]);
    return { detail, students };
  }, [api, assignmentId]);
  const [confirming, setConfirming] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [isFinishing, setFinishing] = useState(false);

  const finish = async () => {
    setFinishing(true);
    setFinishError(null);
    try {
      await api.finish(assignmentId);
      setConfirming(false);
      reload();
    } catch (error) {
      setFinishError(
        error instanceof Error && error.message ? error.message : "Не удалось завершить задание",
      );
    }
    setFinishing(false);
  };

  return (
    <section aria-labelledby="teacher-assignment-title">
      <ResourceView state={state} onRetry={reload} errorTitle="Не удалось загрузить задание">
        {({ detail, students }) => {
          const nameOf = (id: string) => students.find((item) => item.id === id)?.fullName ?? id;
          const params = detail.params;
          const isActive = detail.state === "active";
          return (
            <>
              <PageHeader
                title={detail.title || `Задание ${detail.id}`}
                description={MODE_TITLES[detail.trainingMode]}
                actions={
                  <>
                    <PlatformButton variant="secondary" onClick={reload}>
                      Обновить
                    </PlatformButton>
                    <LinkButton href={ROUTES.teacherAssignments}>К списку</LinkButton>
                    {isActive && !confirming ? (
                      <PlatformButton variant="primary" onClick={() => setConfirming(true)}>
                        Завершить задание
                      </PlatformButton>
                    ) : null}
                  </>
                }
              />
              {confirming ? (
                <Alert tone="warning" role="alert">
                  <div className={styles.confirm}>
                    <span>
                      Незавершённые попытки будут закрыты как «не выполнено»
                      {detail.format === "exam" ? ", экзамен по ним засчитывается как несданный" : ""}.
                      Действие необратимо.
                    </span>
                    <PlatformButton variant="primary" onClick={() => void finish()} disabled={isFinishing}>
                      Да, завершить
                    </PlatformButton>
                    <PlatformButton
                      variant="ghost"
                      onClick={() => setConfirming(false)}
                      disabled={isFinishing}
                    >
                      Отмена
                    </PlatformButton>
                  </div>
                </Alert>
              ) : null}
              {finishError ? (
                <Alert tone="danger" role="alert">
                  {finishError}
                </Alert>
              ) : null}
              <div className={styles.detail}>
                <Card title="Условия">
                  <dl className={styles.terms}>
                    <div>
                      <dt>Формат</dt>
                      <dd>
                        {detail.format === "exam" ? (
                          <Tag tone="warning">Экзамен</Tag>
                        ) : (
                          <Tag tone="info">Тренировка</Tag>
                        )}{" "}
                        {isActive ? <Tag tone="success">Активно</Tag> : <Tag>Завершено</Tag>}
                      </dd>
                    </div>
                    <div>
                      <dt>Создано</dt>
                      <dd>{formatDate(detail.createdAt)}</dd>
                    </div>
                    {detail.dueAt ? (
                      <div>
                        <dt>Срок</dt>
                        <dd>{formatDate(detail.dueAt)}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>Билеты</dt>
                      <dd>
                        {detail.randomRule && detail.cardIds.length === 0
                          ? `случайный набор: ${detail.randomRule.count}`
                          : detail.cardIds.join(", ")}
                      </dd>
                    </div>
                    {params.norms ? (
                      <div>
                        <dt>Нормативы</dt>
                        <dd>
                          реакция {params.norms.answerSec} с · отработка {params.norms.submitSec} с
                        </dd>
                      </div>
                    ) : null}
                    {typeof params.passThreshold === "number" ? (
                      <div>
                        <dt>Порог сдачи</dt>
                        <dd>{params.passThreshold}</dd>
                      </div>
                    ) : null}
                    {typeof params.timeLimitSec === "number" ? (
                      <div>
                        <dt>Лимит на билет</dt>
                        <dd>{formatLimit(params.timeLimitSec)}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>Сообщения служб</dt>
                      <dd>{params.workMessagesEnabled ? "включены" : "выключены"}</dd>
                    </div>
                  </dl>
                </Card>
                <Card title="Обучающиеся">
                  <ul className={styles.students}>
                    {detail.studentIds.map((id) => (
                      <li key={id}>
                        <Link href={ROUTES.teacherStudent(id)}>{nameOf(id)}</Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
              <Card title="Прогресс">
                <DataTable
                  caption="Прогресс по обучающимся"
                  columns={progressColumns(nameOf)}
                  rows={detail.progress}
                  getRowKey={(row) => row.attemptId}
                  emptyText="Обучающиеся ещё не начали задание."
                />
              </Card>
            </>
          );
        }}
      </ResourceView>
    </section>
  );
}
