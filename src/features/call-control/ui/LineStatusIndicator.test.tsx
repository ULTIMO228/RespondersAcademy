import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createTelephonyStore, useTelephonyStatus } from "@/entities/service";
import type { TelephonyStore } from "@/entities/service";

import { LineStatusIndicator } from "./LineStatusIndicator";

function ConnectedIndicator({ store }: { store: TelephonyStore }) {
  const status = useTelephonyStatus(store);
  return <LineStatusIndicator status={status} onToggle={store.cycleStatus} />;
}

describe("LineStatusIndicator", () => {
  it.each([
    ["available", "доступен"],
    ["unavailable", "недоступен"],
    ["disconnected", "не подключен"],
    ["error", "ошибка"],
  ] as const)("состояние %s → подпись «%s»", (status, title) => {
    render(<LineStatusIndicator status={status} onToggle={() => undefined} />);
    const indicator = screen.getByRole("button", { name: /Статус линии/ });
    expect(indicator).toHaveAttribute("data-status", status);
    expect(indicator).toHaveTextContent(title);
  });

  it("рендерит состояние общего стора: карточка открыта → «недоступен», клик переключает", () => {
    const store = createTelephonyStore();
    render(<ConnectedIndicator store={store} />);
    const indicator = screen.getByRole("button", { name: /Статус линии/ });
    expect(indicator).toHaveAttribute("data-status", "available");
    act(() => store.cardOpened());
    expect(indicator).toHaveTextContent("недоступен");
    fireEvent.click(indicator);
    expect(indicator).toHaveAttribute("data-status", "disconnected");
  });
});
