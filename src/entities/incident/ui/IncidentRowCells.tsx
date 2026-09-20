import Link from "next/link";
import type { ReactNode } from "react";

import { formatTime } from "@/shared/lib";
import { ArmIcon, StatusChip, TimerBadge } from "@/shared/ui";

import type { IncidentListItem } from "../model/types";
import styles from "./IncidentRow.module.css";

/* Ячейки строки ленты (ДДС_image4): время с секундами-индексом, тип с тултипом кода, адрес, статус службы. */

const ADDED_STATUS = "added";
const SECONDS_SEPARATOR_INDEX = 5;
const ROW_ICON_WIDTH = 32;
const ROW_ICON_HEIGHT = 31;

type TextCellProps = {
  modifier?: "center" | "operator";
  children: ReactNode;
};

export function TextCell({ modifier, children }: TextCellProps) {
  const className = [styles["incident-row__cell"], modifier ? styles[`incident-row__cell--${modifier}`] : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={className} role="cell">
      {children}
    </span>
  );
}

export function AddressCell({ item }: { item: IncidentListItem }) {
  return (
    <span
      className={[styles["incident-row__cell"], styles["incident-row__cell--address"]].join(" ")}
      role="cell"
    >
      <span className={styles["incident-row__address-text"]} title={item.address}>
        {item.address}
      </span>
      {item.serviceStatus.code === ADDED_STATUS ? (
        <ArmIcon name="service-status" width={ROW_ICON_WIDTH} height={ROW_ICON_HEIGHT} label="Добавлена" />
      ) : null}
    </span>
  );
}

export function TimeCell({ iso }: { iso: string }) {
  const time = formatTime(iso);
  return (
    <span
      className={[styles["incident-row__cell"], styles["incident-row__cell--time"]].join(" ")}
      role="cell"
    >
      {time.slice(0, SECONDS_SEPARATOR_INDEX)}:<sup>{time.slice(SECONDS_SEPARATOR_INDEX + 1)}</sup>
    </span>
  );
}

export function ServiceStatusCell({ item }: { item: IncidentListItem }) {
  const isAdded = item.serviceStatus.code === ADDED_STATUS;
  return (
    <span
      className={[styles["incident-row__cell"], styles["incident-row__cell--status"]].join(" ")}
      role="cell"
    >
      {isAdded ? (
        item.serviceStatus.title
      ) : (
        <StatusChip label={item.serviceStatus.title} tone={item.serviceStatus.tone} onDark />
      )}
      {item.smsCount > 0 ? (
        <span
          className={styles["incident-row__sms"]}
          title={`Новые СМС: ${item.smsCount}`}
          aria-label={`Новые СМС: ${item.smsCount}`}
        >
          <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true">
            <path d="M0 0h14v10H0z M0 0l7 5.5L14 0" />
          </svg>
          {item.smsCount}
        </span>
      ) : null}
    </span>
  );
}

export function TypeCell({ item, onOpen }: { item: IncidentListItem; onOpen?: () => void }) {
  const isViolation = item.state === "violation";
  return (
    <span
      className={[styles["incident-row__cell"], styles["incident-row__cell--type"]].join(" ")}
      role="cell"
    >
      {isViolation ? (
        <span
          className={styles["incident-row__violation-marker"]}
          role="img"
          aria-label="Нарушение: карточка не открыта за 30 сек"
        />
      ) : null}
      {item.reactionTimer ? (
        <span className={styles["incident-row__timer"]}>
          <TimerBadge value={item.reactionTimer} exceeded={isViolation} />
        </span>
      ) : null}
      <Link
        href={item.href}
        className={styles["incident-row__type-link"]}
        aria-describedby={`type-code-${item.id}`}
        title={`${item.typeName} (${item.typeCode})`}
        onClick={onOpen}
      >
        {item.typeName}
      </Link>
      <span className={styles["incident-row__tooltip"]} id={`type-code-${item.id}`} role="tooltip">
        {item.typeCode}
      </span>
    </span>
  );
}
