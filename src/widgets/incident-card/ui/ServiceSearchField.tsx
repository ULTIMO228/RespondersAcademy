"use client";

import { useState } from "react";

import { filterServices } from "../model/useWorkLineForm";

import styles from "./AddWorkLineForm.module.css";

type ServiceSearchFieldProps = {
  serviceNames: string[];
  value: string;
  onSelect: (service: string) => void;
};

/** Поле «Служба» формы отработки: ввод фильтрует список служб, выбор — из вариантов (п. 3.13). */
export function ServiceSearchField({ serviceNames, value, onSelect }: ServiceSearchFieldProps) {
  const [query, setQuery] = useState(value);
  const [isOpen, setOpen] = useState(false);
  const options = filterServices(serviceNames, query);

  function select(service: string) {
    setQuery(service);
    setOpen(false);
    onSelect(service);
  }

  return (
    <div className={styles.form__search}>
      <input
        className={styles.form__field}
        aria-label="Служба"
        placeholder="служба"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          onSelect("");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {isOpen && options.length > 0 ? (
        <ul className={styles.form__options} role="listbox" aria-label="Службы">
          {options.map((name) => (
            <li
              key={name}
              role="option"
              aria-selected={name === value}
              className={styles.form__option}
              onMouseDown={(event) => {
                event.preventDefault();
                select(name);
              }}
            >
              {name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
