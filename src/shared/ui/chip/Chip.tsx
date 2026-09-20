import type { ButtonHTMLAttributes } from "react";

import styles from "./Chip.module.css";

type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
};

/** Чип опросной карты / мультиселекта: белый с рамкой, выбранный — синий (КАРТОЧКА_image2). */
export function Chip({ selected = false, className, type = "button", ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={[styles.chip, selected ? styles["chip--selected"] : "", className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}
