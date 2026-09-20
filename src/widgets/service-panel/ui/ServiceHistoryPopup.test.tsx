import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { reference } from "@/shared/api";

import { ServiceHistoryPopup } from "./ServiceHistoryPopup";

describe("Попап истории службы: пустое состояние и длинные данные (T5.2-05, T5.2-07)", () => {
  it("служба без событий — «Статусов службы пока нет», а не пустое окно", () => {
    render(
      <ServiceHistoryPopup
        title="Центр экологического мониторинга"
        events={[]}
        serviceStatuses={reference.serviceStatuses}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Статусов службы пока нет")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Закрыть историю (Esc)" })).toBeInTheDocument();
  });

  it("длинные ФИО и комментарий не теряются: ФИО обрезается, полный текст — в подсказке", () => {
    const actor = "Константинопольская-Преображенская А. В.";
    const comment =
      "Наряд принят, бригада выехала со станции, ориентировочное время прибытия 12 минут, " +
      "связь с заявителем поддерживается диспетчером подстанции";
    render(
      <ServiceHistoryPopup
        title="Скорая медицинская помощь"
        events={[{ at: "2026-09-17T11:14:04+03:00", status: "accepted", comment, actor }]}
        serviceStatuses={reference.serviceStatuses}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(actor)).toHaveAttribute("title", actor);
    expect(screen.getByText(comment)).toBeInTheDocument();
  });
});
