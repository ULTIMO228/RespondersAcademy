import Link from "next/link";

import { formatShortDate } from "@/shared/lib";
import { ArmIcon } from "@/shared/ui";

import type { IncidentListItem } from "../model/types";
import { IncidentLinkChain } from "./IncidentLinkChain";
import { AddressCell, ServiceStatusCell, TextCell, TimeCell, TypeCell } from "./IncidentRowCells";
import { IncidentRowTools } from "./IncidentRowTools";
import styles from "./IncidentRow.module.css";

export type IncidentRowActions = {
  onToggleExpand: (incidentId: string) => void;
  onToggleLinks: (incidentId: string) => void;
  onToggleImportant: (incidentId: string) => void;
  onPreview: (incidentId: string) => void;
  /** Переход в карточку (номер/тип): останавливает таймер 30 сек и фиксирует открытие. */
  onOpen?: (incidentId: string) => void;
  /** Будильник «напоминание». */
  onReminder?: (incidentId: string) => void;
};

type IncidentRowProps = {
  item: IncidentListItem;
  isExpanded: boolean;
  isLinksOpen: boolean;
  isImportant: boolean;
  actions: IncidentRowActions;
  /** У карточки есть активное напоминание. */
  hasReminder?: boolean;
  /** prefers-reduced-motion: новая строка без мигания — только статичный маркер. */
  isMotionReduced?: boolean;
};

const ROW_ICON_HEIGHT = 31;
const CLIPBOARD_ICON_WIDTH = 42;

/** Строка ленты «Список происшествий» + подстроки «Описание» и цепочки связей (ДДС_image3–5). */
export function IncidentRow(props: IncidentRowProps) {
  const { item, isExpanded, isLinksOpen, actions, isMotionReduced = false } = props;
  const handleOpen = () => actions.onOpen?.(item.id);
  const className = [
    styles["incident-row"],
    styles[`incident-row--${item.state}`],
    isMotionReduced ? styles["incident-row--static"] : "",
    props.isImportant ? styles["incident-row--important"] : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={className}
      role="rowgroup"
      data-state={item.state}
      data-motion={isMotionReduced ? "reduced" : "full"}
    >
      <div className={styles["incident-row__main"]} role="row">
        <IncidentRowTools {...props} />
        <TextCell modifier="operator">{item.operatorNumber}</TextCell>
        <TextCell modifier="center">{item.armNumber}</TextCell>
        <TextCell>
          <Link
            href={item.href}
            className={styles["incident-row__number-link"]}
            title={`Открыть карточку ${item.number}`}
            onClick={handleOpen}
          >
            {item.number}
          </Link>
        </TextCell>
        <TextCell modifier="center">{formatShortDate(item.createdAt)}</TextCell>
        <TimeCell iso={item.createdAt} />
        <TypeCell item={item} onOpen={handleOpen} />
        <TextCell modifier="center">{item.victims}</TextCell>
        <AddressCell item={item} />
        <ServiceStatusCell item={item} />
        <button
          type="button"
          className={styles["incident-row__preview"]}
          aria-label={`Предпросмотр карточки ${item.number}`}
          title="Предпросмотр карточки"
          onClick={() => actions.onPreview(item.id)}
        >
          <ArmIcon name="clipboard" width={CLIPBOARD_ICON_WIDTH} height={ROW_ICON_HEIGHT} />
        </button>
      </div>
      {isExpanded && item.description ? (
        <div className={styles["incident-row__description"]} role="row">
          <span className={styles["incident-row__description-label"]}>Описание:</span>
          <span className={styles["incident-row__description-meta"]}>{item.description.meta}</span>
          <span className={styles["incident-row__description-text"]} title={item.description.text}>
            {item.description.text}
          </span>
        </div>
      ) : null}
      {isLinksOpen && item.links.length > 0 ? <IncidentLinkChain links={item.links} /> : null}
    </div>
  );
}
