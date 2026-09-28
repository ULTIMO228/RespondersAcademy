import { RoleMatrix } from "@/entities/user";
import { Panel } from "@/shared/ui";

import { ROLE_ABILITIES } from "../config/roleAbilities";

import styles from "./RolesMatrixInfo.module.css";

/**
 * Справочная плашка «Что может роль» (T4.1-10) — read-only, без интерактива.
 * Матрица доступа к разделам и формулировки «может / не может» — дословно по spec/000-фронт/02-roles.md.
 */
export function RolesMatrixInfo() {
  return (
    <Panel
      title="Права доступа: что может роль"
      headerTone="dark"
      actions={<span className={styles.matrix__readonly}>только чтение</span>}
    >
      <RoleMatrix />
      <div className={styles.matrix__columns}>
        {ROLE_ABILITIES.map((role) => (
          <section key={role.role} className={styles.matrix__column} aria-label={role.title}>
            <h3 className={styles.matrix__title}>{role.title}</h3>
            <p className={styles.matrix__subtitle}>Может</p>
            <ul className={styles.matrix__list}>
              {role.can.map((item) => (
                <li key={item} className={styles.matrix__item}>
                  {item}
                </li>
              ))}
            </ul>
            <p className={styles.matrix__subtitle}>Не может</p>
            <ul className={styles.matrix__list}>
              {role.cannot.map((item) => (
                <li key={item} className={[styles.matrix__item, styles["matrix__item--no"]].join(" ")}>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className={styles.matrix__note}>
        Роли фиксированы (3 значения, Q&amp;A в14). Переключение роли без повторного входа не допускается.
      </p>
    </Panel>
  );
}
