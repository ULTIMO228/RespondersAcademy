import type { ReactNode } from "react";

import styles from "./ServiceTile.module.css";

export type ServiceTileProps = {
  /** Краткое имя службы («Служба 101»); длинное усекается многоточием («Поселение Во…»). */
  name: string;
  /** Полное имя — во всплывающей подсказке. */
  fullName?: string;
  /** «11:14 Добавлена» — время и название последнего статуса. */
  statusLine: string;
  isPhoneOnly?: boolean;
  /** Основная служба типа происшествия — двойное подчёркивание имени. */
  isMain?: boolean;
  /** Активная плитка (открыта история / смена статуса) — синяя подсветка. */
  isActive?: boolean;
  /** Верхняя строка плитки: иконки «моей службы» (конверт, карандаш); по умолчанию — шеврон. */
  actions?: ReactNode;
};

function TileChevron() {
  return (
    <svg className={styles.tile__chevron} width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
      <path d="M1 5l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/** Плитка службы нижней панели «Службы:» (ДДС_image6–20, p23_Image108). */
export function ServiceTile({
  name,
  fullName,
  statusLine,
  isPhoneOnly = false,
  isMain = false,
  isActive = false,
  actions,
}: ServiceTileProps) {
  const classNames = [
    styles.tile,
    isPhoneOnly ? styles["tile--phone-only"] : "",
    isActive ? styles["tile--active"] : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={classNames}
      title={fullName ?? name}
      data-main={isMain}
      data-phone-only={isPhoneOnly}
      data-active={isActive}
    >
      <div className={styles.tile__top}>{actions ?? <TileChevron />}</div>
      <span className={[styles.tile__name, isMain ? styles["tile__name--main"] : ""].join(" ")}>{name}</span>
      <span className={styles.tile__status} title={statusLine}>
        {statusLine}
      </span>
    </div>
  );
}
