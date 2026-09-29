import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";

import { ServerExportButtons } from "./ServerExportButtons";

describe("ServerExportButtons", () => {
  it("скачивает CSV и PDF отчёта с именем reportId.расширение", async () => {
    const blob = new Blob(["x"]);
    const download = vi.fn().mockResolvedValue(blob);
    const saver = { save: vi.fn() };
    render(<ServerExportButtons reportId="grp-001" download={download} saver={saver} />);
    fireEvent.click(screen.getByRole("button", { name: "CSV с сервера" }));
    await waitFor(() => expect(saver.save).toHaveBeenCalledWith(blob, "grp-001.csv"));
    fireEvent.click(screen.getByRole("button", { name: "PDF с сервера" }));
    await waitFor(() => expect(saver.save).toHaveBeenCalledWith(blob, "grp-001.pdf"));
    expect(download).toHaveBeenNthCalledWith(1, "grp-001", "csv");
    expect(download).toHaveBeenNthCalledWith(2, "grp-001", "pdf");
  });

  it("403 и 404 показываются сообщением сервера, файл не сохраняется", async () => {
    const saver = { save: vi.fn() };
    const download = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(403, "forbidden", "Отчёты занятия другого преподавателя недоступны"),
      )
      .mockRejectedValueOnce(new ApiError(404, "notFound", "Отчёт не найден"));
    render(<ServerExportButtons reportId="rep-9" download={download} saver={saver} />);
    fireEvent.click(screen.getByRole("button", { name: "CSV с сервера" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Отчёты занятия другого преподавателя недоступны",
    );
    fireEvent.click(screen.getByRole("button", { name: "PDF с сервера" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Отчёт не найден"));
    expect(saver.save).not.toHaveBeenCalled();
  });
});
