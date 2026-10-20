"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSessionUser } from "@/entities/user";
import { AI_ERROR_REASON_MESSAGES } from "@/shared/api";
import type { AiHealth } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { Alert } from "@/shared/ui/platform";

import { aiHealthApi } from "../api/aiHealthApi";
import type { AiHealthApi } from "../api/aiHealthApi";
import styles from "./AiHealthBanner.module.css";

/** Период опроса состояния (спека 006, SC-005: баннер не позже чем через минуту). */
export const AI_HEALTH_POLL_MS = 30_000;

const TEACHER_MESSAGE = "ИИ временно работает в запасном режиме";

type AiHealthBannerProps = {
  api?: AiHealthApi;
  pollMs?: number;
};

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AdminMessage({ health }: { health: AiHealth }) {
  const reason = health.reason ? AI_ERROR_REASON_MESSAGES[health.reason] : "Источник ИИ отвечает с ошибками";
  const fallback = health.state === "down" ? "ответы собираются по шаблонам" : "работает запасной путь";
  const last = formatTime(health.lastErrorAt);
  return (
    <div className={styles.banner__text}>
      <strong>{reason}.</strong> ИИ: {fallback}.
      {health.errorsToday ? ` Ошибок за сутки: ${health.errorsToday}.` : ""}
      {last ? ` Последняя: ${last}.` : ""}{" "}
      <Link href={ROUTES.accountAi} className={styles.banner__link}>
        Настройки ИИ
      </Link>
    </div>
  );
}

/**
 * Баннер состояния ИИ кабинетов (спека 006, FR-010): администратору — причина, счётчик и ссылка на настройки,
 * преподавателю — краткое сообщение, обучающемуся — ничего. Один баннер со счётчиком вместо потока уведомлений;
 * пропадает, когда состояние снова `ok`. Без бэкенда или при сбое запроса скрыт.
 */
export function AiHealthBanner({ api = aiHealthApi, pollMs = AI_HEALTH_POLL_MS }: AiHealthBannerProps) {
  const role = useSessionUser()?.role;
  const [health, setHealth] = useState<AiHealth | null>(null);
  const [keyMissing, setKeyMissing] = useState(false);
  const watched = role === "admin" || role === "teacher";

  useEffect(() => {
    if (!watched) return;
    const controller = new AbortController();
    const load = () => {
      api.health(controller.signal).then(
        (next) => {
          if (!controller.signal.aborted) setHealth(next);
        },
        () => {
          if (!controller.signal.aborted) setHealth(null);
        },
      );
    };
    load();
    if (role === "admin" && api.settings) {
      api.settings(controller.signal).then(
        (settings) => {
          if (!controller.signal.aborted) setKeyMissing(!settings.cloud.keyConfigured);
        },
        () => {
          if (!controller.signal.aborted) setKeyMissing(false);
        },
      );
    }
    const timer = setInterval(load, pollMs);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [watched, role, api, pollMs]);

  if (role === "admin" && keyMissing) {
    return (
      <div className={styles.banner}>
        <Alert tone="warning">
          <div className={styles.banner__text}>
            <strong>ИИ не подключён: вставьте ключ Polza.</strong>{" "}
            <Link href={ROUTES.accountAi} className={styles.banner__link}>
              Настройки ИИ
            </Link>
          </div>
        </Alert>
      </div>
    );
  }
  if (!watched || !health || health.state === "ok") return null;
  return (
    <div className={styles.banner}>
      <Alert tone="warning">
        {role === "admin" ? <AdminMessage health={health} /> : <span>{TEACHER_MESSAGE}</span>}
      </Alert>
    </div>
  );
}
