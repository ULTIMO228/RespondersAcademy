import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudentActions } from "@/widgets/monitor-grid";
import { armCardFixtures, classifier, reference } from "@/shared/api";
import type { ArmCardFixtureContract } from "@/shared/api";

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
