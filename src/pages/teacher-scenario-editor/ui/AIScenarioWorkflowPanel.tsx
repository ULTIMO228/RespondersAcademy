"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { AIWorkflowMode, AIScenarioVersion } from "@/shared/api";

import type { ScenarioEditorApi } from "../api/editorApi";
import { ScenarioTextCheck } from "./ScenarioTextCheck";

import styles from "./AIScenarioWorkflowPanel.module.css";

type AIScenarioWorkflowPanelProps = {
  scenarioId: string;
  category: string;
  api: ScenarioEditorApi;
};

type PanelState = { status: "loading" } | { status: "ready" } | { status: "error"; message: string };

function requestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function fieldText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value);
}

export function AIScenarioWorkflowPanel({
  scenarioId: initialScenarioId,
  category: initialCategory,
  api,
}: AIScenarioWorkflowPanelProps) {
  const [activeScenarioId, setActiveScenarioId] = useState(initialScenarioId);
  const [versions, setVersions] = useState<AIScenarioVersion[]>([]);
  const [panelState, setPanelState] = useState<PanelState>({ status: "loading" });
  const [sourceTicketId, setSourceTicketId] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [mode, setMode] = useState<AIWorkflowMode>("operator112");
  const [comment, setComment] = useState("");
  const [summaryEdit, setSummaryEdit] = useState("");
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedVersion = useMemo(() => versions.at(-1) ?? null, [versions]);

  const loadVersions = useCallback(
    async (id: string, signal?: AbortSignal) => {
      try {
        const result = await api.listAIScenarioVersions(id, signal);
        if (signal?.aborted) return;
        const lastVersion = result.at(-1);
        setActiveScenarioId(lastVersion?.scenarioId || id);
        setVersions(result);
        setPanelState({ status: "ready" });
        setSummaryEdit(fieldText(lastVersion?.cardSnapshot.fields.summary));
      } catch (error) {
        if (signal?.aborted) return;
        setPanelState({
          status: "error",
          message: error instanceof Error ? error.message : "Не удалось загрузить версии AI-сценария",
        });
      }
    },
    [api],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadVersions(initialScenarioId, controller.signal);
    return () => controller.abort();
  }, [initialScenarioId, loadVersions]);

  const handleCreate = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const created = await api.createAIScenarioDrafts({
        mode,
        sourceTicketId: sourceTicketId.trim(),
        category: category.trim(),
        count: 1,
        requestId: requestId(),
      });
      const first = created[0];
      if (!first) throw new Error("Сервис не вернул созданный черновик");
      await loadVersions(first.scenarioId);
      setNotice({ kind: "success", text: "Черновик создан и доступен только преподавателю" });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Не удалось создать черновик",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRevise = async (decision: "accepted" | "edited") => {
    if (!selectedVersion) return;
    setSaving(true);
    setNotice(null);
    try {
      const targetId = selectedVersion.scenarioId || activeScenarioId;
      const revised = await api.reviseAIScenario(targetId, {
        baseVersion: selectedVersion.version,
        comment: comment.trim(),
        acceptedFields: [
          decision === "edited"
            ? { fieldPath: "summary", decision, value: summaryEdit }
            : { fieldPath: "summary", decision },
        ],
        requestId: requestId(),
      });
      setVersions((current) => [...current, revised]);
      setSummaryEdit(fieldText(revised.cardSnapshot.fields.summary));
      setComment("");
      setNotice({ kind: "success", text: `Создана версия ${revised.version}` });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Не удалось сохранить решение по полю",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedVersion) return;
    setSaving(true);
    setNotice(null);
    try {
      const targetId = selectedVersion.scenarioId || activeScenarioId;
      const approved = await api.approveAIScenario(targetId, {
        version: selectedVersion.version,
        requestId: requestId(),
      });
      setVersions((current) => current.map((item) => (item.version === approved.version ? approved : item)));
      setNotice({ kind: "success", text: `Версия ${approved.version} утверждена` });
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Не удалось утвердить версию",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="ai-scenario-workflow-title">
      <header className={styles.header}>
        <div>
          <h2 id="ai-scenario-workflow-title" className={styles.title}>
            Версии AI-сценария
          </h2>
          <p className={styles.caption}>
            Черновики остаются закрытыми для обучающихся до утверждения преподавателем.
          </p>
        </div>
        {activeScenarioId !== initialScenarioId ? (
          <Link className={styles.link} href={`/teacher/scenarios/${encodeURIComponent(activeScenarioId)}`}>
            Открыть сценарий {activeScenarioId}
          </Link>
        ) : null}
      </header>

      <div className={styles.createForm}>
        <label className={styles.field}>
          <span>Идентификатор очищенного билета</span>
          <input value={sourceTicketId} onChange={(event) => setSourceTicketId(event.target.value)} />
        </label>
        <label className={styles.field}>
          <span>Категория ЕКП</span>
          <input value={category} onChange={(event) => setCategory(event.target.value)} />
        </label>
        <label className={styles.field}>
          <span>Режим</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as AIWorkflowMode)}>
            <option value="operator112">Специалист 112</option>
            <option value="dds">ДДС</option>
          </select>
        </label>
        <button
          type="button"
          className={styles.button}
          disabled={saving || !sourceTicketId.trim() || !category.trim()}
          onClick={() => void handleCreate()}
        >
          Создать черновик
        </button>
      </div>

      {panelState.status === "loading" ? <p role="status">Загрузка версий…</p> : null}
      {panelState.status === "error" ? (
        <p className={styles.error} role="alert">
          {panelState.message}
        </p>
      ) : null}
      {notice ? (
        <p
          className={notice.kind === "error" ? styles.error : styles.success}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      ) : null}

      {versions.length ? (
        <>
          <ol className={styles.versionList} aria-label="История AI-версий">
            {versions.map((version) => (
              <li className={styles.versionItem} key={`${version.scenarioId}-${version.version}`}>
                <span>
                  Версия {version.version} · {version.mode}
                </span>
                <span>
                  {version.approval} · проверка: {version.validation}
                </span>
              </li>
            ))}
          </ol>
          {selectedVersion ? (
            <div className={styles.review}>
              <p className={styles.meta}>
                Источник: {selectedVersion.sourceTicketId}, ситуация {selectedVersion.sourceSituationNo};
                карточка {selectedVersion.cardSnapshot.id}
              </p>
              <label className={styles.field}>
                <span>Фабула карточки</span>
                <textarea
                  value={summaryEdit}
                  onChange={(event) => setSummaryEdit(event.target.value)}
                  rows={3}
                />
              </label>
              <ScenarioTextCheck
                api={api}
                scenarioId={selectedVersion.scenarioId || activeScenarioId}
                version={selectedVersion.version}
                fieldPath="summary"
                fieldTitle="Фабула карточки"
                text={summaryEdit}
              />
              <label className={styles.field}>
                <span>Комментарий преподавателя</span>
                <input value={comment} onChange={(event) => setComment(event.target.value)} />
              </label>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={saving || !summaryEdit.trim()}
                  onClick={() => void handleRevise("edited")}
                >
                  Сохранить правку фабулы
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={saving}
                  onClick={() => void handleRevise("accepted")}
                >
                  Принять фабулу
                </button>
                {selectedVersion.validation === "passed" && selectedVersion.approval !== "approved" ? (
                  <button
                    type="button"
                    className={styles.button}
                    disabled={saving}
                    onClick={() => void handleApprove()}
                  >
                    Утвердить версию
                  </button>
                ) : null}
              </div>
              {selectedVersion.validationErrors.length ? (
                <div className={styles.errorBlock}>
                  <h3>Ошибки проверки</h3>
                  <ul>
                    {selectedVersion.validationErrors.map((error) => (
                      <li key={`${error.fieldPath}-${error.code}`}>
                        {error.fieldPath}: {error.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className={styles.success}>Структурная проверка пройдена</p>
              )}
              {selectedVersion.fieldDecisions.length ? (
                <div>
                  <h3 className={styles.subheading}>Решения по полям</h3>
                  <ul className={styles.decisionList}>
                    {selectedVersion.fieldDecisions.map((decision) => (
                      <li key={`${decision.fieldPath}-${decision.at}`}>
                        <span>
                          {decision.fieldPath} — {decision.decision}
                          {decision.comment ? ` · ${decision.comment}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : panelState.status === "ready" ? (
        <p className={styles.caption}>У этого сценария пока нет версий AI-workflow.</p>
      ) : null}
    </section>
  );
}
