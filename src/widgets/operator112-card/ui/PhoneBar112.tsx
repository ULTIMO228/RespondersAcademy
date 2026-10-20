"use client";

import { useId } from "react";
import type { ReactNode } from "react";

import { Glyph } from "@/shared/ui";

import styles from "./PhoneBar112.module.css";

/** Статус линии: «недоступен» в АРМ-112 нет (спека 009, FR-012). */
export type LineStatus112 = "Отключение" | "не подключен" | "доступен";

const PHONE_PLACEHOLDER = "+7 (   )    -  -";

type PhoneBar112Props = {
  status: LineStatus112;
  /** Трубка: при входящем снова открывает окно вызова. */
  onHandset?: () => void;
  isHandsetActive?: boolean;
  onRecordings?: () => void;
  isRecordingsOpen?: boolean;
  isRecordingsDisabled?: boolean;
  /** Окно «Записи звонков» под кнопкой. */
  recordings?: ReactNode;
  onSmsList?: () => void;
  /** Счётчик непрочитанных на «список SMS» (0 — без значка). */
  smsUnread?: number;
  /** АОН уже в формате «+7 (…) …»; пусто — до ответа. */
  aon: string;
  phoneProvided: string;
  phoneOnSite: string;
  onPhoneProvided: (value: string) => void;
  onPhoneOnSite: (value: string) => void;
  disabled?: boolean;
};

type PhoneFieldProps = {
  label: string;
  value: string;
  disabled: boolean;
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
        <Glyph name="chat" size={16} />
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
              disabled={disabled || !onAon}
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
 * Полоса телефонии карточки ПОВ-112 (КАРТОЧКА_image1; спека 009, FR-012): трубка, статус линии, «записи звонков»,
 * «список SMS», поля АОН · предоставленный · телефон на место. Своя копия — компонент ДДС не переиспользуется.
 */
export function PhoneBar112({
  status,
  onHandset,
  isHandsetActive = false,
  onRecordings,
  isRecordingsOpen = false,
  isRecordingsDisabled = false,
  recordings,
  onSmsList,
  smsUnread = 0,
  aon,
  phoneProvided,
  phoneOnSite,
  onPhoneProvided,
  onPhoneOnSite,
  disabled = false,
}: PhoneBar112Props) {
  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.bar__handset}
        data-ringing={isHandsetActive}
        aria-label={isHandsetActive ? "Входящий звонок" : "Отключение"}
        disabled={!isHandsetActive}
        onClick={onHandset}
      >
        <Glyph name={isHandsetActive ? "phone" : "hangup"} size={28} />
      </button>
      <div className={styles.bar__line}>
        <span className={styles.bar__status} aria-live="polite">
          {status}
        </span>
        <div className={styles.bar__buttons}>
          <button
            type="button"
            className={styles.bar__small}
            disabled={isRecordingsDisabled}
            aria-expanded={isRecordingsOpen}
            onClick={onRecordings}
          >
            записи звонков
          </button>
          <button type="button" className={styles.bar__small} disabled={!onSmsList} onClick={onSmsList}>
            список SMS
            {smsUnread > 0 ? (
              <span className={styles.bar__badge} aria-label={`непрочитанных: ${smsUnread}`}>
                {smsUnread}
              </span>
            ) : null}
          </button>
        </div>
        {recordings}
      </div>
      <PhoneField label="АОН" value={aon} disabled icons={["help", "pin", "globe"]} isActive />
      <PhoneField
        label="предоставленный"
        value={phoneProvided}
        disabled={disabled}
        onChange={onPhoneProvided}
        onAon={() => onPhoneProvided(aon)}
        icons={["globe"]}
      />
      <PhoneField
        label="телефон на место"
        value={phoneOnSite}
        disabled={disabled}
        onChange={onPhoneOnSite}
        onAon={() => onPhoneOnSite(aon)}
        icons={["globe"]}
      />
    </div>
  );
}
