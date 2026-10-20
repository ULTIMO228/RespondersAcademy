"use client";

import { useState } from "react";

import { AI_ERROR_REASON_MESSAGES } from "@/shared/api";
import type { AiConnectionTestResult, AiSettings, AiSourceKind } from "@/shared/api";
import { Alert, Card, Field, PlatformButton } from "@/shared/ui/platform";

import type { AccountAiApi } from "../api/accountAiApi";
import styles from "./AccountAi.module.css";

type Notice = { tone: "success" | "danger"; text: string };

type AiSettingsFormProps = {
  settings: AiSettings;
  api: AccountAiApi;
  /** Настройка сохранена: родитель обновляет состояние и блок «Состояние». */
  onSaved: (next: AiSettings) => void;
};

const LOCAL_MODEL = "Qwen3.5-0.8B";
const KEY_REQUIRED = "Введите ключ Polza.ai";

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Не удалось выполнить запрос";
}

function TestOutcome({ result }: { result: AiConnectionTestResult }) {
  if (result.ok) {
    return (
      <Alert tone="success">
        Подключение работает: маршрут {result.route ?? "—"}, {result.latencyMs} мс
      </Alert>
    );
  }
  const reason = result.reason ? AI_ERROR_REASON_MESSAGES[result.reason] : "Проверка не удалась";
  return (
    <Alert tone="warning" role="alert">
      {reason}. Сохранить настройку всё равно можно, но пока проблема не устранена, запросы пойдут через
      запасной путь (локальная модель или шаблон).
    </Alert>
  );
}

/**
 * Выбор источника ИИ и ключа Polza.ai. Ключ — только в поле ввода (type=password): после сохранения, удаления и
 * смены источника он очищается и нигде не логируется; сервер отдаёт лишь «ключ задан …abcd».
 */
export function AiSettingsForm({ settings, api, onSaved }: AiSettingsFormProps) {
  const [source, setSource] = useState<AiSourceKind>(settings.source);
  const [apiKey, setApiKey] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [testResult, setTestResult] = useState<AiConnectionTestResult | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | "clear" | null>(null);
  const { cloud } = settings;
  const isCloud = source === "cloud";

  const chooseSource = (next: AiSourceKind) => {
    setSource(next);
    setKeyError(null);
    setNotice(null);
    setTestResult(null);
  };

  const save = async () => {
    const typed = apiKey.trim();
    if (isCloud && !cloud.keyConfigured && !typed) {
      setKeyError(KEY_REQUIRED);
      return;
    }
    setKeyError(null);
    setNotice(null);
    setBusy("save");
    try {
      const next = await api.save(typed && isCloud ? { source, apiKey: typed } : { source });
      setApiKey("");
      setTestResult(null);
      setNotice({ tone: "success", text: "Настройка сохранена" });
      onSaved(next);
    } catch (error) {
      setNotice({ tone: "danger", text: errorText(error) });
    } finally {
      setBusy(null);
    }
  };

  const clearKey = async () => {
    setNotice(null);
    setBusy("clear");
    try {
      const next = await api.save({ source, clearKey: true });
      setApiKey("");
      setTestResult(null);
      setSource(next.source);
      setNotice({ tone: "success", text: "Ключ удалён" });
      onSaved(next);
    } catch (error) {
      setNotice({ tone: "danger", text: errorText(error) });
    } finally {
      setBusy(null);
    }
  };

  const runTest = async () => {
    const typed = apiKey.trim();
    setNotice(null);
    setTestResult(null);
    setBusy("test");
    try {
      setTestResult(await api.test(typed && isCloud ? { source, apiKey: typed } : { source }));
    } catch (error) {
      setNotice({ tone: "danger", text: errorText(error) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card title="Источник ИИ">
      {settings.fromEnv ? (
        <Alert tone="info">
          Источник задан окружением сервера; после сохранения действует выбранное здесь значение.
        </Alert>
      ) : null}
      <fieldset className={styles.sources}>
        <legend className="visually-hidden">Источник ИИ</legend>
        <label className={styles.source}>
          <input
            type="radio"
            name="ai-source"
            checked={source === "local"}
            onChange={() => chooseSource("local")}
          />
          <span>
            <span className={styles.source__title}>Локальная модель</span>
            <span className={styles.source__text}>
              {LOCAL_MODEL} на стенде. Данные не покидают контур; качество текстов скромнее облачного.
            </span>
          </span>
        </label>
        <label className={styles.source}>
          <input
            type="radio"
            name="ai-source"
            checked={isCloud}
            disabled={!cloud.available}
            onChange={() => chooseSource("cloud")}
          />
          <span>
            <span className={styles.source__title}>Облачная модель</span>
            <span className={styles.source__text}>
              Qwen 27B ({cloud.model}) через Polza.ai, маршрут Cerebras fp16 ({cloud.route}).
            </span>
            {!cloud.available ? (
              <span className={styles.source__note}>
                Облачная модель ещё не подтверждена, выбрать её пока нельзя.
              </span>
            ) : null}
          </span>
        </label>
      </fieldset>

      {isCloud ? (
        <div className={styles.key}>
          <Field
            label="Ключ Polza.ai"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              setKeyError(null);
            }}
            error={keyError}
            hint={
              cloud.keyConfigured
                ? `Ключ задан …${cloud.keyLast4 ?? ""}. Оставьте поле пустым, чтобы не менять его.`
                : "Ключ не задан. Он хранится на сервере в зашифрованном виде и больше не показывается."
            }
          />
          {cloud.keyConfigured ? (
            <PlatformButton variant="ghost" onClick={clearKey} disabled={busy !== null}>
              Удалить ключ
            </PlatformButton>
          ) : null}
          {settings.cloudFunctions.length > 0 ? (
            <p className={styles.note}>
              В облако уходят только синтетические данные без имён: {settings.cloudFunctions.join(", ")}.
              Диалог звонящего остаётся на локальной модели.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={styles.actions}>
        <PlatformButton variant="secondary" onClick={runTest} disabled={busy !== null}>
          Проверить подключение
        </PlatformButton>
        <PlatformButton variant="primary" onClick={save} disabled={busy !== null}>
          Сохранить
        </PlatformButton>
      </div>
      {busy === "test" ? <p className={styles.note}>Проверка подключения…</p> : null}
      {testResult ? <TestOutcome result={testResult} /> : null}
      {notice ? (
        <Alert tone={notice.tone} role={notice.tone === "danger" ? "alert" : "status"}>
          {notice.text}
        </Alert>
      ) : null}
    </Card>
  );
}
