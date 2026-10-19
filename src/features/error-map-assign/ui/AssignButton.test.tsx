import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AssignButton } from "./AssignButton";

const LABEL = "Назначить тренировку по этому этапу";
const linkUrl = (): URL => {
  const href = screen.getByRole("link", { name: LABEL }).getAttribute("href") ?? "";
  return new URL(href, "http://localhost");
};

describe("AssignButton", () => {
  it("ведёт в мастер назначения с обучающимися, режимом, названием и этапом", () => {
    render(<AssignButton stageTitle="Пожар" mode="dds" studentIds={["u-005", "u-006"]} />);
    const url = linkUrl();
    expect(url.pathname).toBe("/teacher/assignments/new");
    expect(url.searchParams.get("studentIds")).toBe("u-005,u-006");
    expect(url.searchParams.get("mode")).toBe("dds");
    expect(url.searchParams.get("title")).toBe("Тренировка: Пожар");
    expect(url.searchParams.get("focusStage")).toBe("Пожар");
  });

  it("без обучающихся ссылка всё равно ведёт в мастер: параметра studentIds нет, выбор — вручную", () => {
    render(<AssignButton stageTitle="ДТП" mode="operator112" studentIds={[]} />);
    const url = linkUrl();
    expect(url.pathname).toBe("/teacher/assignments/new");
    expect(url.searchParams.has("studentIds")).toBe(false);
    expect(url.searchParams.get("mode")).toBe("operator112");
  });

  it("название этапа с кавычками и запятыми передаётся без искажений", () => {
    render(<AssignButton stageTitle={"Пожар, «ДТП»"} mode="dds" studentIds={["u-005"]} />);
    expect(linkUrl().searchParams.get("focusStage")).toBe("Пожар, «ДТП»");
  });
});
