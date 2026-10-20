"use client";

import { useId } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

import styles from "./controls.module.css";

type BtnVariant = "primary" | "secondary" | "danger";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant };

/** Кнопка редактора: высота не меньше --pf-target-touch, текст не меньше --pf-fs-lead. */
export function Btn({ variant = "secondary", className, type = "button", ...rest }: BtnProps) {
  return (
    <button
      type={type}
      className={[styles.btn, styles[`btn--${variant}`], className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}

type FieldShell = { label: string; hint?: string; error?: string | null };

function Shell({ label, hint, error, id, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <label className={styles.field__label} htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? (
        <span id={`${id}-hint`} className={styles.field__hint}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-error`} className={styles.field__error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string | null): string | undefined {
  const ids = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ");
  return ids || undefined;
}

export function TextInput({
  label,
  hint,
  error,
  ...rest
}: FieldShell & Omit<InputHTMLAttributes<HTMLInputElement>, "className">) {
  const id = useId();
  return (
    <Shell label={label} hint={hint} error={error} id={id}>
      <input
        id={id}
        className={styles.control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      />
    </Shell>
  );
}

export function TextArea({
  label,
  hint,
  error,
  ...rest
}: FieldShell & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">) {
  const id = useId();
  return (
    <Shell label={label} hint={hint} error={error} id={id}>
      <textarea
        id={id}
        className={`${styles.control} ${styles.control__area}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      />
    </Shell>
  );
}

export function Select({
  label,
  hint,
  error,
  children,
  ...rest
}: FieldShell & Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & { children: ReactNode }) {
  const id = useId();
  return (
    <Shell label={label} hint={hint} error={error} id={id}>
      <select
        id={id}
        className={styles.control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      >
        {children}
      </select>
    </Shell>
  );
}

export function Checkbox({ label, ...rest }: { label: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type">) {
  return (
    <label className={styles.check}>
      <input type="checkbox" className={styles.check__box} {...rest} />
      <span>{label}</span>
    </label>
  );
}
