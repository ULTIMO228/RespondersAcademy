"use client";

import { useId, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import type { CardDraftAddress, Street } from "@/shared/api";
import { Glyph } from "@/shared/ui";

import {
  DEFAULT_SUBJECT,
  clearAddress,
  isMoscow,
  MOSCOW_OKRUGS,
  pickStreet,
  typeStreet,
  withFields,
} from "../model/address";
import { useStreetSuggest } from "../model/useStreetSuggest";
import type { StreetSearch } from "../model/useStreetSuggest";

import { MapWindow } from "./MapWindow";

import styles from "./Operator112AddressField.module.css";

type Operator112AddressFieldProps = {
  value: CardDraftAddress;
  onChange: (next: CardDraftAddress) => void;
  disabled?: boolean;
  /** Сообщение сервера при передаче (400 «Заполните адресный блок»): показывается у блока, введённое сохраняется. */
  error?: string;
  search?: StreetSearch;
};

function streetLabel(street: Street): string {
  return [street.name, street.raion, street.okrug].filter(Boolean).join(" · ");
}

type FieldProps = {
  label: string;
  className?: string;
  children: (id: string) => ReactNode;
  /** Выпадающее под полем (подсказки улиц). */
  popup?: ReactNode;
};

/** Поле блока адреса ПОВ-112: мелкая подпись «Улица:» над полем с нижней линией. */
function Field({ label, className, children, popup }: FieldProps) {
  const id = useId();
  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <label className={styles.field__label} htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {popup}
    </div>
  );
}

type TextFieldProps = {
  label: string;
  className?: string;
  value: string | undefined;
  onChange: (text: string) => void;
};

