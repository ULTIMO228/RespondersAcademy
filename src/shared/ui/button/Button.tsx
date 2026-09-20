import type { ButtonHTMLAttributes } from "react";

import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "danger" | "blue" | "dark" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/** Плоская кнопка ПОВ-112: прямоугольная, радиус 2 px, явные состояния hover/focus/disabled. */
export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const classNames = [styles.button, styles[`button--${variant}`], styles[`button--${size}`], className]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classNames} {...rest} />;
}
