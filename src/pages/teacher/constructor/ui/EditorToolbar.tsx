"use client";

import { forwardRef } from "react";

import { formatHourMinute } from "@/shared/lib";
import { PfIcon, PlatformButton } from "@/shared/ui/platform";

import type { SaveStatus } from "../model/useFlowEditor";
import styles from "./ConstructorScreen.module.css";

export type EditorView = "schema" | "outline";

type EditorToolbarProps = {
  title: string;
  status: SaveStatus;
  previewing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  view: EditorView;
  errors: number;
  /** Правильные ответы скрыты в подписях блоков (показ схемы при студентах). */
  hideAnswers: boolean;
  onView: (view: EditorView) => void;
  onToggleAnswers: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onValidate: () => void;
  onTest: () => void;
  onStopTest: () => void;
  onNew: () => void;
  onExample: () => void;
};

function statusView(status: SaveStatus): { text: string; tone: string; icon: string } {
  switch (status.kind) {
    case "saved":
      return {
        text: `Сохранено в браузере ${formatHourMinute(status.at.toISOString())}`,
        tone: "ok",
        icon: "✓",
      };
    case "dirty":
      return { text: "Есть несохранённые изменения", tone: "dirty", icon: "●" };
    case "failed":
      return { text: "Не удалось сохранить в браузере", tone: "bad", icon: "⚠" };
    default:
      return { text: "Изменений нет", tone: "muted", icon: "" };
  }
}

/** Верхняя панель действий (design-concept.md §8): одна оранжевая кнопка — «Опубликовать». */
export const EditorToolbar = forwardRef<HTMLDivElement, EditorToolbarProps>(function EditorToolbar(
  {
    title,
    status,
    previewing,
    canUndo,
    canRedo,
    view,
    errors,
    hideAnswers,
    onView,
    onToggleAnswers,
    onUndo,
    onRedo,
    onSave,
    onValidate,
    onTest,
    onStopTest,
    onNew,
    onExample,
  },
  ref,
) {
  const saved = statusView(status);
  const testBlocked = errors > 0 ? `Сначала исправьте ошибки проверки (${errors})` : undefined;
  return (
    <div ref={ref} className={styles.toolbar} role="toolbar" aria-label="Действия со сценарием" tabIndex={-1}>
      <div className={styles.toolbar__left}>
        <h1 className={styles.toolbar__title} title={title}>
          {title || "Без названия"}
        </h1>
        <span className={styles.chip}>{previewing ? "Пробный прогон" : "Прототип"}</span>
        <span className={[styles.saveState, styles[`saveState--${saved.tone}`]].join(" ")} role="status">
          {saved.icon ? <span aria-hidden="true">{saved.icon}</span> : null}
          {saved.text}
        </span>
      </div>
      <div className={styles.toolbar__right}>
        <PlatformButton
          className={styles.square}
          onClick={onUndo}
          disabled={!canUndo || previewing}
          aria-label="Отменить"
          title="Отменить (Ctrl + Z)"
        >
          <PfIcon name="undo" />
        </PlatformButton>
        <PlatformButton
          className={styles.square}
          onClick={onRedo}
          disabled={!canRedo || previewing}
          aria-label="Повторить"
          title="Повторить (Ctrl + Shift + Z)"
        >
          <PfIcon name="redo" />
        </PlatformButton>
        <span className={styles.separator} aria-hidden="true" />
        <div className={styles.segmented} role="group" aria-label="Вид">
          <button
            type="button"
            aria-pressed={view === "schema"}
            onClick={() => onView("schema")}
            title="Схема"
          >
            <PfIcon name="flow" /> <span className={styles.toolbar__label}>Схема</span>
          </button>
          <button
            type="button"
            aria-pressed={view === "outline"}
            onClick={() => onView("outline")}
            title="Список шагов"
          >
            <PfIcon name="list" /> <span className={styles.toolbar__label}>Список</span>
          </button>
        </div>
        <PlatformButton
          className={styles.button}
          onClick={onToggleAnswers}
          title={
            hideAnswers
              ? "Показать правильные ответы в блоках"
              : "Скрыть правильные ответы в блоках, например перед показом схемы студентам"
          }
        >
          <PfIcon name={hideAnswers ? "eye" : "eyeOff"} />{" "}
          <span className={styles.toolbar__label}>{hideAnswers ? "Показать ответы" : "Скрыть ответы"}</span>
        </PlatformButton>
        <details className={styles.more}>
          <summary className={styles.more__summary}>Ещё</summary>
          <div className={styles.more__menu}>
            <PlatformButton
              variant="ghost"
              className={styles.button}
              onClick={onExample}
              disabled={previewing}
            >
              Открыть пример: билет 4.1
            </PlatformButton>
            <PlatformButton variant="ghost" className={styles.button} onClick={onNew} disabled={previewing}>
              Новый пустой сценарий
            </PlatformButton>
          </div>
        </details>
        <span className={styles.separator} aria-hidden="true" />
        <PlatformButton
          className={styles.button}
          onClick={onSave}
          disabled={previewing}
          title="Сохранить (Ctrl + S)"
        >
          <PfIcon name="save" /> Сохранить
        </PlatformButton>
        <PlatformButton className={styles.button} onClick={onValidate}>
          <PfIcon name="validate" /> Проверить
        </PlatformButton>
        {previewing ? (
          <PlatformButton className={styles.button} onClick={onStopTest}>
            <PfIcon name="stop" /> Остановить тест
          </PlatformButton>
        ) : (
          <PlatformButton
            className={styles.button}
            onClick={onTest}
            aria-disabled={Boolean(testBlocked)}
            title={testBlocked}
          >
            <PfIcon name="play" /> Запустить тест
          </PlatformButton>
        )}
        <PlatformButton
          variant="primary"
          className={styles.button}
          disabled
          title="Публикация появится вместе с сервером конструктора: в прототипе сценарий хранится только в этом браузере"
        >
          <PfIcon name="publish" /> Опубликовать
        </PlatformButton>
      </div>
    </div>
  );
});
