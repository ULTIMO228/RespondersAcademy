"use client";

import { useState } from "react";
import type { KeyboardEvent } from "react";

import type { CardDraftAddress, Street } from "@/shared/api";
import { Input } from "@/shared/ui";

import { pickStreet, typeStreet, withFields } from "../model/address";
import { useStreetSuggest } from "../model/useStreetSuggest";
import type { StreetSearch } from "../model/useStreetSuggest";

import styles from "./Operator112AddressField.module.css";

type Operator112AddressFieldProps = {
  value: CardDraftAddress;
  onChange: (next: CardDraftAddress) => void;
  disabled?: boolean;
  /** Сообщение сервера при передаче (400 «Заполните адресный блок»): показывается у блока, введённое сохраняется. */
  error?: string;
  search?: StreetSearch;
};

const SOURCE_TITLES = { directory: "из справочника", manual: "вручную" } as const;

function streetLabel(street: Street): string {
  return [street.name, street.raion, street.okrug].filter(Boolean).join(" · ");
}

/** Блок «Адрес» режима 112: улица с подсказкой справочника (от 3 символов), дом, округ, район, описательный адрес. */
export function Operator112AddressField({
  value,
  onChange,
  disabled = false,
  error,
  search,
}: Operator112AddressFieldProps) {
  const [picked, setPicked] = useState<string | null>(value.source === "directory" ? value.street : null);
  const [isOpen, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const suggest = useStreetSuggest(value.street, isOpen && !disabled, search);
  const streets = suggest.status === "ready" ? suggest.streets : [];

  const choose = (street: Street) => {
    setPicked(street.name);
    onChange(pickStreet(value, street));
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && streets.length) {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, streets.length - 1));
    } else if (event.key === "ArrowUp" && streets.length) {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && active >= 0 && streets[active]) {
      event.preventDefault();
      choose(streets[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <fieldset className={styles.address} disabled={disabled} aria-label="Адрес">
      <div className={styles.address__street}>
        <Input
          label="Улица"
          value={value.street}
          role="combobox"
          aria-expanded={isOpen && streets.length > 0}
          aria-autocomplete="list"
          aria-controls="operator112-street-suggest"
          autoComplete="off"
          onChange={(event) => {
            setOpen(true);
            setActive(-1);
            onChange(typeStreet(value, event.target.value, picked));
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          hint={<span data-testid="address-source">Источник: {SOURCE_TITLES[value.source]}</span>}
        />
        {isOpen && streets.length > 0 ? (
          <ul
            id="operator112-street-suggest"
            className={styles.address__suggest}
            role="listbox"
            aria-label="Улицы справочника"
          >
            {streets.map((street, index) => (
              <li key={street.id} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  className={styles.address__option}
                  data-active={index === active}
                  // mousedown, а не click: blur поля закрыл бы список раньше клика.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(street);
                  }}
                >
                  {streetLabel(street)}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {isOpen && suggest.status === "loading" ? (
          <span className={styles.address__status} role="status">
            Поиск по справочнику…
          </span>
        ) : null}
        {isOpen && suggest.status === "ready" && streets.length === 0 ? (
          <span className={styles.address__status}>В справочнике не найдено — можно ввести вручную</span>
        ) : null}
        {suggest.status === "error" ? (
          <span className={styles.address__status} role="alert">
            {suggest.message}
          </span>
        ) : null}
      </div>
      <Input
        label="Дом"
        value={value.house}
        onChange={(event) => onChange(withFields(value, { house: event.target.value }))}
      />
      <Input
        label="Округ"
        value={value.okrug}
        onChange={(event) => onChange(withFields(value, { okrug: event.target.value }))}
      />
      <Input
        label="Район"
        value={value.raion}
        onChange={(event) => onChange(withFields(value, { raion: event.target.value }))}
      />
      <Input
        className={styles.address__wide}
        label="Описательный адрес"
        value={value.descriptive}
        onChange={(event) => onChange(withFields(value, { descriptive: event.target.value }))}
      />
      {error ? (
        <p className={styles.address__error} role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
