"use client";

import { useId } from "react";
import type { ReactNode } from "react";

import { formatAon, formatClock } from "@/entities/operator112-attempt";
import type { OperatorAttempt } from "@/shared/api";
import { formatDate, formatTime } from "@/shared/lib";
import { Glyph } from "@/shared/ui";

import styles from "./Operator112.module.css";

/** Порог красного таймера шапки: в памятке не назван, по референсам 00:09 — тёмный, 01:23 — красный (plan.md). */
export const TIMER_RED_SEC = 60;
const PHONE_PLACEHOLDER = "+7 (   )    -  -";

type CardTopBarProps = {
  attempt: OperatorAttempt;
  /** Секунды с «Принять»; до ответа — 0. */
  talkSec: number;
  operatorLine: string;
  phoneProvided: string;
  phoneOnSite: string;
  disabled: boolean;
  onPhoneProvided: (value: string) => void;
  onPhoneOnSite: (value: string) => void;
  /** Трубка во время звонка: снова открыть окно «Входящий звонок». */
  onHandset: () => void;
  isRecordingsOpen: boolean;
  onRecordings: () => void;
  /** Окно «Записи звонков» под кнопкой. */
  recordings: ReactNode;
};

type PhoneFieldProps = {
  label: string;
  value: string;
  disabled: boolean;
  /** Поле АОН заполняет сервер — только чтение. */
  onChange?: (value: string) => void;
  /** «АОН» — подставить номер заявителя. */
  onAon?: () => void;
  isActive?: boolean;
  icons: ("help" | "pin" | "globe")[];
};

function PhoneField({ label, value, disabled, onChange, onAon, isActive = false, icons }: PhoneFieldProps) {
  const id = useId();
  return (
    <div className={styles.phone} data-active={isActive}>
      <span className={styles.phone__side} aria-hidden="true">
        <Glyph name="phone" size={22} />
        <span className={styles.phone__chat}>
          <Glyph name="chat" size={16} />
        </span>
      </span>
      <div className={styles.phone__field}>
        <span className={styles.phone__label}>
          <label htmlFor={id}>{label}</label>
          <span className={styles.phone__icons} aria-hidden="true">
            {icons.map((icon) => (
              <Glyph key={icon} name={icon} size={14} />
            ))}
          </span>
        </span>
        <span className={styles.phone__row}>
          <input
            id={id}
            className={styles.phone__input}
            value={value}
            placeholder={PHONE_PLACEHOLDER}
            readOnly={!onChange}
            disabled={disabled && Boolean(onChange)}
            onChange={(event) => onChange?.(event.target.value)}
          />
          {onAon ? (
            <button
              type="button"
              className={styles.phone__aon}
              disabled={disabled}
              onClick={onAon}
              aria-label={`${label}: подставить АОН`}
            >
              АОН
            </button>
          ) : null}
        </span>
      </div>
    </div>
  );
}

/**
 * Полоса телефонии и шапка карточки ПОВ-112 (КАРТОЧКА_image1; спека 009, FR-012, FR-013): трубка, состояние линии,
 * «записи звонков», «список SMS», поля АОН · предоставленный · телефон на место, «Происшествие N · Сохр. · Опер.» и таймер
 * «ММ:СС минут секунд» — тёмный до порога, красный после.
 */
export function CardTopBar(props: CardTopBarProps) {
  const { attempt, talkSec, disabled } = props;
  const isRinging = attempt.state === "ringing";
  const aon = formatAon(attempt.aon);
  return (
    <div className={styles.top}>
      <button
        type="button"
        className={styles.top__handset}
        data-ringing={isRinging}
        aria-label={isRinging ? "Входящий звонок" : "Отключение"}
        title={isRinging ? "Входящий звонок" : "Отключение"}
        disabled={!isRinging}
        onClick={props.onHandset}
      >
        <Glyph name={isRinging ? "phone" : "hangup"} size={28} />
      </button>
      <div className={styles.top__line}>
        <span className={styles.top__status} aria-live="polite">
          {isRinging ? "доступен" : "Отключение"}
        </span>
        <div className={styles.top__buttons}>
          <button
            type="button"
            className={styles.top__small}
            disabled={isRinging}
            aria-expanded={props.isRecordingsOpen}
            onClick={props.onRecordings}
          >
            записи звонков
          </button>
          <button
            type="button"
            className={styles.top__small}
            disabled
            title="История сообщений — следующий этап тренажёра (спека 009, этап C)"
          >
            список SMS
          </button>
        </div>
        {props.recordings}
      </div>
      <PhoneField label="АОН" value={isRinging ? "" : aon} disabled isActive icons={["help", "pin", "globe"]} />
      <PhoneField
        label="предоставленный"
        value={props.phoneProvided}
        disabled={disabled}
        onChange={props.onPhoneProvided}
        onAon={() => props.onPhoneProvided(aon)}
        icons={["globe"]}
      />
      <PhoneField
        label="телефон на место"
        value={props.phoneOnSite}
        disabled={disabled}
        onChange={props.onPhoneOnSite}
        onAon={() => props.onPhoneOnSite(aon)}
        icons={["globe"]}
      />
      <div className={styles.top__info} data-testid="card-header">
        <h1 className={styles.top__title}>Происшествие {attempt.incidentNumber}</h1>
        <span>
          Сохр. {formatDate(attempt.createdAt)} в {formatTime(attempt.createdAt)}
        </span>
        <span>{props.operatorLine}</span>
      </div>
      <div
        className={styles.top__timer}
        data-exceeded={talkSec > TIMER_RED_SEC}
        role="timer"
        aria-label={`Время карточки: ${formatClock(talkSec)}`}
      >
        <span className={styles.top__clock}>{formatClock(talkSec)}</span>
        <span className={styles.top__units}>
          <span>минут</span>
          <span>секунд</span>
        </span>
      </div>
    </div>
  );
}
