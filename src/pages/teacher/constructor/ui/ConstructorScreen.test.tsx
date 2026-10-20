import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createEmptyGraph } from "@/entities/scenario-flow";
import { createMemoryStorage } from "@/shared/lib";

import { buildFlowDictionaries } from "../lib/buildDictionaries";
import { FLOW_DRAFT_STORAGE_KEY } from "../model/useFlowEditor";
import { ConstructorScreen } from "./ConstructorScreen";

const dictionaries = buildFlowDictionaries();
const now = () => new Date("2026-10-19T07:42:00Z");

function setup(storage = createMemoryStorage()) {
  render(<ConstructorScreen dictionaries={dictionaries} storage={storage} now={now} seed={() => 1} />);
  return storage;
}

const steps = () => screen.getAllByRole("button", { name: /^Шаг \d+, / });
const library = () => screen.getByRole("complementary", { name: "Библиотека блоков" });
const panel = () => screen.getByRole("region", { name: "Проверка и история" });

describe("ConstructorScreen — прототип конструктора", () => {
  it("открывает пример по билету 4.1 без ошибок проверки", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Пожар в жилом доме: газ (билет 4.1)",
    );
    expect(steps()).toHaveLength(14);
    expect(within(panel()).getByText(/Ошибок нет\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Опубликовать/ })).toBeDisabled();
  });

  it("добавляет блок из библиотеки, показывает ошибку недостижимости и отменяет добавление", () => {
    setup();
    fireEvent.click(within(library()).getByRole("button", { name: /^Вводная/ }));
    expect(steps()).toHaveLength(15);
    expect(within(panel()).getByText(/блок недостижим/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Вводная" })).toBeInTheDocument(); // новый блок выделен, свойства открыты
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(steps()).toHaveLength(14);
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(steps()).toHaveLength(15);
  });

  it("добавление после выбранного шага встраивает блок в схему без ошибок", () => {
    setup();
    fireEvent.focus(screen.getByRole("button", { name: /^Шаг 2, Входящий вызов/ }));
    fireEvent.click(within(library()).getByRole("button", { name: /^Реплика заявителя/ }));
    expect(steps()).toHaveLength(15);
    // Новая реплика пустая — обязательный текст не заполнен (E07), но связи целы.
    expect(within(panel()).getByText(/не заполнено поле «Текст реплики»/)).toBeInTheDocument();
    expect(within(panel()).queryByText(/недостижим/)).not.toBeInTheDocument();
  });

  it("меняет настройки выбранного блока: изменение видно на схеме и в истории", () => {
    setup();
    fireEvent.focus(screen.getByRole("button", { name: /Оповестить: Служба 102/ }));
    const deadline = screen.getByLabelText("Срок выполнения, секунд");
    fireEvent.change(deadline, { target: { value: "240" } });
    fireEvent.blur(deadline);
    expect(screen.getByRole("button", { name: /Оповестить: Служба 102 · срок 240 с/ })).toBeInTheDocument();
    // Предупреждение W03 — и у поля в свойствах, и в панели «Проверка».
    expect(screen.getAllByText(/больше норматива отработки 180 с/).length).toBeGreaterThanOrEqual(2);
    fireEvent.click(within(panel()).getByRole("tab", { name: "История изменений" }));
    expect(within(panel()).getByText(/Изменены настройки «Действие»/)).toBeInTheDocument();
  });

  it("удаляет блок клавишей Delete и возвращает его из сообщения «Вернуть»", () => {
    setup();
    const hint = screen.getByRole("button", { name: /Подсказка:/ });
    fireEvent.focus(hint);
    fireEvent.keyDown(hint, { key: "Delete" });
    expect(steps()).toHaveLength(13);
    expect(screen.getByText("Шаг «Подсказка» удалён")).toBeInTheDocument();
    expect(within(panel()).getAllByText(/не указан следующий шаг для «Нет»/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Вернуть" }));
    expect(steps()).toHaveLength(14);
  });

  it("соединяет блоки через «Следующий шаг» и удаляет связь", () => {
    setup();
    fireEvent.focus(screen.getByRole("button", { name: /^Шаг \d+, Условие/ }));
    const yes = screen.getByLabelText("Да");
    const options = [...(yes as HTMLSelectElement).options];
    const end = options.find((option) => option.textContent?.includes("Завершение"))!;
    fireEvent.change(yes, { target: { value: end.value } });
    expect(
      screen.getByRole("button", { name: /^Шаг \d+, Условие.*выход «Да» ведёт к шагу/ }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Да"), { target: { value: "" } });
    expect(within(panel()).getByText(/не указан следующий шаг для «Да»/)).toBeInTheDocument();
  });

  it("«Проверить» и «Запустить тест» на пустом сценарии: тест не стартует, ошибки в панели", () => {
    setup();
    fireEvent.click(screen.getByText("Ещё"));
    fireEvent.click(screen.getByRole("button", { name: "Новый пустой сценарий" }));
    fireEvent.click(screen.getByRole("button", { name: /Проверить/ }));
    expect(within(panel()).getByText(/не указан следующий шаг для «Следующий шаг»/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Запустить тест/ }));
    expect(screen.queryByRole("complementary", { name: "Пробный прогон" })).not.toBeInTheDocument();
    expect(screen.getByText(/Запустить тест пока нельзя/)).toBeInTheDocument();
  });

  it("пробный прогон: реплики, действия автора, итог по правилам оценки", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Запустить тест/ }));
    const run = screen.getByRole("complementary", { name: "Пробный прогон" });
    expect(within(run).getByText(/Горит балкон на тринадцатом этаже/)).toBeInTheDocument();
    expect(within(run).getByText(/Сейчас ждёт:/)).toHaveTextContent("Уточнить адрес");

    const record = (field: string, value: string) => {
      fireEvent.change(within(run).getByLabelText("Указать значение поля"), { target: { value: field } });
      fireEvent.change(within(run).getByLabelText("Значение"), { target: { value } });
      fireEvent.click(within(run).getAllByRole("button", { name: "Записать" })[0]);
    };
    record("addressRefined", "ул. Грина, 11");
    record("floors", "14");
    record("gas", "да");
    for (const service of ["svc-104", "svc-101", "svc-102"]) {
      fireEvent.change(within(run).getByLabelText("Оповестить службу"), { target: { value: service } });
      fireEvent.click(within(run).getByRole("button", { name: "Оповестить" }));
    }
    const result = within(run).getByRole("region", { name: "Итог прогона" });
    expect(result).toHaveTextContent("100");
    expect(result).toHaveTextContent("Сдано");
    // Схема в прогоне только для просмотра: удалять нельзя.
    expect(screen.queryByRole("button", { name: /Добавить шаг/ })).not.toBeInTheDocument();
    fireEvent.click(within(run).getByRole("button", { name: "Вернуться к редактированию" }));
    expect(screen.getByRole("complementary", { name: "Свойства" })).toBeInTheDocument();
  });

  it("досрочное завершение прогона — не сдано, с перечнем невыполненного", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Запустить тест/ }));
    const run = screen.getByRole("complementary", { name: "Пробный прогон" });
    fireEvent.click(within(run).getByRole("button", { name: "Завершить прохождение" }));
    const result = within(run).getByRole("region", { name: "Итог прогона" });
    expect(result).toHaveTextContent("Не сдано");
    expect(result).toHaveTextContent(/Уточнить адрес: не выполнено/);
  });

  it("сохраняет черновик в браузере и восстанавливает его при следующем открытии", () => {
    const storage = setup();
    fireEvent.click(screen.getByRole("button", { name: /Сохранить/ }));
    expect(storage.get(FLOW_DRAFT_STORAGE_KEY)).toContain("Пожар в жилом доме");
    expect(screen.getByText(/Сохранено в браузере 10:42/)).toBeInTheDocument();
  });

  it("после правки «Сохранить» сразу даёт «Сохранено» (регрессия: статус перезаписывался «есть изменения»)", () => {
    const storage = setup();
    fireEvent.focus(screen.getByRole("button", { name: /^Шаг \d+, Условие/ }));
    const title = screen.getByLabelText("Название шага");
    fireEvent.change(title, { target: { value: "Газ в доме?" } });
    fireEvent.keyDown(title, { key: "Enter" });
    expect(screen.getByText("Есть несохранённые изменения")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Сохранить/ }));
    expect(screen.getByText(/Сохранено в браузере 10:42/)).toBeInTheDocument();
    expect(screen.queryByText("Есть несохранённые изменения")).not.toBeInTheDocument();
    expect(storage.get(FLOW_DRAFT_STORAGE_KEY)).toContain("Газ в доме?");
  });

  it("подхватывает сохранённый черновик", async () => {
    const stored = createMemoryStorage({
      [FLOW_DRAFT_STORAGE_KEY]: JSON.stringify(createEmptyGraph("Мой черновик", "dds")),
    });
    await act(async () => {
      setup(stored);
    });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Мой черновик");
    expect(screen.getByText(/черновик восстановлен/)).toBeInTheDocument();
  });

  it("вид «Список шагов» показывает ветки текстом и выделяет шаг", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Список/ }));
    const outline = screen.getByRole("region", { name: "Список шагов" });
    expect(within(outline).getByText("Если «Да»:")).toBeInTheDocument();
    expect(within(outline).getAllByText(/→ к шагу/).length).toBeGreaterThan(0);
    fireEvent.click(within(outline).getByRole("button", { name: /Шаг 2 Входящий вызов/ }));
    expect(screen.getByRole("heading", { name: "Входящий вызов" })).toBeInTheDocument();
  });

  it("окно «Клавиши» открывается кнопкой и закрывается Esc", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Клавиши" }));
    const dialog = screen.getByRole("dialog", { name: "Клавиши" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Клавиши" })).not.toBeInTheDocument();
  });
});
