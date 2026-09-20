import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PhonePage } from "./PhonePage";

vi.mock("./PhoneScreen", () => ({
  PhoneScreen: ({ cardId, mockLine }: { cardId: string | null; mockLine: string | null }) => (
    <p data-testid="screen">{`${cardId ?? "—"} / ${mockLine ?? "—"}`}</p>
  ),
}));

async function renderPage(params: Record<string, string | string[] | undefined>) {
  render(await PhonePage({ searchParams: Promise.resolve(params) }));
}

describe("PhonePage (/arm/phone)", () => {
  it("smoke: заголовок и клиентский софтфон без контекста карточки", async () => {
    await renderPage({});
    expect(screen.getByRole("heading", { name: "Софтфон" })).toBeInTheDocument();
    expect(screen.getByTestId("screen")).toHaveTextContent("— / —");
  });

  it("?cardId= передаёт контекст карточки; ?mockLine= — только disconnected|error", async () => {
    await renderPage({ cardId: "c-095", mockLine: "error" });
    expect(screen.getByTestId("screen")).toHaveTextContent("c-095 / error");
  });

  it("мусор в mockLine игнорируется", async () => {
    await renderPage({ cardId: ["c-093", "c-095"], mockLine: "available" });
    expect(screen.getByTestId("screen")).toHaveTextContent("c-093 / —");
  });
});
