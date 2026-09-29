import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RecordingsModal } from "./RecordingsModal";

describe("RecordingsModal", () => {
  it("plays and downloads an available recording", () => {
    const audioUrl = "/api/v1/cards/c-010/recordings/call-001/file";
    render(
      <RecordingsModal
        recordings={[
          {
            id: "call-001",
            at: "2026-09-29T10:00:00+03:00",
            title: "Доклад в 112",
            duration: "00:12",
            audioUrl,
          },
        ]}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Прослушать Доклад в 112")).toHaveAttribute("src", audioUrl);
    expect(screen.getByRole("link", { name: "скачать" })).toHaveAttribute("href", audioUrl);
    expect(screen.getByRole("link", { name: "скачать" })).toHaveAttribute("download", "call-001.wav");
  });

  it("keeps playback unavailable for records without a file", () => {
    render(
      <RecordingsModal
        recordings={[
          {
            id: "mock-001",
            at: "2026-09-29T10:00:00+03:00",
            title: "Мок",
            duration: "00:12",
            audioUrl: null,
          },
        ]}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "прослушать" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "скачать" })).toBeDisabled();
  });
});