/** Обычное текстовое поле блока адреса. */
function TextField({ label, className, value, onChange }: TextFieldProps) {
  return (
    <Field label={label} className={className}>
      {(id) => (
        <input
          id={id}
          className={styles.field__input}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

/**
 * Блок «Адрес:» карточки ПОВ-112 (КАРТОЧКА_image1; спека 009, FR-014): строка адреса с «×», поля Страна · Субъект ·
 * Населённый пункт · Объект · Округ · Район · Улица · Дом/Вл. · Корпус · Стр/соор · Квартира/офис · Подъезд · Этаж · Код ·
 * Описательный адрес, «очистить адрес» и окно карты «С112 — карта». Умолчания — Россия / Москва / Москва; для Москвы улица
 * подсказывается справочником (от 3 символов), для другого субъекта — ручной ввод (FR-014, FR-023).
 */
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
  const [isMapOpen, setMapOpen] = useState(false);
  const moscow = isMoscow(value);
  const suggest = useStreetSuggest(value.street, isOpen && !disabled && moscow, search);
  // Каскад округ → район → улица: заполненные округ/район сужают подсказки справочника.
  const matches = (filter: string, own: string | undefined) =>
    !filter.trim() || !own || own.trim().toLowerCase() === filter.trim().toLowerCase();
  const streets =
    suggest.status === "ready"
      ? suggest.streets.filter(
          (street) => matches(value.okrug, street.okrug) && matches(value.raion, street.raion),
        )
      : [];
  const set = (patch: Partial<CardDraftAddress>) => onChange(withFields(value, patch));
  const listId = useId();

  const choose = (street: Street) => {
    setPicked(street.name);
    onChange(pickStreet(value, street));
    setOpen(false);
    setActive(-1);
  };

  const suggestList =
    isOpen && streets.length > 0 ? (
      <ul id={listId} className={styles.address__suggest} role="listbox" aria-label="Улицы справочника">
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
    ) : null;

  const clear = () => {
    setPicked(null);
    onChange(clearAddress());
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
    <fieldset className={styles.address} disabled={disabled} aria-label="Адрес" data-source={value.source}>
      <div className={styles.address__head}>
        <span className={styles.field__label}>Адрес:</span>
        <button
          type="button"
          className={styles.address__map}
          aria-label="Указать на карте"
          onClick={() => setMapOpen(true)}
        >
          <Glyph name="map" size={18} />
        </button>
      </div>
      <div className={styles.address__line}>
        <span data-testid="address-formal">{value.formal || value.locality || DEFAULT_SUBJECT}</span>
        <button
          type="button"
          className={styles.address__clear}
          aria-label="Очистить строку адреса"
          onClick={clear}
        >
          <Glyph name="close" size={18} />
        </button>
      </div>

      <div className={styles.address__grid}>
        <TextField
          label="Страна:"
          className={styles["span-4"]}
          value={value.country}
          onChange={(country) => set({ country })}
        />
        <TextField
          label="Субъект:"
          className={styles["span-4"]}
          value={value.subject}
          onChange={(subject) => set({ subject })}
        />
        <TextField
          label="Населенный пункт:"
          className={styles["span-4"]}
          value={value.locality}
          onChange={(locality) => set({ locality })}
        />

        <TextField
          label="Объект:"
          className={styles["span-6"]}
          value={value.object}
          onChange={(object) => set({ object })}
        />
        <Field label="Округ:" className={styles["span-3"]}>
          {(id) =>
            isMoscow(value) ? (
              <select
                id={id}
                className={`${styles.field__input} ${styles.field__select}`}
                value={value.okrug}
                onChange={(event) => set({ okrug: event.target.value })}
              >
                <option value="" />
                {/* Значение не из списка (ввод до смены субъекта) не теряется. */}
                {value.okrug && !MOSCOW_OKRUGS.includes(value.okrug) ? (
                  <option value={value.okrug}>{value.okrug}</option>
                ) : null}
                {MOSCOW_OKRUGS.map((okrug) => (
                  <option key={okrug} value={okrug}>
                    {okrug}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                className={styles.field__input}
                value={value.okrug}
                onChange={(event) => set({ okrug: event.target.value })}
              />
            )
          }
        </Field>
        <Field label="Район:" className={styles["span-3"]}>
          {(id) => (
            <input
              id={id}
              className={styles.field__input}
              value={value.raion}
              onChange={(event) => set({ raion: event.target.value })}
            />
          )}
        </Field>

        <Field
          label="Улица:"
          className={[styles["span-6"], styles.address__street].join(" ")}
          popup={suggestList}
        >
          {(id) => (
            <input
              id={id}
              className={styles.field__input}
              value={value.street}
              role="combobox"
              aria-expanded={isOpen && streets.length > 0}
              aria-autocomplete="list"
              aria-controls={listId}
              autoComplete="off"
              onChange={(event) => {
                setOpen(true);
                setActive(-1);
                onChange(typeStreet(value, event.target.value, picked));
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={onKeyDown}
            />
          )}
        </Field>
        <Field label="Дом/Вл.:" className={styles["span-2"]}>
          {(id) => (
            <input
              id={id}
              className={styles.field__input}
              value={value.house}
              onChange={(event) => set({ house: event.target.value })}
            />
          )}
        </Field>
        <TextField
          label="Корпус:"
          className={styles["span-2"]}
          value={value.korpus}
          onChange={(korpus) => set({ korpus })}
        />
        <span className={styles["span-2"]} aria-hidden="true" />

        <TextField
          label="Стр/соор:"
          className={styles["span-2"]}
          value={value.building}
          onChange={(building) => set({ building })}
        />
        <TextField
          label="Квартира/офис:"
          className={styles["span-2"]}
          value={value.flat}
          onChange={(flat) => set({ flat })}
        />
        <TextField
          label="Подъезд:"
          className={styles["span-2"]}
          value={value.entrance}
          onChange={(entrance) => set({ entrance })}
        />
        <TextField
          label="Этаж:"
          className={styles["span-2"]}
          value={value.floor}
          onChange={(floor) => set({ floor })}
        />
        <TextField
          label="Код:"
          className={styles["span-2"]}
          value={value.code}
          onChange={(code) => set({ code })}
        />
        <span className={styles["span-2"]} aria-hidden="true" />

        <Field label="Описательный адрес:" className={styles["span-12"]}>
          {(id) => (
            <textarea
              id={id}
              className={[styles.field__input, styles.field__area].join(" ")}
              rows={2}
              value={value.descriptive}
              onChange={(event) => set({ descriptive: event.target.value })}
            />
          )}
        </Field>
      </div>

      {moscow && isOpen && suggest.status === "loading" ? (
        <span className={styles.address__status} role="status">
          Поиск по справочнику…
        </span>
      ) : null}
      {moscow && isOpen && suggest.status === "ready" && streets.length === 0 ? (
        <span className={styles.address__status}>В справочнике не найдено — можно ввести вручную</span>
      ) : null}
      {suggest.status === "error" ? (
        <span className={styles.address__status} role="alert">
          {suggest.message}
        </span>
      ) : null}
      {error ? (
        <p className={styles.address__error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.address__foot}>
        <button type="button" className={styles.address__reset} onClick={clear}>
          очистить адрес
        </button>
      </div>
      {isMapOpen ? (
        <MapWindow
          lat={value.lat}
          lon={value.lon}
          onClose={() => setMapOpen(false)}
          onApply={(point) => {
            set(point);
            setMapOpen(false);
          }}
        />
      ) : null}
    </fieldset>
  );
}
