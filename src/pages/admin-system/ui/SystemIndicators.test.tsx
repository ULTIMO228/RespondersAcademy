/* T4.2-10: индикаторы «контур изолирован» и «Целостность системы» — оба состояния самопроверки. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SystemIntegrity } from "@/shared/api";

import { SystemIndicators } from "./SystemIndicators";

const CHECKED_AT = "2026-09-17T06:00:00+03:00";

function renderIndicators(integrity: SystemIntegrity) {
  return render(<SystemIndicators integrity={integrity} autoRecovery onToggleAutoRecovery={vi.fn()} />);
}

describe("SystemIndicators", () => {
  it("целостность в порядке: «OK» и время самопроверки", () => {
    renderIndicators({ ok: true, checkedAt: CHECKED_AT, details: "Контрольные суммы совпали" });
    expect(screen.getByText("Целостность системы: OK")).toBeInTheDocument();
    expect(screen.getByText(/17\.09\.2026 06:00:00/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("нарушение целостности: красная плашка с деталями вместо «OK»", () => {
    renderIndicators({
      ok: false,
      checkedAt: CHECKED_AT,
      details: "Контрольная сумма журнала аудита не совпала",
    });
    expect(screen.queryByText("Целостность системы: OK")).not.toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Целостность системы: нарушена");
    expect(alert).toHaveTextContent("Контрольная сумма журнала аудита не совпала");
  });

  it("контур изолирован — напоминание границы ТЗ §4", () => {
    renderIndicators({ ok: true, checkedAt: CHECKED_AT, details: "" });
    expect(screen.getByText("Контур изолирован")).toBeInTheDocument();
    expect(screen.getByText(/локальная сеть класса/)).toBeInTheDocument();
  });
});
