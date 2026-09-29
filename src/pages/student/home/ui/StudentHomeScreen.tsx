"use client";

import Link from "next/link";

import {
  daysUntilDue,
  formatLimit,
  MODE_TITLES,
  pickNextAssignment,
  pickOpenAttempt,
} from "@/entities/assignment";
import type { AssignmentView } from "@/entities/assignment";
import {
  formatSecondsShort,
  PROCESSING_NORM_LABEL,
  PROCESSING_NORM_MS,
  REACTION_NORM_LABEL,
  REACTION_NORM_MS,
  summarizePerformance,
  toneAgainstNorm,
} from "@/entities/report";
import { useSessionUser } from "@/entities/user";
import type { HistoryItem } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { formatDate, formatDuration } from "@/shared/lib";
import {
  Alert,
  Card,
  DataTable,
  EmptyState,
  LinkButton,
  PageHeader,
  ResourceView,
  StatGroup,
  StatTile,
  Tag,
  useResource,
} from "@/shared/ui/platform";
import type { DataColumn } from "@/shared/ui/platform";
import { RecommendationList } from "@/widgets/recommendation-list";

import { studentHomeApi } from "../api/homeApi";
import type { StudentHomeApi } from "../api/homeApi";
import styles from "./StudentHomeScreen.module.css";

const RECOMMENDATION_LIMIT = 3;
const HISTORY_LIMIT = 3;

type StudentHomeScreenProps = {
  api?: StudentHomeApi;
  /** Текущее время (мс) — для подписи срока; в тестах фиксируется. */
  nowMs?: number;
};

function firstNames(fullName: string): string {
  const [, ...rest] = fullName.trim().split(/\s+/);
  return rest.join(" ") || fullName;
}

function dueLabel(days: number | null): { tone: "danger" | "warning" | "neutral"; text: string } | null {
  if (days === null) return null;
  if (days < 0) return { tone: "danger", text: "Срок истёк" };
  if (days === 0) return { tone: "danger", text: "Срок сегодня" };
  return { tone: days <= 2 ? "warning" : "neutral", text: `Осталось дней: ${days}` };
}

/** Кнопка запуска: режим 112 открывается сразу, остальные режимы запускаются со страницы заданий (там же 409-сообщения). */
function startHref(view: AssignmentView): string {
  return view.assignment.trainingMode === "operator112"
    ? ROUTES.armOperator112ForAssignment(view.assignment.id)
    : ROUTES.studentAssignments;
}

function LeadAssignment({ view, nowMs }: { view: AssignmentView; nowMs: number }) {
  const { assignment } = view;
  const isExam = assignment.format === "exam";
  const due = dueLabel(daysUntilDue(assignment, nowMs));
  const params = assignment.params;
  return (
    <>
      <div className={styles.caps}>Ближайшее задание</div>
      <h3 className={styles.lead__title}>{assignment.title || `Задание ${assignment.id}`}</h3>
      <div className={styles.lead__meta}>
        <Tag tone="info">{MODE_TITLES[assignment.trainingMode]}</Tag>
        <Tag tone={isExam ? "warning" : "success"}>{isExam ? "Экзамен" : "Тренировка"}</Tag>
        {due ? <Tag tone={due.tone}>{due.text}</Tag> : null}
      </div>
      {isExam ? (
        <p className={styles.lead__text}>
          Билет выдаётся один раз, повторное прослушивание записи недоступно. Оценку ставит ИИ-модуль,
          окончательное решение остаётся за преподавателем.
        </p>
      ) : null}
      <dl className={styles.facts}>
        <div>
          <dt>Билеты</dt>
          <dd>{view.total !== null ? `${view.closed} из ${view.total}` : "—"}</dd>
        </div>
        {isExam && typeof params.passThreshold === "number" ? (
          <div>
            <dt>Порог сдачи</dt>
            <dd>{params.passThreshold} баллов</dd>
          </div>
        ) : null}
        {typeof params.timeLimitSec === "number" ? (
          <div>
            <dt>Лимит на билет</dt>
            <dd>{formatLimit(params.timeLimitSec)}</dd>
          </div>
        ) : null}
      </dl>
      <div className={styles.lead__actions}>
        <LinkButton href={startHref(view)} variant="primary">
          {view.hasOpenAttempt
            ? "Продолжить задание"
            : view.closed > 0
              ? "Следующий билет"
              : "Начать задание"}
        </LinkButton>
        <Link href={ROUTES.studentAssignments}>Все задания</Link>
      </div>
    </>
  );
}

const HISTORY_COLUMNS: DataColumn<HistoryItem>[] = [
  { key: "date", title: "Дата", render: (item) => formatDate(item.at) },
  { key: "title", title: "Задание", render: (item) => item.title },
  { key: "mode", title: "Режим", render: (item) => (item.mode === "operator112" ? "112" : "ДДС") },
  { key: "score", title: "Балл", numeric: true, render: (item) => item.score },
  {
    key: "result",
    title: "Итог",
    render: (item) =>
      item.format === "exam" && typeof item.passed === "boolean" ? (
        <Tag tone={item.passed ? "success" : "danger"}>{item.passed ? "Сдан" : "Не сдан"}</Tag>
      ) : (
        <Tag>Тренировка</Tag>
      ),
  },
  {
    key: "review",
    title: <span className="visually-hidden">Разбор</span>,
    render: (item) => <Link href={ROUTES.studentResult(item.attemptId, item.mode)}>Разбор</Link>,
  },
];

