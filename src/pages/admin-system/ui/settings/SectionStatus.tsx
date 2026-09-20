import type { SettingsForm } from "../../model/useSettingsForm";

import styles from "./SettingsSection.module.css";

type SectionStatusProps = {
  form: SettingsForm;
  savedText?: string;
};

/** Итог сохранения секции настроек: «Сохранено» либо текст ошибки 422 под формой. */
export function SectionStatus({ form, savedText = "Сохранено в мок." }: SectionStatusProps) {
  if (form.status === "saving") {
    return (
      <span className={styles.section__status} role="status">
        Сохранение…
      </span>
    );
  }
  if (form.status === "saved") {
    return (
      <span className={[styles.section__status, styles["section__status--saved"]].join(" ")} role="status">
        {savedText}
      </span>
    );
  }
  if (form.status === "error" && form.message) {
    return (
      <span className={[styles.section__status, styles["section__status--error"]].join(" ")} role="alert">
        {form.message}
      </span>
    );
  }
  return null;
}
