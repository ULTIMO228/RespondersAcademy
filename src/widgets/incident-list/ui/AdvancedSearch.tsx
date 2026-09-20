import type { ChangeEvent, FormEvent } from "react";

import { Button, Input, Select } from "@/shared/ui";

import { ADVANCED_SEARCH_ID } from "../config/journalOptions";
import type { AdvancedSearchField, AdvancedSearchValues } from "../lib/searchForm";
import type { AdvancedSearchOptions } from "../model/types";
import { MultiChipField } from "./MultiChipField";
import { SignTree } from "./SignTree";
import styles from "./AdvancedSearch.module.css";

type AdvancedSearchProps = {
  /** null — справочники ещё загружаются. */
  options: AdvancedSearchOptions | null;
  values: AdvancedSearchValues;
  onChange: <TField extends AdvancedSearchField>(field: TField, value: AdvancedSearchValues[TField]) => void;
  /** «найти» — применить форму к выдаче. */
  onSubmit: () => void;
  /** «сбросить» — очистить форму и выдачу. */
  onReset: () => void;
};

type TextField = Exclude<
  AdvancedSearchField,
  "signs" | "arms" | "services" | "channels" | "sources" | "cardStatuses"
>;

const SERVICES_COLLAPSED_LIMIT = 14;
const ARMS_COLLAPSED_LIMIT = 12;
/** Канал связи в модели карточки не хранится: мок-слой знает только «телефония (АОН)» (вызов с номером). */
const CHANNEL_NOTE = "В учебных данных канал известен только для вызовов с АОН — «телефония (АОН)»";

function toSelectOptions(values: string[]) {
  return values.map((value) => ({ value, label: value }));
}

/**
 * Форма «расширенный по параметрам» — 17 полей по памятке стр. 35–40 (источник п. 3.14), порядок сохранён.
 * Контролируемая: значения живут в ленте, «найти» применяет их к GET /api/mock/cards (AND между полями).
 */
export function AdvancedSearch({ options, values, onChange, onSubmit, onReset }: AdvancedSearchProps) {
  const wide = styles["advanced-search__field--wide"];
  const full = styles["advanced-search__field--full"];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  function bind(field: TextField) {
    return {
      name: field,
      value: values[field],
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        onChange(field, event.target.value),
    };
  }

  if (!options) {
    return (
      <form
        id={ADVANCED_SEARCH_ID}
        className={styles["advanced-search"]}
        aria-label="Расширенный поиск"
        aria-busy
      >
        <p className={styles["advanced-search__status"]} role="status">
          Загрузка справочников…
        </p>
      </form>
    );
  }

  const raions = options.districts.flatMap((district) => district.raions);
  return (
    <form
      id={ADVANCED_SEARCH_ID}
      className={styles["advanced-search"]}
      aria-label="Расширенный поиск"
      onSubmit={handleSubmit}
    >
      <Input label="Тип происшествия" {...bind("incidentType")} />
      <fieldset className={[styles["advanced-search__field"], wide].join(" ")}>
        <legend className={styles["advanced-search__label"]}>Признаки происшествия</legend>
        <SignTree
          nodes={options.signTree}
          selected={values.signs}
          onChange={(next) => onChange("signs", next)}
        />
        <p className={styles["advanced-search__note"]}>Поиск по 3-му уровню дерева признаков не работает</p>
      </fieldset>
      <MultiChipField
        label="АРМ"
        options={options.arms}
        selected={values.arms}
        onChange={(next) => onChange("arms", next)}
        collapsedLimit={ARMS_COLLAPSED_LIMIT}
      />
      <Input label="Адрес" {...bind("address")} />
      <Input label="По округу" hint="через запятую" placeholder="ЮАО, ЦАО" {...bind("okrugs")} />
      <Select
        label="По району"
        placeholder="выберите район"
        options={toSelectOptions(raions)}
        {...bind("raion")}
      />
      <Input label="По описательному адресу" {...bind("descriptiveAddress")} />
      <Input label="По региону" placeholder="Москва" {...bind("region")} />
      <MultiChipField
        label="По службе"
        options={options.services}
        selected={values.services}
        onChange={(next) => onChange("services", next)}
        collapsedLimit={SERVICES_COLLAPSED_LIMIT}
        className={full}
      />
      <Input label="По описанию" {...bind("description")} />
      <Input label="Заявитель (ФИО/АОН)" {...bind("applicant")} />
      <MultiChipField
        label="По каналу связи"
        options={options.channels}
        selected={values.channels}
        onChange={(next) => onChange("channels", next)}
        className={wide}
        note={CHANNEL_NOTE}
      />
      <MultiChipField
        label="По источнику происшествия (ВИС)"
        options={options.sources}
        selected={values.sources}
        onChange={(next) => onChange("sources", next)}
        className={wide}
      />
      <Input label="По оператору, работавшему с КП из ВИС" {...bind("operator")} />
      <Input label="Номер карточки" inputMode="numeric" {...bind("cardNumber")} />
      <MultiChipField
        label="Статус карточки"
        options={options.cardStatuses}
        selected={values.cardStatuses}
        onChange={(next) => onChange("cardStatuses", next)}
        className={wide}
      />
      <fieldset className={[styles["advanced-search__field"], wide].join(" ")}>
        <legend className={styles["advanced-search__label"]}>Период (дата/время заведения)</legend>
        <div className={styles["advanced-search__period"]}>
          <Input label="с" type="datetime-local" {...bind("periodFrom")} />
          <Input label="по" type="datetime-local" {...bind("periodTo")} />
        </div>
      </fieldset>
      <div className={styles["advanced-search__buttons"]}>
        <Button type="submit" variant="blue" size="sm" title="Найти (Enter)">
          найти
        </Button>
        <Button variant="secondary" size="sm" onClick={onReset}>
          сбросить
        </Button>
      </div>
    </form>
  );
}
