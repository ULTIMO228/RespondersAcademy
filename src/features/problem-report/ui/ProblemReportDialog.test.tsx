import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";
import type { ProblemReport } from "@/shared/api";

import { ATTACHMENT_SIZE_MESSAGE, ATTACHMENT_TYPE_MESSAGE } from "../model/attachment";
import { ProblemReportDialog, formatAppealTime } from "./ProblemReportDialog";

const REPORT: ProblemReport = {
  id: "pr-001",
  studentId: "s-1",
  studentName: "Иванов И. И.",
  groupId: "ГР-1",
  text: "Не сохраняется карточка",
  hasAttachment: false,
  createdAt: "2018-09-18T18:41:46+03:00",
};

const APPEAL_AT = "2018-09-18T18:41:46+03:00";

function renderDialog(overrides: Partial<Parameters<typeof ProblemReportDialog>[0]> = {}) {
  const props = {
    senderName: "Иванов И. И., опер. 1000, АРМ 111",
    incidentNumber: 132919,
    attemptId: "att-7",
    appealAt: APPEAL_AT,
    onClose: vi.fn(),
    onSent: vi.fn(),
    submit: vi.fn(async () => REPORT),
    ...overrides,
  };
  render(<ProblemReportDialog {...props} />);
  return props;
}

function typeText(value: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Текст сообщения" }), { target: { value } });
}

describe("окно «Сообщить о проблеме» (ИНСТРУКЦИЯ_104)", () => {
  it("показывает отправителя, происшествие и время обращения в формате АРМ; кнопки «Отменить» и «Отправить»", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Сообщить о проблеме" })).toBeInTheDocument();
    expect(screen.getByText("Отправитель")).toBeInTheDocument();
    expect(screen.getByText("Иванов И. И., опер. 1000, АРМ 111")).toBeInTheDocument();
    expect(screen.getByText("Происшествие")).toBeInTheDocument();
    expect(screen.getByText("132919")).toBeInTheDocument();
    expect(screen.getByText("Время обращения")).toBeInTheDocument();
    expect(screen.getByText("18.09.2018 в 18:41:46")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отменить" })).toBeEnabled();
  });

  it("без происшествия — прочерк; «Отправить» неактивна, пока текст пуст или из пробелов", () => {
    renderDialog({ incidentNumber: undefined });
    expect(screen.getByText("—")).toBeInTheDocument();
    const send = screen.getByRole("button", { name: "Отправить" });
    expect(send).toBeDisabled();
    typeText("   ");
    expect(send).toBeDisabled();
    typeText("Не открывается карточка");
    expect(send).toBeEnabled();
  });

  it("«Отправить» передаёт текст без пробелов по краям, попытку и происшествие; затем onSent и onClose", async () => {
    const props = renderDialog();
    typeText("  Не открывается карточка  ");
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    const form = (props.submit as ReturnType<typeof vi.fn>).mock.calls[0][0] as FormData;
    expect(form.get("text")).toBe("Не открывается карточка");
    expect(form.get("attemptId")).toBe("att-7");
    expect(form.get("incidentNumber")).toBe("132919");
    expect(form.has("attachment")).toBe(false);
    expect(props.onSent).toHaveBeenCalledWith(REPORT);
  });

  it("ошибка отправки остаётся в окне с текстом сервера; введённый текст сохраняется, onClose не вызывается", async () => {
    const props = renderDialog({
      submit: vi.fn(async () => {
        throw new ApiError(403, "forbidden", "Недостаточно прав");
      }),
    });
    typeText("Сообщение");
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Недостаточно прав");
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Текст сообщения" })).toHaveValue("Сообщение");
    expect(screen.getByRole("button", { name: "Отправить" })).toBeEnabled();
  });

  it("сбой без сообщения сервера — общий текст ошибки", async () => {
    renderDialog({ submit: vi.fn(async () => Promise.reject(new Error(""))) });
    typeText("Сообщение");
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось отправить сообщение");
  });

  it("«Отменить» закрывает окно без отправки", () => {
    const props = renderDialog();
    typeText("Сообщение");
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.submit).not.toHaveBeenCalled();
  });

  it("png до 2 МБ прикрепляется и уходит файлом; чужой тип — ошибка, вложение не добавляется", async () => {
    const props = renderDialog();
    const input = screen.getByLabelText("Прикрепить изображение");
    fireEvent.change(input, {
      target: { files: [new File(["log"], "chrome_debug.log", { type: "text/plain" })] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(ATTACHMENT_TYPE_MESSAGE);
    expect(screen.queryByText("chrome_debug.log")).not.toBeInTheDocument();

    fireEvent.change(input, {
      target: { files: [new File(["\x89PNG"], "shot.png", { type: "image/png" })] },
    });
    expect(screen.getByText("shot.png")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    typeText("Скриншот ошибки");
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    const form = (props.submit as ReturnType<typeof vi.fn>).mock.calls[0][0] as FormData;
    expect((form.get("attachment") as File).name).toBe("shot.png");
  });

  it("файл больше 2 МБ — ошибка размера; «Отправить» неактивна, пока файл не заменён", () => {
    renderDialog();
    typeText("Текст");
    const big = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 2 * 1024 * 1024 + 1 });
    fireEvent.change(screen.getByLabelText("Прикрепить изображение"), { target: { files: [big] } });
    expect(screen.getByRole("alert")).toHaveTextContent(ATTACHMENT_SIZE_MESSAGE);
    expect(screen.getByRole("button", { name: "Отправить" })).toBeDisabled();
  });

  it("Esc закрывает окно (поведение модального окна АРМ)", () => {
    const props = renderDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe("formatAppealTime", () => {
  it("печатает дату и время по Москве; нечитаемая метка — прочерк", () => {
    expect(formatAppealTime("2018-09-18T15:41:46Z")).toBe("18.09.2018 в 18:41:46");
    expect(formatAppealTime("не дата")).toBe("—");
  });
});
