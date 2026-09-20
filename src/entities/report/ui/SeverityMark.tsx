import { SEVERITY_TITLES } from "../config/evaluation";
import type { MistakeSeverity } from "../model/attempt";

import styles from "./SeverityMark.module.css";

type SeverityMarkProps = {
  severity: MistakeSeverity | null;
};

/** Маркер тяжести ошибки (critical/major/minor) — цвет из палитры статусов + подпись RU. */
export function SeverityMark({ severity }: SeverityMarkProps) {
  if (!severity) return null;
  return (
    <span className={[styles.severity, styles[`severity--${severity}`]].join(" ")} data-severity={severity}>
      {SEVERITY_TITLES[severity]}
    </span>
  );
}
