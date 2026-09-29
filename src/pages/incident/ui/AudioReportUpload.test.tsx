import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AudioReportUpload } from "./AudioReportUpload";

afterEach(() => vi.unstubAllGlobals());

describe("AudioReportUpload", () => {
  it("uploads a WAV and offers the stored recording for playback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            call: { transcript: [{ text: "Адрес уточнён, направлена служба" }] },
            recording: { url: "/api/v1/cards/c-010/recordings/call-001/file" },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<AudioReportUpload attemptId="att-001" />);
    const input = await screen.findByLabelText("WAV доклада");
    fireEvent.change(input, { target: { files: [new File(["wav"], "report.wav", { type: "audio/wav" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить доклад" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/attempts/att-001/report-audio");
    expect(fetchMock.mock.calls[1][1].body).toBeInstanceOf(FormData);
    expect(await screen.findByText(/Адрес уточнён, направлена служба/)).toBeInTheDocument();
    expect(screen.getByLabelText("Прослушать аудиодоклад")).toHaveAttribute(
      "src",
      "/api/v1/cards/c-010/recordings/call-001/file",
    );
  });

  it("stays hidden when only the frontend mock API is running", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    render(<AudioReportUpload attemptId="att-001" />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText("WAV доклада")).toBeNull();
  });
});
