import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Operator112Card } from "./Operator112Card";

function setup(overrides: Partial<React.ComponentProps<typeof Operator112Card>> = {}) {
  const props: React.ComponentProps<typeof Operator112Card> = {
    phone: {
      status: "Отключение",
      aon: "+7 (499) 550-34-56",
      phoneProvided: "",
      phoneOnSite: "",
      onPhoneProvided: vi.fn(),
      onPhoneOnSite: vi.fn(),
      onSmsList: vi.fn(),
      smsUnread: 2,
    },
    header: { number: 36814851, savedAt: "17.09.2026 в 11:38:33", operatorLine: "Опер. , АРМ 4, УМЦ О n" },
    timer: { text: "00:09", isRed: false },
    applicant: { name: "", status: "", onName: vi.fn(), onStatus: vi.fn() },
    description: { value: "", onChange: vi.fn() },
    address: <div>блок адреса</div>,
    flags: { injured: false, ambulanceRefused: false, blocked: true },
    onFlag: vi.fn(),
    onNoContact: vi.fn(),
    onDropped: vi.fn(),
    typeTabs: <div>Введите тип происшествия · что случилось?</div>,
    servicesBar: <div>Службы:</div>,
    ...overrides,
  };
  render(<Operator112Card {...props} />);
  return props;
}

describe("Operator112Card (КАРТОЧКА_image1)", () => {
  it("блоки на месте, запретных элементов нет", () => {
    setup();
    expect(screen.getByText("Отключение")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "записи звонков" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /список SMS/ })).toBeEnabled();
    expect(screen.getByLabelText("АОН")).toHaveValue("+7 (499) 550-34-56");
    expect(screen.getByLabelText("предоставленный")).toBeInTheDocument();
    expect(screen.getByLabelText("телефон на место")).toBeInTheDocument();
    expect(screen.getByTestId("card-header")).toHaveTextContent("Происшествие 36814851");
    expect(screen.getByTestId("card-header")).toHaveTextContent("Сохр. 17.09.2026 в 11:38:33");
    expect(screen.getByRole("timer")).toHaveTextContent("00:09");
    expect(screen.getByPlaceholderText("Фамилия и имя заявителя")).toBeInTheDocument();
    expect(screen.getByText("блок адреса")).toBeInTheDocument();
    expect(screen.getByText("Описание со слов заявителя")).toBeInTheDocument();
    expect(screen.getByText("0 / 1999")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "нет контакта" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "срыв звонка" })).toBeEnabled();
    expect(screen.getByText(/что случилось\?/)).toBeInTheDocument();
    expect(screen.queryByText(/Специалист-112/)).toBeNull();
    expect(screen.queryByText(/Передать карточку/)).toBeNull();
    expect(screen.queryByText("недоступен")).toBeNull();
  });

  it("флаги — переключатели; «нет контакта»/«срыв звонка» вызывают колбэки и блокируются после выбора типа", () => {
    const props = setup();
    expect(screen.getByRole("button", { name: "Нет доступа/ Заблокированные" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Пострадавшие" }));
    expect(props.onFlag).toHaveBeenCalledWith("injured", true);
    fireEvent.click(screen.getByRole("button", { name: "нет контакта" }));
    fireEvent.click(screen.getByRole("button", { name: "срыв звонка" }));
    expect(props.onNoContact).toHaveBeenCalledTimes(1);
    expect(props.onDropped).toHaveBeenCalledTimes(1);
  });

  it("после выбора типа красные кнопки неактивны", () => {
    setup({ isTypeChosen: true });
    expect(screen.getByRole("button", { name: "нет контакта" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "срыв звонка" })).toBeDisabled();
  });
});
