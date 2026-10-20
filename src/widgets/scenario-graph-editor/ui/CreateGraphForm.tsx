"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { ServerRequiredError } from "@/shared/api";
import type { AIWorkflowMode, ScenarioSourceItem } from "@/shared/api";
import { EmptyState, ErrorState, ServerRequiredState, Skeleton } from "@/shared/ui/platform";

import type { ScenarioGraphEditorApi } from "../api/graphEditorApi";
import { errorMessage } from "../model/useGraphEditor";
import type { CreateInput } from "../model/useGraphEditor";
import { Btn, Select, TextArea, TextInput } from "./controls";

import styles from "./Editor.module.css";

type SourcesState =
  | { status: "loading" }
  | { status: "error"; message: string; serverRequired: boolean }
  | { status: "ready"; items: ScenarioSourceItem[] };

type CreateGraphFormProps = {
  api: ScenarioGraphEditorApi;
  categories: string[];
  busy: boolean;
  onCreate: (input: CreateInput) => void;
};

/** Создание графа для сценария без AI-версий: источник из /sources, категория, заголовок, описание, режим. */
export function CreateGraphForm({ api, categories, busy, onCreate }: CreateGraphFormProps) {
  const [sources, setSources] = useState<SourcesState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [sourceTicketId, setSourceTicketId] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [mode, setMode] = useState<AIWorkflowMode>("operator112");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setSources({ status: "loading" });
    api
      .listScenarioSources(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setSources({ status: "ready", items });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setSources({
          status: "error",
          message: errorMessage(error, "Не удалось загрузить источники сценариев"),
          serverRequired: error instanceof ServerRequiredError,
        });
      });
    return () => controller.abort();
  }, [api, reloadKey]);

  if (sources.status === "loading") return <Skeleton lines={3} label="Загрузка источников сценариев…" />;
  if (sources.status === "error") {
    return sources.serverRequired ? (
      <ServerRequiredState onRetry={() => setReloadKey((key) => key + 1)} />
    ) : (
      <ErrorState
        title="Не удалось загрузить источники"
        message={sources.message}
        onRetry={() => setReloadKey((key) => key + 1)}
      />
    );
  }
  if (sources.items.length === 0) {
    return (
      <EmptyState
        title="Нет доступных источников"
        text="Для создания графа нужен очищенный билет-источник; сервер не вернул ни одного."
      />
    );
  }

  const sourceError = submitted && !sourceTicketId ? "Выберите источник" : null;
  const categoryError = submitted && !category.trim() ? "Укажите категорию" : null;
  const summaryError = submitted && !summary.trim() ? "Опишите ситуацию кратко" : null;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!sourceTicketId || !category.trim() || !summary.trim()) return;
    onCreate({ mode, sourceTicketId, category: category.trim(), title, summary });
  };

  return (
    <form className={styles.create} onSubmit={handleSubmit} aria-label="Создание графа сценария" noValidate>
      <Select
        label="Источник (очищенный билет)"
        value={sourceTicketId}
        error={sourceError}
        onChange={(event) => setSourceTicketId(event.target.value)}
      >
        <option value="">— выберите источник —</option>
        {sources.items.map((item) => (
          <option key={item.sourceTicketId} value={item.sourceTicketId}>
            Ситуация {item.situationNo}: {item.preview}
          </option>
        ))}
      </Select>
      {categories.length > 0 ? (
        <Select
          label="Категория"
          value={category}
          error={categoryError}
          onChange={(event) => setCategory(event.target.value)}
        >
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
      ) : (
        <TextInput
          label="Категория"
          value={category}
          error={categoryError}
          onChange={(event) => setCategory(event.target.value)}
        />
      )}
      <Select label="Режим" value={mode} onChange={(event) => setMode(event.target.value as AIWorkflowMode)}>
        <option value="operator112">Специалист 112</option>
        <option value="dds">Диспетчер ДДС</option>
      </Select>
      <TextInput
        label="Заголовок (необязательно)"
        maxLength={160}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <TextArea
        label="Краткое описание ситуации"
        rows={3}
        value={summary}
        error={summaryError}
        onChange={(event) => setSummary(event.target.value)}
      />
      <div>
        <Btn type="submit" variant="primary" disabled={busy}>
          Создать граф
        </Btn>
      </div>
    </form>
  );
}
