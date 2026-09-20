import { ArmIcon } from "@/shared/ui";

import type { IncidentListItem } from "../model/types";
import type { IncidentRowActions } from "./IncidentRow";
import styles from "./IncidentRow.module.css";

const ICON_WIDTH = 32;
const ICON_HEIGHT = 31;

type IncidentRowToolsProps = {
  item: IncidentListItem;
  isExpanded: boolean;
  isLinksOpen: boolean;
  isImportant: boolean;
  actions: IncidentRowActions;
  hasReminder?: boolean;
};

function toCellClass(...modifiers: Array<string | false>): string {
  return [
    styles["incident-row__tool"],
    ...modifiers.filter(Boolean).map((name) => styles[name as string]),
  ].join(" ");
}

/** Пять ячеек-иконок слева в строке (ДДС_image4): развернуть · связи · закладка · ЧС/важное · напоминание. */
export function IncidentRowTools({
  item,
  isExpanded,
  isLinksOpen,
  isImportant,
  actions,
  hasReminder = false,
}: IncidentRowToolsProps) {
  const linkedCount = Math.max(0, item.links.length - 1);
  const emergencyClass = item.emergencyMark ? "incident-row__tool--chs" : false;
  const importantClass = isImportant && !item.emergencyMark ? "incident-row__tool--important" : false;
  const importantTitle = item.emergencyMark
    ? `${item.emergencyMark} — важное происшествие`
    : "Важное происшествие (Alt + I)";

  return (
    <>
      <button
        type="button"
        className={toCellClass(!isExpanded && "incident-row__tool--collapsed")}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? "Свернуть описание" : "Развернуть описание"}
        title={isExpanded ? "Свернуть" : "Развернуть"}
        onClick={() => actions.onToggleExpand(item.id)}
      >
        <ArmIcon name="row-expand" width={ICON_WIDTH} height={ICON_HEIGHT} />
      </button>
      {linkedCount > 0 ? (
        <button
          type="button"
          className={toCellClass("incident-row__tool--links")}
          aria-expanded={isLinksOpen}
          aria-label={`Связи: ${linkedCount} — показать цепочку связей`}
          title="Цепочка связей"
          onClick={() => actions.onToggleLinks(item.id)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            aria-hidden="true"
            className={styles["incident-row__link-icon"]}
          >
            <path d="M5.5 8.5l3-3M6 3.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M8 10.5l-1 1A2.5 2.5 0 013.5 8l1-1" />
          </svg>
          <span className={styles["incident-row__links-count"]}>{linkedCount}</span>
        </button>
      ) : (
        <span className={toCellClass()} />
      )}
      <button type="button" className={toCellClass()} aria-label="Закладка" title="Закладка">
        <ArmIcon name="row-bookmark" width={ICON_WIDTH} height={ICON_HEIGHT} />
      </button>
      <button
        type="button"
        className={toCellClass(emergencyClass, importantClass)}
        aria-pressed={isImportant}
        aria-label={importantTitle}
        title={importantTitle}
        onClick={() => actions.onToggleImportant(item.id)}
      >
        <ArmIcon name="row-important" width={ICON_WIDTH} height={ICON_HEIGHT} />
      </button>
      <button
        type="button"
        className={toCellClass(hasReminder && "incident-row__tool--reminder")}
        aria-pressed={hasReminder}
        aria-label={hasReminder ? "Напоминание установлено" : "Напоминание"}
        title="Напоминание (Alt + R)"
        onClick={() => actions.onReminder?.(item.id)}
      >
        <ArmIcon name="row-reminder" width={ICON_WIDTH} height={ICON_HEIGHT} />
      </button>
    </>
  );
}
