import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudentActions } from "@/widgets/monitor-grid";
import { armCardFixtures, classifier, reference } from "@/shared/api";
import type { ArmCardFixtureContract, OperatorAttempt } from "@/shared/api";

import { StudentMirror } from "./StudentMirror";

const fixtures = armCardFixtures as unknown as ArmCardFixtureContract[];
const card = fixtures.find((fixture) => fixture.id === "card-36814850") ?? fixtures[0];

describe("StudentMirror (T0.3-03, T3.3-07)", () => {
  it("рендерит ту же карточку в read-only без активных кнопок смены статуса", () => {
    render(
      <StudentMirror
        card={card}
        classifierEntries={classifier.filter((entry) => entry.code === card.what.classifierCode)}
        services={reference.services}
        serviceStatuses={reference.serviceStatuses}
        ddsStatuses={reference.ddsStatuses}
        isExceeded={false}
      />,
    );
    const mirror = screen.getByRole("group", { name: /только просмотр/ });
    expect(mirror).toBeDisabled();
    expect(within(mirror).getByText(new RegExp(String(card.number)))).toBeInTheDocument();
    within(mirror)
      .queryAllByRole("button")
      .forEach((button) => expect(button).toBeDisabled());
  });

  it("панель действий подсвечивает отклонения", () => {
    const { container } = render(
      <StudentActions
        caption="Эталон"
        rows={[
          { id: "1", action: "status:accepted", label: "Статус «Принята»", offset: "+0:14", deviation: "ok" },
          { id: "2", action: "call:102", label: "Звонок точке C: 102", offset: "+0:53", deviation: "order" },
        ]}
      />,
    );
    expect(container.querySelector("[data-deviation='order']")).toHaveTextContent("нарушен порядок");
  });
});

const attempt112: OperatorAttempt = {
  id: "op-1",
  cardId: "c-112-1",
  studentId: "u-005",
  aon: "+7 900 000-00-00",
  incidentNumber: 77,
  createdAt: "2026-10-20T10:00:00+03:00",
  openedAt: "2026-10-20T10:00:00+03:00",
  state: "answered",
  events: [
    {
      id: "e1",
      type: "fieldChanged",
      at: "2026-10-20T10:00:10+03:00",
      payload: { field: "applicant.name", value: "Петров" },
    },
    {
      id: "e2",
      type: "fieldChanged",
      at: "2026-10-20T10:00:20+03:00",
      payload: { field: "applicant.name", value: "Петров П." },
    },
    {
      id: "e3",
      type: "fieldChanged",
      at: "2026-10-20T10:00:30+03:00",
      payload: { field: "address.street", value: "Тверская" },
    },
    {
      id: "e4",
      type: "fieldChanged",
      at: "2026-10-20T10:00:40+03:00",
      payload: { field: "what.casualties.injured", value: true },
    },
  ],
  replays: 0,
  hintsShown: 0,
};

describe("StudentMirror: рабочее место 112 (T054)", () => {
  it("показывает зеркало 112 только для просмотра, значения — из последних событий полей", () => {
    render(<StudentMirror mode="operator112" attempt={attempt112} />);
    const mirror = screen.getByRole("group", { name: /Специалист 112.*только просмотр/ });
    expect(mirror).toBeDisabled();
    expect(within(mirror).getByLabelText("ФИО")).toHaveValue("Петров П.");
    expect(within(mirror).getByLabelText("Улица")).toHaveValue("Тверская");
    expect(within(mirror).getByLabelText("Пострадавшие")).toBeChecked();
    expect(within(mirror).getByLabelText("ЧС")).not.toBeChecked();
    within(mirror)
      .queryAllByRole("textbox")
      .forEach((field) => expect(field).toHaveAttribute("readonly"));
    // Блока карточки ДДС и панели служб здесь нет.
    expect(screen.queryByText(/Панель служб/)).not.toBeInTheDocument();
  });

  it("без попытки честно сообщает, что данных нет, и не рисует выдуманных значений", () => {
    render(<StudentMirror mode="operator112" attempt={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(/нет данных попытки 112/i);
  });

  it("парная проверка: режим ДДС по-прежнему рисует карточку, а не рабочее место 112", () => {
    render(
      <StudentMirror
        card={card}
        classifierEntries={[]}
        services={reference.services}
        serviceStatuses={reference.serviceStatuses}
        ddsStatuses={reference.ddsStatuses}
        isExceeded={false}
      />,
    );
    expect(screen.queryByLabelText("ФИО")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Зеркало экрана курсанта/ })).toBeInTheDocument();
  });
});
