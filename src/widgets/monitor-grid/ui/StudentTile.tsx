import Link from "next/link";

import { STUDENT_STATE_TITLES } from "@/entities/session";
import { ROUTES } from "@/shared/config";
import { AiBadge, TimerBadge } from "@/shared/ui";

import type { StudentTileModel } from "../model/types";

import styles from "./StudentTile.module.css";

type StudentTileProps = {
  tile: StudentTileModel;
};

/** Плитка курсанта: ФИО, № АРМ, карточка, состояние, таймеры нормативов, статус, ошибки. */
export function StudentTile({ tile }: StudentTileProps) {
  const isOffline = tile.state === "offline";
  const isExceeded = !isOffline && (tile.isReactionExceeded || tile.isProcessingExceeded);
  const modifier = isOffline ? styles["tile--offline"] : isExceeded ? styles["tile--exceeded"] : "";
  return (
    <Link
      href={ROUTES.teacherMonitor(tile.studentId)}
      className={[styles.tile, modifier].join(" ")}
      data-state={tile.state}
      data-exceeded={isExceeded}
      title={`Открыть экран курсанта ${tile.shortName} (только просмотр)`}
    >
      <header className={styles.tile__header}>
        <span className={styles.tile__name}>{tile.shortName}</span>
        <span className={styles.tile__arm}>АРМ {tile.armNumber}</span>
      </header>
      <div className={styles.tile__body}>
        <p className={styles.tile__card}>
          <span className={styles.tile__label}>Происшествие</span>
          <span className={styles.tile__number}>{tile.cardNumber}</span>
          <span className={styles.tile__type}>{tile.cardType}</span>
        </p>
        <p className={styles.tile__state}>
          <span
            className={[styles.tile__dot, styles[`tile__dot--${tile.state}`]].join(" ")}
            aria-hidden="true"
          />
          {STUDENT_STATE_TITLES[tile.state]}
        </p>
        {isOffline ? (
          <p className={styles.tile__offline}>Нет связи с АРМ — показаны последние данные</p>
        ) : (
          <div className={styles.tile__timers}>
            <TimerBadge value={tile.reaction} exceeded={tile.isReactionExceeded} caption="реакция" />
            <TimerBadge value={tile.processing} exceeded={tile.isProcessingExceeded} caption="отработка" />
          </div>
        )}
        <dl className={styles.tile__facts}>
          <dt>Статус:</dt>
          <dd>{tile.statusTitle}</dd>
          <dt>Ошибок:</dt>
          <dd className={tile.errorCount > 0 ? styles["tile__errors--has"] : undefined}>
            {tile.errorCount}{" "}
            {tile.isAiEvaluated ? <AiBadge title="Счётчик ошибок — мок-оценка ИИ-модуля" /> : null}
          </dd>
        </dl>
      </div>
    </Link>
  );
}
