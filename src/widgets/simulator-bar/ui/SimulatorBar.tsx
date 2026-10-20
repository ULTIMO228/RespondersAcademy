import Link from "next/link";

import { SPECIALIZATION_TITLES, ZONE_HOME } from "@/entities/user";
import type { Specialization } from "@/shared/api";
import { ROUTES } from "@/shared/config";

import styles from "./SimulatorBar.module.css";

type SimulatorBarProps = {
  /** Зоны, доступные обучающемуся; при двух специализациях в панели появляется переключатель зон. */
  zones?: Specialization[];
  /** Зона открытого экрана — её роль подписана в панели. */
  currentZone?: Specialization;
};

/**
 * Панель «В кабинет» над экранами симулятора. Единственное добавление к виду `/arm/*` (правило №1, T039); оформлена в
 * токенах АРМ. Открытая попытка сохраняется на сервере, поэтому выход в кабинет ничего не теряет. Обучающийся с двумя
 * специализациями видит здесь подпись текущей роли и ссылку на вторую зону (спека 007); с одной — панель прежняя.
 */
export function SimulatorBar({ zones = [], currentZone }: SimulatorBarProps) {
  const others = zones.filter((zone) => zone !== currentZone);
  const showSwitch = currentZone !== undefined && zones.length > 1;
  return (
    <div className={styles.bar} data-simulator-bar>
      <Link className={styles.bar__link} href={ROUTES.studentHome}>
        ← В кабинет
      </Link>
      {showSwitch ? (
        <nav className={styles.bar__zones} aria-label="Рабочая зона">
          <span className={styles.bar__role}>{SPECIALIZATION_TITLES[currentZone]}</span>
          {others.map((zone) => (
            <Link key={zone} className={styles.bar__zone} href={ZONE_HOME[zone]}>
              {SPECIALIZATION_TITLES[zone]}
            </Link>
          ))}
        </nav>
      ) : null}
      <span className={styles.bar__hint}>Учебный режим · открытая попытка сохраняется</span>
    </div>
  );
}
