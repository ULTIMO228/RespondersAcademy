"use client";

import { useId, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import type { CardDraftAddress, Street } from "@/shared/api";
import { Glyph } from "@/shared/ui";

import { EMPTY_ADDRESS, pickStreet, typeStreet, withFields } from "../model/address";
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

/** Субъект учебного набора: все адреса заданий — Москва (КАРТОЧКА_image1 показывает его заполненным). */
const SUBJECT = "Москва";
const FUTURE_FIELD = "Поле появится в следующем этапе тренажёра (спека 009, этап B)";

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

/** Поле расширенного адреса, которого ещё нет в контракте карточки: видно, как в АРМ, но неактивно (plan.md). */
function FutureField({ label, className }: { label: string; className?: string }) {
  return (
    <Field label={label} className={className}>
      {(id) => <input id={id} className={styles.field__input} disabled title={FUTURE_FIELD} />}
    </Field>
  );
}

/**
 * Блок «Адрес:» карточки ПОВ-112 (КАРТОЧКА_image1; спека 009, FR-014): строка адреса с «×», поля Страна · Субъект ·
 * Населённый пункт · Объект · Округ · Район · Улица · Дом/Вл. · Корпус · Стр/соор · Квартира/офис · Подъезд · Этаж · Код ·
 * Описательный адрес и «очистить адрес». Улица — с подсказкой справочника (от 3 символов).
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
  const suggest = useStreetSuggest(value.street, isOpen && !disabled, search);
  const streets = suggest.status === "ready" ? suggest.streets : [];
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
    onChange(EMPTY_ADDRESS);
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
          title="Окно карты — следующий этап тренажёра (спека 009, этап C)"
          disabled
        >
          <Glyph name="map" size={18} />
        </button>
      </div>
      <div className={styles.address__line}>
        <span data-testid="address-formal">{value.formal || SUBJECT}</span>
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
        <FutureField label="Страна:" className={styles["span-4"]} />
        <Field label="Субъект:" className={styles["span-4"]}>
          {(id) => <input id={id} className={styles.field__input} value={SUBJECT} readOnly />}
        </Field>
        <FutureField label="Населенный пункт:" className={styles["span-4"]} />

        <FutureField label="Объект:" className={styles["span-6"]} />
        <Field label="Округ:" className={styles["span-3"]}>
          {(id) => (
            <input
              id={id}
              className={styles.field__input}
              value={value.okrug}
              onChange={(event) => onChange(withFields(value, { okrug: event.target.value }))}
            />
          )}
        </Field>
        <Field label="Район:" className={styles["span-3"]}>
          {(id) => (
            <input
              id={id}
              className={styles.field__input}
              value={value.raion}
              onChange={(event) => onChange(withFields(value, { raion: event.target.value }))}
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
              onChange={(event) => onChange(withFields(value, { house: event.target.value }))}
            />
          )}
        </Field>
        <FutureField label="Корпус:" className={styles["span-2"]} />
        <span className={styles["span-2"]} aria-hidden="true" />

        <FutureField label="Стр/соор:" className={styles["span-2"]} />
        <FutureField label="Квартира/офис:" className={styles["span-2"]} />
        <FutureField label="Подъезд:" className={styles["span-2"]} />
        <FutureField label="Этаж:" className={styles["span-2"]} />
        <FutureField label="Код:" className={styles["span-2"]} />
        <span className={styles["span-2"]} aria-hidden="true" />

        <Field label="Описательный адрес:" className={styles["span-12"]}>
          {(id) => (
            <textarea
              id={id}
              className={[styles.field__input, styles.field__area].join(" ")}
              rows={2}
              value={value.descriptive}
              onChange={(event) => onChange(withFields(value, { descriptive: event.target.value }))}
            />
          )}
        </Field>
      </div>

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
    </fieldset>
  );
}
