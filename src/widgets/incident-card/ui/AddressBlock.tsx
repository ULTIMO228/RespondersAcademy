"use client";

import { useState } from "react";

import { Button, Input } from "@/shared/ui";

import { formatAddress } from "../lib/addressDirectory";
import type { AddressFields } from "../lib/parseAddress";
import type { IncidentCardData } from "../model/types";
import { useAddressPicker } from "../model/useAddressPicker";
import { AddressMap } from "./AddressMap";
import { CardIcon } from "./CardIcon";

import styles from "./AddressBlock.module.css";

type AddressBlockProps = {
  address: IncidentCardData["address"];
  readOnly?: boolean;
  /** Входящая СМС-карточка: полигон местоположения (п. 14). */
  showPolygon?: boolean;
};

/* Поля блока «Адрес» — подписи дословно по спеке (spec/04-pages/02-arm-card.md п. 3). */
const ADDRESS_FIELDS: { key: keyof AddressFields; label: string; wide?: boolean }[] = [
  { key: "country", label: "Страна" },
  { key: "subject", label: "Субъект" },
  { key: "locality", label: "Нас. пункт" },
  { key: "okrug", label: "Округ" },
  { key: "raion", label: "Район" },
  { key: "street", label: "Улица", wide: true },
  { key: "house", label: "Дом" },
  { key: "building", label: "Корпус" },
  { key: "entrance", label: "Подъезд" },
  { key: "floor", label: "Этаж" },
  { key: "descriptive", label: "Описательный адрес", wide: true },
];

/** Блок «Адрес» (p23_Image108 — свёрнутый, p15_Image74 — поля): адресная строка, поля, локальная карта. */
export function AddressBlock({ address, readOnly = false, showPolygon = false }: AddressBlockProps) {
  const [isExpanded, setExpanded] = useState(false);
  const [isPicking, setPicking] = useState(false);
  const picker = useAddressPicker(address);
  const toggleLabel = isExpanded ? "Свернуть адрес и карту (Alt + A)" : "Развернуть адрес и карту (Alt + A)";

  return (
    <section className={styles.address} aria-label="Адрес">
      <div className={styles.address__summary}>
        <div className={styles.address__text}>
          <strong>{address.formal}</strong>
          {address.descriptive ? <span>{address.descriptive}</span> : null}
        </div>
        <button
          type="button"
          className={styles.address__toggle}
          aria-expanded={isExpanded}
          aria-label={toggleLabel}
          title={toggleLabel}
          onClick={() => setExpanded((expanded) => !expanded)}
        >
          <CardIcon name={address.geo ? "map" : "mapOff"} size={20} />
        </button>
      </div>
      {isExpanded ? (
        <div className={styles.address__details}>
          <div className={styles.address__line}>
            <Input
              label="Адрес:"
              value={picker.query}
              readOnly={readOnly}
              role="combobox"
              aria-expanded={picker.isSuggestOpen}
              aria-autocomplete="list"
              onChange={(event) => picker.changeQuery(event.target.value)}
              onFocus={() => picker.setSuggestOpen(!readOnly)}
              onBlur={() => picker.setSuggestOpen(false)}
            />
            {picker.isSuggestOpen && picker.suggestions.length > 0 ? (
              <ul className={styles.address__suggest} role="listbox" aria-label="Варианты адреса">
                {picker.suggestions.map((entry) => (
                  <li
                    key={entry.id}
                    role="option"
                    aria-selected={false}
                    className={styles.address__option}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      picker.select(entry);
                    }}
                  >
                    {formatAddress(entry)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className={styles.address__fields}>
            {ADDRESS_FIELDS.map((field) => (
              <Input
                key={field.key}
                label={`${field.label}:`}
                value={picker.fields[field.key]}
                readOnly
                className={field.wide ? styles["address__field--wide"] : undefined}
              />
            ))}
          </div>
          <div className={styles.address__map}>
            <Button
              size="sm"
              onClick={() => setPicking((picking) => !picking)}
              disabled={readOnly}
              aria-pressed={isPicking}
            >
              Указать на карте
            </Button>
            <AddressMap
              point={picker.point}
              isPicking={isPicking}
              showPolygon={showPolygon}
              onPick={(point) => {
                picker.pickOnMap(point);
                setPicking(false);
              }}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
