import Link from "next/link";

import { ROUTES } from "@/shared/config";
import { ReferenceToggle } from "@/features/arm-reference";

import styles from "./SimulatorBar.module.css";

/**
 * Панель «В кабинет» над экранами симулятора. Единственное добавление к виду `/arm/*` (правило №1, T039); оформлена в
 * токенах АРМ. Открытая попытка сохраняется на сервере, поэтому выход в кабинет ничего не теряет. Кнопка
 * «Справочник» (спека 005) стоит в правом краю и открывает справочник окошком поверх АРМ; при запрете в задании её нет.
 */
export function SimulatorBar() {
  return (
    <div className={styles.bar} data-simulator-bar>
      <Link className={styles.bar__link} href={ROUTES.studentHome}>
        ← В кабинет
      </Link>
      <span className={styles.bar__hint}>Учебный режим · открытая попытка сохраняется</span>
      <ReferenceToggle />
    </div>
  );
}
