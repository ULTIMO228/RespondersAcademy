/* Панель служб в живом режиме (T2.3-10…T2.3-12): история и статусы управляются страницей. */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { armCardFixtures, reference } from "@/shared/api";

import type { ServiceHistory } from "../model/types";
import { ServicePanel } from "./ServicePanel";

const card = armCardFixtures.find((fixture) => fixture.id === "card-881412")!;

const history: ServiceHistory = {
  "svc-upr-chert": [
    { status: "added", at: "2026-08-20T11:59:43+03:00", actor: "оп. 14" },
    { status: "received", at: "2026-08-20T12:00:05+03:00", actor: "оп. 0" },
    { status: "accepted", at: "2026-08-20T12:00:30+03:00", actor: "оп. 0", comment: "Направлена бригада" },
  ],
  "svc-pref-uao": [{ status: "added", at: "2026-08-20T11:59:43+03:00", actor: "оп. 14" }],
};

function renderPanel(props: Partial<Parameters<typeof ServicePanel>[0]> = {}) {
  return render(
    <ServicePanel
      card={card}
      services={reference.services}
      serviceStatuses={reference.serviceStatuses}
      ddsStatuses={reference.ddsStatuses}
      myServiceId="svc-upr-chert"
      mainServiceIds={["svc-upr-chert"]}
      history={history}
      currentDdsStatus="accepted"
      onStatusSubmit={vi.fn(async () => undefined)}
      {...props}
    />,
  );
}

describe("ServicePanel — живой режим", () => {
  it("плитки из notificationList: двойное подчёркивание основной, последний статус; клик по моей службе — активна", () => {
    renderPanel();
    const tile = screen.getByTitle("Управа района Чертаново Южное");
    expect(within(tile).getByText("12:00 Принята")).toBeInTheDocument();
    expect(tile).toHaveAttribute("data-main", "true");
    expect(tile).toHaveAttribute("data-active", "false");
    fireEvent.click(within(tile).getByText("Упр. Чертаново Южное"));
    expect(tile).toHaveAttribute("data-active", "true");
  });

  it("попап истории — вся хронология в исходном порядке со «›» и комментариями; Esc закрывает", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "История службы" }));
    const popup = screen.getByRole("dialog", { name: /История: Управа района Чертаново Южное/ });
    const rows = within(popup)
      .getAllByRole("listitem")
      .map((row) => row.textContent);
    expect(rows).toEqual([
      "оп. 1420.08.2026 11:59:43 Добавлена",
      "оп. 020.08.2026 12:00:05 Получена службой",
      "оп. 020.08.2026 12:00:30 ПринятаНаправлена бригада",
    ]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("форма: переходы — от текущего статуса ДДС карточки; сохранение уходит в onStatusSubmit", async () => {
    const onStatusSubmit = vi.fn(async () => undefined);
    renderPanel({ onStatusSubmit });
    fireEvent.click(screen.getByRole("button", { name: "Сменить статус (Alt + E)" }));
    fireEvent.click(screen.getByRole("button", { name: "Статус" }));
    expect(screen.getByRole("option", { name: "Принята" })).toBeDisabled();
    fireEvent.click(screen.getByRole("option", { name: "Начало реагирования" }));
    fireEvent.change(screen.getByLabelText("Номер наряда"), { target: { value: "Н-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить статус (Enter)" }));
    await waitFor(() => expect(screen.queryByTestId("status-overlay")).toBeNull());
    expect(onStatusSubmit).toHaveBeenCalledWith({
      status: "responseStarted",
      dutyNumber: "Н-12",
      comment: "",
    });
  });

  it("ошибка сервера остаётся в форме; закрытая карточка — карандаша нет", async () => {
    const onStatusSubmit = vi.fn(async () => {
      throw new Error("Переход недопустим");
    });
    const view = renderPanel({ onStatusSubmit });
    fireEvent.click(screen.getByRole("button", { name: "Сменить статус (Alt + E)" }));
    fireEvent.click(screen.getByRole("button", { name: "Статус" }));
    fireEvent.click(screen.getByRole("option", { name: "Начало реагирования" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить статус (Enter)" }));
    expect(await screen.findByText("Переход недопустим")).toBeInTheDocument();
    view.unmount();
    renderPanel({ isStatusLocked: true });
    expect(screen.queryByRole("button", { name: "Сменить статус (Alt + E)" })).toBeNull();
  });

  it("«только телефонные» службы — светло-серые (phoneOnly)", () => {
    const services = reference.services.map((service) =>
      service.id === "svc-pref-uao" ? { ...service, kind: "phoneOnly" as const } : service,
    );
    renderPanel({ services });
    const phoneOnly = screen.getByText("Преф. ЮАО").closest("[data-phone-only]");
    expect(phoneOnly).toHaveAttribute("data-phone-only", "true");
    expect(phoneOnly?.className).toContain("tile--phone-only");
  });
});
