"use client";

import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";

import { Button } from "@/shared/ui";

import { DIAL_KEYS, MAX_DIAL_LENGTH } from "../config/callControl";
import { isDialFormatValid } from "../lib/dialNumber";
import { HandsetIcon } from "./HandsetIcon";

import styles from "./DialPad.module.css";

type DialPadProps = {
  value: string;
  onValueChange: (value: string) => void;
  onCall: () => void;
  /** Сообщение под полем набора («Абонент не найден»). */
  notice?: string;
};

const DIAL_PATTERN = /[^0-9*#]/g;
const DIAL_KEY_PATTERN = /^[0-9*#]$/;
const BACKSPACE_KEY = "Backspace";

/**
 * Вкладка «Набор»: поле номера (3–4 знака), «Позвонить», цифровая клавиатура. Цифры, «*», «#» и Backspace
 * работают с физической клавиатуры и вне поля ввода (фокус на клавишах панели); Enter — «Позвонить».
 */
export function DialPad({ value, onValueChange, onCall, notice }: DialPadProps) {
  function handleKeyPress(key: string) {
    if (value.length >= MAX_DIAL_LENGTH) return;
    onValueChange(value + key);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    onValueChange(event.target.value.replace(DIAL_PATTERN, "").slice(0, MAX_DIAL_LENGTH));
  }

  function handlePhysicalKey(event: KeyboardEvent<HTMLFormElement>) {
    if (event.target instanceof HTMLInputElement || event.altKey || event.ctrlKey || event.metaKey) return;
    if (DIAL_KEY_PATTERN.test(event.key)) {
      event.preventDefault();
      handleKeyPress(event.key);
    } else if (event.key === BACKSPACE_KEY) {
      event.preventDefault();
      onValueChange(value.slice(0, -1));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCall();
  }

  return (
    <form
      className={styles["dial-pad"]}
      onSubmit={handleSubmit}
      onKeyDown={handlePhysicalKey}
      aria-label="Набор номера"
    >
      <div className={styles["dial-pad__field"]}>
        <label className={styles["dial-pad__label"]} htmlFor="dial-number">
          Номер абонента
        </label>
        <div className={styles["dial-pad__row"]}>
          <input
            id="dial-number"
            className={styles["dial-pad__input"]}
            value={value}
            onChange={handleInputChange}
            inputMode="numeric"
            autoComplete="off"
            placeholder="301"
            maxLength={MAX_DIAL_LENGTH}
            aria-invalid={notice ? true : undefined}
            aria-describedby={notice ? "dial-notice" : undefined}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onValueChange(value.slice(0, -1))}
            disabled={value.length === 0}
            title="Стереть последнюю цифру (Backspace)"
          >
            Стереть
          </Button>
        </div>
        {notice ? (
          <span id="dial-notice" className={styles["dial-pad__notice"]} role="status">
            {notice}
          </span>
        ) : null}
      </div>
      <div className={styles["dial-pad__keys"]}>
        {DIAL_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={styles["dial-pad__key"]}
            onClick={() => handleKeyPress(key)}
            aria-label={`Клавиша ${key}`}
          >
            {key}
          </button>
        ))}
      </div>
      <Button
        type="submit"
        variant="secondary"
        className={styles["dial-pad__call"]}
        disabled={!isDialFormatValid(value)}
        title="Позвонить (Enter)"
      >
        <HandsetIcon className={styles["dial-pad__call-icon"]} size={16} />
        Позвонить
      </Button>
    </form>
  );
}
