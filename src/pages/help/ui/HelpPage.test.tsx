import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HOTKEY_SECTIONS } from "../config/hotkeys";
import { HELP_MATERIALS } from "../config/materials";
import { HelpMaterials } from "./HelpMaterials";
import { HotkeysReference } from "./HotkeysReference";

describe("HotkeysReference", () => {
  it("содержит все 5 таблиц спеки с полным набором комбинаций", () => {
    const { container } = render(<HotkeysReference />);
    expect(container.querySelectorAll("table")).toHaveLength(5);
    const rowCount = HOTKEY_SECTIONS.reduce((sum, section) => sum + section.rows.length, 0);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(rowCount);
    expect(rowCount).toBe(33);
    for (const title of [
      "Общие:",
      "Переход к блокам карточки (режим создания):",
      "Мгновенные действия (режим создания):",
      "Режим просмотра:",
      "Окно добавления связи:",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });

  it("присутствуют «Shift+F2», «Alt+Q», «Alt+Ctrl+1…n»", () => {
    render(<HotkeysReference />);
    expect(screen.getByText("Shift+F2")).toBeInTheDocument();
    expect(screen.getByText("Alt+Q")).toBeInTheDocument();
    expect(screen.getByText("Alt+Ctrl+1…n")).toBeInTheDocument();
  });
});

/** Строки таблиц «Горячие клавиши АРМ-112» из спеки (п. 3.17) — для построчной сверки. */
function readSpecHotkeyRows(): [string, string][] {
  const spec = readFileSync(resolve(process.cwd(), "spec/000-фронт/04-pages/04-arm-progress.md"), "utf8");
  const section = spec.slice(spec.indexOf("### Методический материал"), spec.indexOf("## Критерии приёмки"));
  return section
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| Комбинация"))
    .map((line) => {
      const [keys, action] = line
        .split("|")
        .slice(1, 3)
        .map((cell) => cell.trim());
      return [keys, action];
    });
}

describe("HotkeysReference — сверка со спекой и пометки активности", () => {
  it("комбинации и действия дословно совпадают с 04-arm-progress.md", () => {
    const configRows = HOTKEY_SECTIONS.flatMap((section) =>
      section.rows.map((row): [string, string] => [row.keys, row.action]),
    );
    expect(configRows).toEqual(readSpecHotkeyRows());
  });

  it("общие и режим просмотра — активны; режим создания и окно связи — справочно (T2.3-19)", () => {
    const { container } = render(<HotkeysReference />);
    const activity = Object.fromEntries(
      [...container.querySelectorAll("section[data-activity]")].map((section) => [
        section.getAttribute("aria-labelledby"),
        section.getAttribute("data-activity"),
      ]),
    );
    expect(activity).toEqual({
      "hotkeys-common": "active",
      "hotkeys-create-blocks": "reference",
      "hotkeys-create-actions": "reference",
      "hotkeys-view": "active",
      "hotkeys-link-window": "reference",
    });
    expect(screen.getAllByText("В тренажёре активны")).toHaveLength(2);
    expect(screen.getAllByText("Справочно: в тренажёре неактивны")).toHaveLength(3);
    expect(screen.getByText(/у обучающегося не действует/)).toBeInTheDocument();
  });
});

describe("HelpMaterials", () => {
  it("поиск «памятка» оставляет только памятку; пустой результат — сообщение", () => {
    render(<HelpMaterials materials={HELP_MATERIALS} />);
    const search = screen.getByLabelText("Поиск по названию");
    fireEvent.change(search, { target: { value: "памятка" } });
    expect(screen.getByText("Памятка работы на АРМ-112")).toBeInTheDocument();
    expect(screen.queryByText("Инструкция по заведению карточки")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.change(search, { target: { value: "несуществующий" } });
    expect(screen.getByText("Материалы не найдены")).toBeInTheDocument();
  });

  it("только чтение: нет контролов редактирования, загрузки и удаления", () => {
    render(<HelpMaterials materials={HELP_MATERIALS} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Открыть" })[0]);
    for (const name of [/Изменить/, /Редактировать/, /Удалить/, /Загрузить/, /Сохранить/]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(within(screen.getByRole("dialog")).getByText(/только чтение/)).toBeInTheDocument();
  });

  it("список материалов, поиск по названию и вьювер-заглушка", () => {
    render(<HelpMaterials materials={HELP_MATERIALS} />);
    expect(screen.getByText("Памятка работы на АРМ-112")).toBeInTheDocument();
    expect(screen.getByText("Инструкция по заведению карточки")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перейти" })).toHaveAttribute("href", "#hotkeys");

    fireEvent.change(screen.getByLabelText("Поиск по названию"), { target: { value: "инструкция" } });
    expect(screen.queryByText("Памятка работы на АРМ-112")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Открыть" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("document", { name: "Просмотр документа" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
