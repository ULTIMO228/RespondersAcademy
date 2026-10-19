import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ErrorMapChainLink, ErrorMapStage } from "@/shared/api";

import { ChainHint } from "./ChainHint";

const stages: ErrorMapStage[] = [
  { id: "address", order: 2, title: "Адрес" },
  { id: "services", order: 3, title: "Службы" },
];

const chain: ErrorMapChainLink[] = [
  { from: "intake", to: "address", caption: "неточный адрес мешает вызвать службу" },
  { from: "intake", to: "services", caption: "служба вызвана не туда" },
];

describe("ChainHint", () => {
  it("подпись цепочки словами: «Влияет на: <этап> — <подпись>»", () => {
    render(<ChainHint chain={chain} stages={stages} />);
    expect(screen.getAllByText("Влияет на:")).toHaveLength(2);
    expect(screen.getByText("неточный адрес мешает вызвать службу")).toBeInTheDocument();
    expect(screen.getByText("служба вызвана не туда")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("пунктир — декоративный SVG, скрыт от чтения", () => {
    const { container } = render(<ChainHint chain={chain} stages={stages} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg?.querySelector("[stroke-dasharray]")).not.toBeNull();
  });

  it("без связей ничего не показывает", () => {
    const { container } = render(<ChainHint chain={[]} stages={stages} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("неизвестный этап показывается по id, а не пропадает", () => {
    render(<ChainHint chain={[{ from: "a", to: "zzz", caption: "подпись" }]} stages={stages} />);
    expect(screen.getByText("zzz")).toBeInTheDocument();
  });

  it("название этапа — кнопка: переход к связанному этапу с клавиатуры", () => {
    const onSelectStage = vi.fn();
    render(<ChainHint chain={chain} stages={stages} onSelectStage={onSelectStage} />);
    const button = screen.getByRole("button", { name: "Адрес" });
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(onSelectStage).toHaveBeenCalledWith("address");
  });

  it("без onSelectStage названия — обычный текст", () => {
    render(<ChainHint chain={chain} stages={stages} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Адрес")).toBeInTheDocument();
  });
});
