"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/shared/api";
import type { SystemServiceAction, SystemSettingsPatch } from "@/shared/api";
import { validateSettingsPatch } from "@/shared/api";
import type { SettingsFieldError } from "@/shared/api";

import type { SystemApi } from "../api/systemApi";
import { defaultSystemApi } from "../api/systemApi";
import { hasRunningSession } from "../lib/session-guard";
import type { LoadState, SystemOverview } from "./types";

const NETWORK_STATUS = 0;
const FALLBACK_ERROR = "Не удалось загрузить состояние системы. Повторите попытку";
const MS_IN_SEC = 1000;

function toErrorState(error: unknown): LoadState<SystemOverview> {
  if (error instanceof ApiError) {
    return { status: "error", message: error.message, isOffline: error.status === NETWORK_STATUS };
  }
  return { status: "error", message: FALLBACK_ERROR, isOffline: false };
}

/** Ошибка сохранения настроек: поля от общего валидатора + текст сервера (422). */
export type SaveResult = { ok: boolean; fields: SettingsFieldError[]; message?: string };

export type AdminSystemModel = {
  state: LoadState<SystemOverview>;
  /** Идёт мок-действие над сервисом (id) — плитка показывает выполнение. */
  pendingServiceId: string | null;
  reload: () => void;
  runServiceAction: (serviceId: string, action: SystemServiceAction) => Promise<void>;
  saveSettings: (patch: SystemSettingsPatch) => Promise<SaveResult>;
};

/**
 * Состояние раздела «Система» (T4.2-07…T4.2-11, T4.2-24): сервисы, целостность, журналы, настройки
 * и признак идущего занятия. Лента и плитки обновляются по интервалу опроса из настроек
 * `performance.refreshIntervalSec` — тому же, что управляет лентой карточек.
 */
export function useAdminSystem(adminId: string, api: SystemApi = defaultSystemApi): AdminSystemModel {
  const [state, setState] = useState<LoadState<SystemOverview>>({ status: "loading" });
  const [pendingServiceId, setPendingServiceId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const refreshMs = state.status === "ready" ? state.settings.performance.refreshIntervalSec * MS_IN_SEC : 0;
  const isMounted = useRef(true);

  const load = useCallback(
    async (signal: AbortSignal) => {
      const [{ services, integrity }, settings, logs, sessions] = await Promise.all([
        api.getServices(signal),
        api.getSettings(signal),
        api.getLogs(undefined, signal),
        api.listSessions({ state: "running" }, signal),
      ]);
      return { services, integrity, settings, logs, sessionRunning: hasRunningSession(sessions) };
    },
    [api],
  );

  useEffect(() => {
    isMounted.current = true;
    const controller = new AbortController();
    load(controller.signal).then(
      (overview) => {
        if (!controller.signal.aborted) setState({ status: "ready", ...overview });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState(toErrorState(error));
      },
    );
    return () => {
      isMounted.current = false;
      controller.abort();
    };
  }, [load, reloadToken]);

  /* Автообновление плиток и ленты: интервал администратор задаёт в настройках (T4.2-08, T4.2-23). */
  useEffect(() => {
    if (refreshMs <= 0) return undefined;
    const timerId = window.setInterval(() => setReloadToken((token) => token + 1), refreshMs);
    return () => window.clearInterval(timerId);
  }, [refreshMs]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const runServiceAction = useCallback(
    async (serviceId: string, action: SystemServiceAction) => {
      setPendingServiceId(serviceId);
      try {
        await api.serviceAction(serviceId, action, adminId);
      } finally {
        if (isMounted.current) setPendingServiceId(null);
      }
      reload();
    },
    [adminId, api, reload],
  );

  const saveSettings = useCallback(
    async (patch: SystemSettingsPatch): Promise<SaveResult> => {
      const fields = validateSettingsPatch(patch);
      if (fields.length > 0) return { ok: false, fields, message: fields[0].message };
      try {
        await api.patchSettings({ ...patch, adminId });
        reload();
        return { ok: true, fields: [] };
      } catch (error) {
        const message = error instanceof ApiError ? error.message : FALLBACK_ERROR;
        return { ok: false, fields: [], message };
      }
    },
    [adminId, api, reload],
  );

  return { state, pendingServiceId, reload, runServiceAction, saveSettings };
}
