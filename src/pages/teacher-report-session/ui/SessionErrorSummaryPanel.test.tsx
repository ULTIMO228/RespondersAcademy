/*
 * Сводка ошибок отчёта занятия: неполный ответ сервера (без byDetector — так отвечал бэкенд до правки)
 * не роняет страницу отчёта, а полный — показывает счётчики и детекторы.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SessionErrorSummaryResponse } from "@/shared/api";

import { SessionErrorSummaryPanel } from "./SessionErrorSummaryPanel";

const FULL: SessionErrorSummaryResponse = {
  sessionId: "ses-1",
  totalErrors: 3,
  critical: 2,
  major: 1,
  minor: 0,
  byRule: { t1: 2, "op-f3": 1 },
  byDetector: { rule: 3 },
  byStudent: { "u-005": 3 },
};

describe("SessionErrorSummaryPanel", () => {
  it("показывает счётчики и детекторы полной сводки", () => {
    render(<SessionErrorSummaryPanel summary={FULL} attempts={[]} />);
    expect(screen.getByText(/Критических: 2/)).toBeInTheDocument();
    expect(screen.getByText(/Правило: 3/)).toBeInTheDocument();
  });

  it("не падает на сводке без byDetector и считает уровни по попыткам", () => {
    const partial = {
      sessionId: "ses-1",
      totalErrors: 0,
      byStudent: {},
    } as unknown as SessionErrorSummaryResponse;
    render(<SessionErrorSummaryPanel summary={partial} attempts={[]} />);
    expect(screen.getByText(/Критических: 0/)).toBeInTheDocument();
    expect(screen.queryByText(/Детекторы:/)).not.toBeInTheDocument();
  });
});
