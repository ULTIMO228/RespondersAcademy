import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AiSourceBadge } from "./AiSourceBadge";

describe("AiSourceBadge", () => {
  it("облако — «ИИ · облако»", () => {
    render(<AiSourceBadge source="cloud" />);
    expect(screen.getByText("ИИ · облако")).toBeInTheDocument();
  });

  it("локальная модель — «ИИ · локально»", () => {
    render(<AiSourceBadge source="local" />);
    expect(screen.getByText("ИИ · локально")).toBeInTheDocument();
  });

  it("шаблон — «шаблон», без пометки ИИ", () => {
    render(<AiSourceBadge source="template" />);
    expect(screen.getByText("шаблон")).toBeInTheDocument();
    expect(screen.queryByText(/ИИ/)).not.toBeInTheDocument();
  });

  it("модель показывается в подсказке", () => {
    render(<AiSourceBadge source="cloud" model="qwen/qwen3.8-27b" />);
    expect(screen.getByText("ИИ · облако")).toHaveAttribute(
      "title",
      expect.stringContaining("qwen/qwen3.8-27b"),
    );
  });

  it("старые данные без источника читаются как шаблон", () => {
    render(<AiSourceBadge source={undefined} />);
    expect(screen.getByText("шаблон")).toBeInTheDocument();
  });
});
