"use client";

import Link from "next/link";
import { useId } from "react";
import type { ReactNode } from "react";

import { ROUTES } from "@/shared/config";

import { PHONE_MASK_TEMPLATE } from "../config/constants";
import { formatPhoneMask } from "../lib/phoneMask";
import { CardIcon } from "./CardIcon";

import styles from "./PhoneField.module.css";

type PhoneFieldProps = {
  label: string;
  value: string;
  /** Поле редактируемое (телефон на место); иначе — только чтение (АОН). */
  onChange?: (value: string) => void;
  onSmsClick?: () => void;
  /** Иконки справа сверху поля: копирование, «АОН». */
  actions?: ReactNode;
  disabled?: boolean;
  /** Переход в софтфон (живой режим — с контекстом карточки: /arm/phone?cardId=…). */
  callHref?: string;
};

/** Колонка «трубка + чат» и поле номера с маской +7 (___) ___-__-__ (ДДС_image6, p23_Image108). */
export function PhoneField({
  label,
  value,
  onChange,
  onSmsClick,
  actions,
  disabled = false,
  callHref = ROUTES.armPhone,
}: PhoneFieldProps) {
  const inputId = useId();
  const maskedValue = formatPhoneMask(value);
  const hasNumber = Boolean(maskedValue);
  return (
    <div className={styles.phone}>
      <div className={styles.phone__icons}>
        <Link
          href={callHref}
          className={styles.phone__icon}
          aria-label={`Позвонить: ${label}`}
          title="Позвонить (софтфон)"
        >
          <CardIcon name="phone" size={22} />
        </Link>
        <button
          type="button"
          className={[styles.phone__icon, hasNumber ? styles["phone__icon--active"] : ""].join(" ")}
          aria-label={`Отправить СМС: ${label}`}
          title="Отправить СМС"
          onClick={onSmsClick}
          disabled={disabled || !onSmsClick}
        >
          <CardIcon name="chat" size={18} />
        </button>
      </div>
      <div className={styles.phone__field}>
        <div className={styles.phone__head}>
          <label className={styles.phone__label} htmlFor={inputId}>
            {label}
          </label>
          {actions ? <div className={styles.phone__actions}>{actions}</div> : null}
        </div>
        <input
          id={inputId}
          className={[styles.phone__input, hasNumber ? styles["phone__input--filled"] : ""].join(" ")}
          value={maskedValue}
          placeholder={onChange ? PHONE_MASK_TEMPLATE : undefined}
          readOnly={!onChange || disabled}
          inputMode="tel"
          onChange={(event) => onChange?.(event.target.value)}
        />
      </div>
    </div>
  );
}
