import Link from "next/link";

import type { IncidentLink } from "../model/types";
import styles from "./IncidentRow.module.css";

type IncidentLinkChainProps = {
  links: IncidentLink[];
};

/** Операторская механика привязки в тренажёре не воспроизводится — только справка (источник п. 1.3, 3.11). */
export const LINK_MECHANICS_HINT =
  "Связи только для просмотра: привязку («Совпадение» по АОН/адресу, смена роли) выполняет оператор ПОВ-112";

/** Раскрытая цепочка связей: роли «главная»/«подчинённая», переход в связанную карточку (read-only). */
export function IncidentLinkChain({ links }: IncidentLinkChainProps) {
  return (
    <div className={styles["incident-row__chain"]} role="row">
      <span className={styles["incident-row__description-label"]}>Связи:</span>
      <ul className={styles["incident-row__chain-list"]} aria-label="Цепочка связей">
        {links.map((link) => (
          <li key={link.id} className={styles["incident-row__chain-item"]}>
            <span className={styles["incident-row__chain-role"]}>{link.role}</span>
            {link.isCurrent ? (
              <span className={styles["incident-row__chain-current"]}>№ {link.number} (эта карточка)</span>
            ) : (
              <Link href={link.href} className={styles["incident-row__chain-link"]}>
                № {link.number}
              </Link>
            )}
          </li>
        ))}
      </ul>
      <span className={styles["incident-row__description-meta"]}>{LINK_MECHANICS_HINT}</span>
    </div>
  );
}
