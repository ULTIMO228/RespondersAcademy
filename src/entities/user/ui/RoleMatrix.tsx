import type { UserRole } from "@/shared/api";

import type { RoleAccess } from "../config/roleAccess";
import { ROLE_ACCESS_ROWS, ROLE_ORDER } from "../config/roleAccess";
import { ROLE_TITLES } from "../model/roles";

import styles from "./RoleMatrix.module.css";

function AccessCell({ access }: { access: RoleAccess }) {
  if (!access.allowed) {
    return (
      <span className={styles.matrix__no} aria-label="нет доступа">
        —
      </span>
    );
  }
  return (
    <span className={styles.matrix__yes}>
      +{access.note ? <span className={styles.matrix__note}> ({access.note})</span> : null}
    </span>
  );
}

/** Справочная матрица «что может роль» (spec/02-roles.md) — только чтение. */
export function RoleMatrix() {
  return (
    <table className={styles.matrix} aria-label="Матрица доступа ролей к разделам">
      <thead>
        <tr>
          <th scope="col">Раздел</th>
          {ROLE_ORDER.map((role: UserRole) => (
            <th key={role} scope="col" className={styles.matrix__role}>
              {ROLE_TITLES[role]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ROLE_ACCESS_ROWS.map((row) => (
          <tr key={row.route}>
            <th scope="row" className={styles.matrix__section}>
              {row.title} <code className={styles.matrix__route}>{row.route}</code>
            </th>
            {ROLE_ORDER.map((role) => (
              <td key={role}>
                <AccessCell access={row.access[role]} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
