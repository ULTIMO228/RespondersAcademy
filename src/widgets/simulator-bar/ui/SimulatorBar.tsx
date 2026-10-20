import Link from "next/link";

import { ROUTES } from "@/shared/config";
import { ReferenceToggle } from "@/features/arm-reference";

import styles from "./SimulatorBar.module.css";

/**
 * Панель «В кабинет» над экранами симулятора. Единственное добавление к виду `/arm/*` (правило №1, T039); оформлена в
 * токенах АРМ. Открытая попытка сохраняется на сервере, поэтому выход в кабинет ничего не теряет. Кнопка
 * «Справочник» (спека 005) открывает справочник панелью поверх АРМ; при запрете в задании её нет. Слот — место для
 * учебных показателей экрана (нормативы карточки ДДС, спека 012), их выносит туда SimulatorBarSlot.
 */
export function SimulatorBar() {
  return (
    <div className={styles.bar} data-simulator-bar>
      <Link className={styles.bar__link} href={ROUTES.studentHome}>
        ← В кабинет
      </Link>
      <ReferenceToggle />
      <div className={styles.bar__slot} data-simulator-bar-slot />
      <span className={styles.bar__hint}>Учебный режим · открытая попытка сохраняется</span>
    </div>
  );
}
