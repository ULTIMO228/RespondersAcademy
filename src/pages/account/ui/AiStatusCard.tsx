"use client";

import type { AiHealth, AiServedBy, AiSettings } from "@/shared/api";
import { AI_ERROR_REASON_MESSAGES } from "@/shared/api";
import { Card, EmptyState, PlatformButton, ResourceView, Tag, useResource } from "@/shared/ui/platform";
import type { TagTone } from "@/shared/ui/platform";

import type { AccountAiApi } from "../api/accountAiApi";
import styles from "./AccountAi.module.css";

const SOURCE_TITLES = { local: "Локальная модель", cloud: "Облачная модель" } as const;
const SERVED_TITLES: Record<AiServedBy, string> = {
  cloud: "облако",
  local: "локальная модель",
  template: "шаблон",
};
const STATE_TITLES = { ok: "Работает", degraded: "Запасной путь", down: "Только шаблоны" } as const;
const STATE_TONES: Record<AiHealth["state"], TagTone> = {
  ok: "success",
  degraded: "warning",
  down: "danger",
};
const LOCAL_MODEL = "Qwen3.5-0.8B";

function formatMoment(iso: string | null): string {
  if (!iso) return "ещё не было";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function usage(health: AiHealth): string {
  const calls = health.callsToday ?? 0;
  return health.dailyLimit ? `${calls} из ${health.dailyLimit}` : `${calls} (лимит не задан)`;
}

function StatusFacts({ health, settings }: { health: AiHealth; settings: AiSettings }) {
  if (!health.lastOkAt && !health.lastErrorAt && !health.callsToday) {
    return (
      <EmptyState title="Обращений к модели ещё не было" text="Показатели появятся после первого запроса." />
    );
  }
  const cloud = health.activeSource === "cloud";
  return (
    <dl className={styles.facts}>
      <dt>Состояние</dt>
      <dd>
        <Tag tone={STATE_TONES[health.state]}>{STATE_TITLES[health.state]}</Tag>
        {health.reason ? ` ${AI_ERROR_REASON_MESSAGES[health.reason]}` : ""}
      </dd>
      <dt>Активный источник</dt>
      <dd>{SOURCE_TITLES[health.activeSource]}</dd>
      <dt>Модель</dt>
      <dd>{cloud ? settings.cloud.model : LOCAL_MODEL}</dd>
      <dt>Маршрут</dt>
      <dd>{cloud ? settings.cloud.route : "локально"}</dd>
      <dt>Ответил последним</dt>
      <dd>{SERVED_TITLES[health.servedBy]}</dd>
      <dt>Последний успех</dt>
      <dd>{formatMoment(health.lastOkAt)}</dd>
      <dt>Ошибок за сутки</dt>
      <dd>{health.errorsToday ?? 0}</dd>
      <dt>Запросов за сутки</dt>
      <dd>{usage(health)}</dd>
    </dl>
  );
}

type AiStatusCardProps = {
  api: AccountAiApi;
  settings: AiSettings;
  /** Меняется после сохранения настройки — состояние запрашивается заново. */
  refreshKey: number;
};

/** Блок «Состояние» (спека 006, US5): данные администраторской версии GET /ai/health. */
export function AiStatusCard({ api, settings, refreshKey }: AiStatusCardProps) {
  const { state, reload } = useResource((signal) => api.health(signal), [refreshKey]);
  return (
    <Card
      title="Состояние"
      actions={
        <PlatformButton variant="ghost" onClick={reload}>
          Обновить
        </PlatformButton>
      }
    >
      <ResourceView state={state} onRetry={reload} errorTitle="Не удалось получить состояние">
        {(health) => <StatusFacts health={health} settings={settings} />}
      </ResourceView>
    </Card>
  );
}
