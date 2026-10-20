import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Recommendation } from "@/shared/api";

import { RecommendationList } from "./RecommendationList";

const item: Recommendation = {
  id: "rec-1",
  kind: "category",
  targetId: "ЕКП",
  title: "Повторите тему",
  reason: { errorType: "addressMissing", count: 2, ruleId: "R22" },
  createdAt: "2026-10-20T10:00:00+03:00",
  source: "local",
  text: "Проверьте адрес перед передачей карточки.",
};

describe("RecommendationList", () => {
  it("показывает текст рекомендации и фактический источник", () => {
    render(<RecommendationList items={[item]} />);

    expect(screen.getByText("ИИ · локально")).toBeInTheDocument();
    expect(screen.getByText(item.text!)).toBeInTheDocument();
  });

  it("старую рекомендацию без источника помечает как шаблон", () => {
    const { rerender } = render(<RecommendationList items={[item]} />);
    rerender(<RecommendationList items={[{ ...item, source: undefined, text: undefined }]} />);

    expect(screen.getByText("шаблон")).toBeInTheDocument();
  });
});
