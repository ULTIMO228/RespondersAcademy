"use client";

/*
 * Поле ввода чата (спека 010, §2.2, US2): textarea с авто-ростом 44→140px, Enter отправляет, Shift+Enter переносит,
 * maxLength 1000 со счётчиком, кнопка 36×36 (стрелка / спиннер при ожидании). Загрузки файлов нет вовсе:
 * ни input[type=file], ни скрепки; dragover/drop подавляются.
 */
import { useLayoutEffect, useRef, useState } from "react";
import type { ClipboardEvent, DragEvent, KeyboardEvent } from "react";

import { PfIcon } from "@/shared/ui/platform";

import styles from "./ChatInput.module.css";

export const MIN_HEIGHT = 44;
export const MAX_HEIGHT = 140;
export const MAX_LENGTH = 1000;
export const PLACEHOLDER = "Спросите, почему снижен балл или как действовать по регламенту...";

type ChatInputProps = {
  onSend: (text: string) => void;
  /** Ответ ещё не получен: Enter и клик игнорируются, на кнопке спиннер. */
  waiting: boolean;
};

function suppress(event: DragEvent<HTMLElement>) {
  event.preventDefault();
}

export function ChatInput({ onSend, waiting }: ChatInputProps) {
  const [value, setValue] = useState("");
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  // Авторост: сначала сбрасываем высоту, потом берём содержимое, но не выше MAX_HEIGHT (дальше — скролл).
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    const wanted = Math.min(Math.max(field.scrollHeight, MIN_HEIGHT), MAX_HEIGHT);
    field.style.height = `${wanted}px`;
    field.style.overflowY = field.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }, [value]);

  const canSend = value.trim().length > 0 && !waiting;

  function submit() {
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  }

  // Файлы в чат не принимаются, в том числе вставкой из буфера обмена.
  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (event.clipboardData.files.length > 0) event.preventDefault();
  }

  return (
    <div className={styles.input} onDragOver={suppress} onDrop={suppress}>
      <div className={styles.row}>
        <textarea
          ref={fieldRef}
          className={styles.field}
          value={value}
          rows={1}
          maxLength={MAX_LENGTH}
          placeholder={PLACEHOLDER}
          aria-label="Сообщение ассистенту"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onDragOver={suppress}
          onDrop={suppress}
        />
        <button
          type="button"
          className={styles.send}
          aria-label="Отправить"
          disabled={!canSend}
          aria-busy={waiting}
          onClick={submit}
        >
          {waiting ? (
            <span className={styles.spinner} data-testid="chat-spinner" aria-hidden="true" />
          ) : (
            <PfIcon name="arrow" size={18} />
          )}
        </button>
      </div>
      <p className={styles.counter} aria-hidden="true">
        {value.length} / {MAX_LENGTH}
      </p>
    </div>
  );
}
