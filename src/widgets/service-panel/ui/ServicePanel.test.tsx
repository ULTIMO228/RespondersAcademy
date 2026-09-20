import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { armCardFixtures, reference } from "@/shared/api";

import { ServicePanel } from "./ServicePanel";

const card = armCardFixtures.find((fixture) => fixture.id === "card-36814845");
if (!card) throw new Error("Нет фикстуры card-36814845");

function renderPanel(readOnly = false) {
  return render(
    <ServicePanel
      card={card!}
      services={reference.services}
      serviceStatuses={reference.serviceStatuses}
      ddsStatuses={reference.ddsStatuses}
      myServiceId="svc-zemp"
      mainServiceIds={["svc-101"]}
      readOnly={readOnly}
    />,
  );
}

describe("ServicePanel (T0.2-11)", () => {
  it("рендерит «Службы:» и плитки списка оповещения", () => {
    renderPanel();
    const panel = screen.getByRole("contentinfo", { name: "Службы" });
    expect(within(panel).getByText("Службы:")).toBeInTheDocument();
    expect(within(panel).getByText("Служба 101")).toBeInTheDocument();
    expect(within(panel).getByText("Мослифт")).toBeInTheDocument();
    expect(within(panel).getAllByText("11:14 Добавлена").length).toBeGreaterThan(1);
    expect(within(panel).getByText("11:14 Получена службой")).toBeInTheDocument();
  });

  it("основные службы имеют маркер двойного подчёркивания", () => {
    renderPanel();
    const mainName = screen.getByText("Служба 101");
    expect(mainName.className).toContain("tile__name--main");
    expect(mainName.closest("[data-main]")).toHaveAttribute("data-main", "true");
    expect(screen.getByText("Служба 104").className).not.toContain("tile__name--main");
  });

  it("конверт открывает синий попап истории, плитка активна, Esc закрывает", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "История службы" }));
    const popup = screen.getByRole("dialog", { name: /История: Центр экологического мониторинга/ });
    expect(within(popup).getByText("оп. 9999")).toBeInTheDocument();
    expect(within(popup).getByText(/17\.09\.2026 11:14:04 Добавлена/)).toBeInTheDocument();
    expect(screen.getByTitle("Центр экологического мониторинга и прогнозирования")).toHaveAttribute(
      "data-active",
      "true",
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("карандаш открывает форму статуса поверх затемнения; «Принята» попадает в плитку и историю", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Сменить статус (Alt + E)" }));
    expect(screen.getByTestId("status-overlay")).toBeInTheDocument();
    expect(screen.getByLabelText("Номер наряда")).toBeInTheDocument();
    expect(screen.getByLabelText("Комментарий")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Статус" }));
    fireEvent.click(screen.getByRole("option", { name: "Принята" }));
    fireEvent.change(screen.getByLabelText("Комментарий"), { target: { value: "Отправлен сантехник" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить статус (Enter)" }));
    expect(screen.queryByTestId("status-overlay")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "История службы" }));
    expect(screen.getByText("Отправлен сантехник")).toBeInTheDocument();
  });

  it("шеврон разворачивает второй ряд, ✕ ведёт в список", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Развернуть доп. службы" }));
    expect(screen.getByRole("button", { name: "Свернуть доп. службы" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("link", { name: "Закрыть карточку" })).toHaveAttribute("href", "/arm");
    expect(screen.getByRole("button", { name: "Чат, непрочитанных: 1" })).toBeInTheDocument();
  });

  it("readOnly: нет смены статуса, чата и закрытия", () => {
    renderPanel(true);
    expect(screen.queryByRole("button", { name: "Сменить статус (Alt + E)" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Закрыть карточку" })).toBeNull();
    expect(screen.getByRole("button", { name: "История службы" })).toBeInTheDocument();
  });
});
