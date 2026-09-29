import Link from "next/link";
import { useId } from "react";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

import styles from "./form.module.css";

export type PlatformButtonVariant = "primary" | "secondary" | "ghost";

function buttonClass(variant: PlatformButtonVariant, className?: string): string {
  return [styles.button, styles[`button--${variant}`], className].filter(Boolean).join(" ");
}

type PlatformButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: PlatformButtonVariant };

/** Кнопка платформы. Главное действие страницы — одна `primary` (затемнённый оранжевый АРМ). */
export function PlatformButton({
  variant = "secondary",
  className,
  type = "button",
  ...rest
}: PlatformButtonProps) {
  return <button type={type} className={buttonClass(variant, className)} {...rest} />;
}

type LinkButtonProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  variant?: PlatformButtonVariant;
};

/** Ссылка, оформленная как кнопка (навигация — ссылка, не кнопка). */
export function LinkButton({ variant = "secondary", className, href, ...rest }: LinkButtonProps) {
  return <Link href={href} className={buttonClass(variant, className)} {...rest} />;
}

type FieldShared = {
  label: string;
  hint?: string;
  error?: string | null;
  className?: string;
};

type FieldProps = FieldShared & Omit<InputHTMLAttributes<HTMLInputElement>, "className">;

/** Поле ввода с подписью, подсказкой и ошибкой; ошибка связана с полем через aria-describedby. */
export function Field({ label, hint, error, className, id, ...inputProps }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = [error ? `${inputId}-error` : "", hint ? `${inputId}-hint` : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <label className={styles.field__label} htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className={styles.field__control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...inputProps}
      />
      {hint ? (
        <span id={`${inputId}-hint`} className={styles.field__hint}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${inputId}-error`} className={styles.field__error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

type SelectFieldProps = FieldShared &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & { children: ReactNode };

export function SelectField({
  label,
  hint,
  error,
  className,
  id,
  children,
  ...selectProps
}: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <label className={styles.field__label} htmlFor={selectId}>
        {label}
      </label>
      <select
        id={selectId}
        className={styles.field__control}
        aria-invalid={error ? true : undefined}
        {...selectProps}
      >
        {children}
      </select>
      {hint ? <span className={styles.field__hint}>{hint}</span> : null}
      {error ? (
        <span className={styles.field__error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
