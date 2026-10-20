"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useSessionUser } from "@/entities/user";
import type { AiSettings } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { PageHeader, ResourceView, useResource } from "@/shared/ui/platform";

import { accountAiApi } from "../api/accountAiApi";
import type { AccountAiApi } from "../api/accountAiApi";
import { AccountNav } from "./AccountNav";
import { AiSettingsForm } from "./AiSettingsForm";
import { AiStatusCard } from "./AiStatusCard";
import styles from "./AccountAi.module.css";

function AiSettingsView({ api }: { api: AccountAiApi }) {
  const { state, reload } = useResource((signal) => api.settings(signal));
  const [saved, setSaved] = useState<AiSettings | null>(null);
  const [version, setVersion] = useState(0);
  return (
    <ResourceView state={state} onRetry={reload} errorTitle="Не удалось загрузить настройку ИИ">
      {(loaded) => {
        const current = saved ?? loaded;
        return (
          <div className={styles.layout}>
            <AiSettingsForm
              settings={current}
              api={api}
              onSaved={(next) => {
                setSaved(next);
                setVersion((value) => value + 1);
              }}
            />
            <AiStatusCard api={api} settings={current} refreshKey={version} />
          </div>
        );
      }}
    </ResourceView>
  );
}

/**
 * `/account/ai` — выбор источника ИИ (локальная Qwen3.5-0.8B или облачная через Polza.ai), ключ, проверка
 * подключения и состояние. Только администратор: серверный лэйаут отправляет остальных на /forbidden, здесь —
 * вторая линия на клиенте. Без бэкенда раздел показывает состояние «требуется сервер».
 */
export function AccountAiPage({ api = accountAiApi }: { api?: AccountAiApi }) {
  const router = useRouter();
  const user = useSessionUser();
  const allowed = user?.role === "admin";

  useEffect(() => {
    if (!allowed) router.replace(ROUTES.forbidden);
  }, [allowed, router]);

  if (!allowed) return null;
  return (
    <>
      <PageHeader title="Модель ИИ" description="Источник текстов ИИ и состояние модели" />
      <AccountNav active="ai" />
      <AiSettingsView api={api} />
    </>
  );
}
