import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { EMPTY_SEARCH_VALUES, toSearchFilters } from "../lib/searchForm";
import type { AdvancedSearchValues } from "../lib/searchForm";
import type { AdvancedSearchOptions } from "../model/types";
import { AdvancedSearch } from "./AdvancedSearch";

/** 17 полей по памятке стр. 35–40 — дословно и в этом порядке. */
const ADVANCED_SEARCH_LABELS = [
  "Тип происшествия",
  "Признаки происшествия",
  "АРМ",
  "Адрес",
  "По округу",
  "По району",
  "По описательному адресу",
  "По региону",
  "По службе",
  "По описанию",
  "Заявитель (ФИО/АОН)",
  "По каналу связи",
  "По источнику происшествия (ВИС)",
  "По оператору, работавшему с КП из ВИС",
  "Номер карточки",
  "Статус карточки",
  "Период (дата/время заведения)",
];

const OPTIONS: AdvancedSearchOptions = {
  arms: [
    { value: "1", label: "АРМ 001" },
    { value: "2", label: "АРМ 002" },
  ],
  services: [
    { value: "svc-101", label: "Служба 101" },
    { value: "svc-102", label: "Служба 102" },
  ],
  channels: [{ value: "МТС", label: "МТС" }],
  sources: [{ value: "Служба 112", label: "Служба 112" }],
  cardStatuses: [{ value: "registered", label: "Зарегистрирована" }],
  districts: [{ okrug: "ЮАО", raions: ["Чертаново Южное"] }],
  signTree: [
    {
      label: "на улице",
      children: [{ label: "мусор", children: [{ label: "открытое пламя", children: [] }] }],
    },
  ],
};

function Harness({ onSubmit = vi.fn() }: { onSubmit?: (values: AdvancedSearchValues) => void }) {
  const [values, setValues] = useState(EMPTY_SEARCH_VALUES);
  return (
    <AdvancedSearch
      options={OPTIONS}
      values={values}
      onChange={(field, value) => setValues((current) => ({ ...current, [field]: value }))}
      onSubmit={() => onSubmit(values)}
      onReset={() => setValues(EMPTY_SEARCH_VALUES)}
    />
  );
}

describe("AdvancedSearch (T2.2-12)", () => {
  it("содержит все 17 подписей полей в порядке памятки; пометка об ограничении 3-го уровня", () => {
    const { container } = render(<Harness />);
    const labels = [
      ...container.querySelectorAll("form > * > label:first-child, form > fieldset > legend"),
    ].map((element) => element.textContent);
    expect(labels).toEqual(ADVANCED_SEARCH_LABELS);
    expect(screen.getByText("Поиск по 3-му уровню дерева признаков не работает")).toBeInTheDocument();
  });

  it("мультиселекты — чипы с множественным выбором; «найти» отдаёт выбранные значения", () => {
    const handleSubmit = vi.fn();
    render(<Harness onSubmit={handleSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Служба 101" }));
    fireEvent.click(screen.getByRole("button", { name: "Служба 102" }));
    fireEvent.click(screen.getByRole("button", { name: "АРМ 002" }));
    expect(screen.getByRole("button", { name: "Служба 101" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Служба 102" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "найти" }));
    expect(toSearchFilters(handleSubmit.mock.calls[0][0])).toEqual({
      services: ["svc-101", "svc-102"],
      arms: ["2"],
    });
  });

  it("дерево признаков: 1–2-й уровень выбираются, 3-й — только с пометкой ограничения", () => {
    const handleSubmit = vi.fn();
    render(<Harness onSubmit={handleSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "на улице" }));
    fireEvent.click(screen.getByRole("button", { name: "Развернуть: на улице" }));
    fireEvent.click(screen.getByRole("button", { name: "мусор" }));
    fireEvent.click(screen.getByRole("button", { name: "Развернуть: мусор" }));
    const thirdLevel = screen.getByText("открытое пламя");
    expect(thirdLevel).toHaveAttribute("title", "Поиск по 3-му уровню не работает");
    expect(screen.queryByRole("button", { name: "открытое пламя" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "найти" }));
    expect(handleSubmit.mock.calls[0][0].signs).toEqual(["на улице", "мусор"]);
  });

  it("«сбросить» очищает поля и чипы", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Вавилова" } });
    fireEvent.click(screen.getByRole("button", { name: "Зарегистрирована" }));
    fireEvent.click(screen.getByRole("button", { name: "сбросить" }));
    expect(screen.getByLabelText("Адрес")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Зарегистрирована" })).toHaveAttribute("aria-pressed", "false");
  });

  it("канал связи помечен ограничением мок-данных; без справочников — состояние загрузки", () => {
    const { rerender } = render(<Harness />);
    expect(screen.getByText(/канал известен только для вызовов с АОН/)).toBeInTheDocument();
    rerender(
      <AdvancedSearch
        options={null}
        values={EMPTY_SEARCH_VALUES}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Загрузка справочников…");
  });
});