/**
 * Главная обучающегося (T042): «Продолжить», «Ближайшее задание», показатели против нормативов АРМ, рекомендации и последние
 * результаты. Каждый блок грузится независимо: ошибка одного не роняет страницу, без бэкенда блоки показывают «нужен сервер».
 */
export function StudentHomeScreen({ api = studentHomeApi, nowMs = Date.now() }: StudentHomeScreenProps) {
  const user = useSessionUser();
  const assignments = useResource((signal) => api.assignments(signal), [api]);
  const analytics = useResource((signal) => api.analytics(signal), [api]);
  const recommendations = useResource((signal) => api.recommendations(RECOMMENDATION_LIMIT, signal), [api]);
  const history = useResource((signal) => api.history(HISTORY_LIMIT, signal), [api]);

  return (
    <div className={styles.stack}>
      <PageHeader
        title={user ? `Здравствуйте, ${firstNames(user.fullName)}` : "Здравствуйте"}
        description="Задания, показатели и результаты"
      />

      <Card title="Мои показатели" actions={<Link href={ROUTES.studentAnalytics}>Вся аналитика</Link>}>
        <ResourceView
          state={analytics.state}
          onRetry={analytics.reload}
          errorTitle="Не удалось загрузить показатели"
          skeletonLines={2}
        >
          {(data) => {
            const summary = summarizePerformance(data);
            if (summary.attempts === 0) {
              return (
                <EmptyState
                  title="Показателей пока нет"
                  text="Они появятся после первой выполненной попытки."
                />
              );
            }
            return (
              <StatGroup>
                <StatTile
                  label="Средний балл"
                  value={summary.averageScore ?? "—"}
                  note={`за ${summary.attempts} ${summary.attempts === 1 ? "попытку" : "попыток"}`}
                />
                <StatTile
                  label="Реакция"
                  value={summary.reactionMs === null ? "—" : formatSecondsShort(summary.reactionMs)}
                  note={
                    toneAgainstNorm(summary.reactionMs, REACTION_NORM_MS) === "bad"
                      ? `выше: ${REACTION_NORM_LABEL}`
                      : REACTION_NORM_LABEL
                  }
                  tone={toneAgainstNorm(summary.reactionMs, REACTION_NORM_MS)}
                />
                <StatTile
                  label="Отработка"
                  value={summary.processingMs === null ? "—" : formatDuration(summary.processingMs)}
                  note={
                    toneAgainstNorm(summary.processingMs, PROCESSING_NORM_MS) === "bad"
                      ? `выше: ${PROCESSING_NORM_LABEL}`
                      : PROCESSING_NORM_LABEL
                  }
                  tone={toneAgainstNorm(summary.processingMs, PROCESSING_NORM_MS)}
                />
                <StatTile
                  label="Попытки"
                  value={summary.attempts}
                  note={`112: ${data.byMode.operator112.count} · ДДС: ${data.byMode.dds.count}`}
                />
              </StatGroup>
            );
          }}
        </ResourceView>
      </Card>

      <div className={styles.columns}>
        <Card accent aria-label="Ближайшее задание">
          <ResourceView
            state={assignments.state}
            onRetry={assignments.reload}
            errorTitle="Не удалось загрузить задания"
          >
            {(views) => {
              const next = pickNextAssignment(views);
              const open = pickOpenAttempt(views);
              if (!next) {
                return (
                  <EmptyState
                    title="Активных заданий нет"
                    text="Задание назначает преподаватель. Когда оно появится, здесь будет кнопка «Начать»."
                    action={<LinkButton href={ROUTES.studentAssignments}>К заданиям</LinkButton>}
                  />
                );
              }
              return (
                <>
                  {open && open.assignment.id !== next.assignment.id ? (
                    <div className={styles.resume}>
                      <Alert tone="info">
                        У вас открыта попытка: {open.assignment.title || open.assignment.id}.{" "}
                        <Link href={startHref(open)}>Продолжить</Link>
                      </Alert>
                    </div>
                  ) : null}
                  <LeadAssignment view={next} nowMs={nowMs} />
                </>
              );
            }}
          </ResourceView>
        </Card>

        <Card title="Что подтянуть" actions={<Tag tone="ai">ИИ</Tag>}>
          <ResourceView
            state={recommendations.state}
            onRetry={recommendations.reload}
            errorTitle="Не удалось загрузить рекомендации"
            skeletonLines={3}
          >
            {(items) =>
              items.length === 0 ? (
                <EmptyState
                  title="Рекомендаций пока нет"
                  text="Они появятся, когда накопится история попыток."
                />
              ) : (
                <RecommendationList items={items} />
              )
            }
          </ResourceView>
        </Card>
      </div>

      <Card title="Последние результаты" actions={<Link href={ROUTES.studentResults}>Все результаты</Link>}>
        <ResourceView
          state={history.state}
          onRetry={history.reload}
          errorTitle="Не удалось загрузить результаты"
          skeletonLines={3}
        >
          {(page) =>
            page.items.length === 0 ? (
              <EmptyState
                title="Пока нет результатов"
                text="Пройдите первое задание — здесь появятся баллы и разбор."
                action={
                  <LinkButton href={ROUTES.studentAssignments} variant="primary">
                    К заданиям
                  </LinkButton>
                }
              />
            ) : (
              <DataTable
                caption="Последние результаты"
                columns={HISTORY_COLUMNS}
                rows={page.items}
                getRowKey={(item) => item.attemptId}
              />
            )
          }
        </ResourceView>
      </Card>
    </div>
  );
}
