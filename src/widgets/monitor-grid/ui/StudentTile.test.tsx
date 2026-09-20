import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { StudentTileModel } from "../model/types";
import { StudentTile } from "./StudentTile";

const TILE: StudentTileModel = {
  studentId: "u-109",
  shortName: "Иванов И. И.",
  armNumber: 4,
  cardNumber: "36814850",
  cardType: "пожар: квартира",
  state: "working",
  reaction: "0:12",
  isReactionExceeded: false,
  processing: "1:40",
  isProcessingExceeded: false,
  statusTitle: "Обрабатывается",
  errorCount: 0,
  isAiEvaluated: false,
};

describe("StudentTile: офлайн и длинные данные (T5.2-05, T5.2-07)", () => {
  it("плитка «не подключён» объясняет, что данные последние известные", () => {
    render(<StudentTile tile={{ ...TILE, state: "offline" }} />);
    expect(screen.getByText("не подключён")).toBeInTheDocument();
    expect(screen.getByText("Нет связи с АРМ — показаны последние данные")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("data-state", "offline");
    // При офлайне таймеры нормативов не показываются — данные неактуальны.
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  });

  it("длинные ФИО, тип и статус рендерятся целиком, номер АРМ не теряется", () => {
    const longName = "Константинопольская-Преображенская Анастасия Владиславовна";
    const longStatus = "Ожидает подтверждения оперативного дежурного ЕДДС";
    render(
      <StudentTile
        tile={{
          ...TILE,
          shortName: longName,
          cardType: "дорожно-транспортное происшествие с пострадавшими, эвакуация",
          statusTitle: longStatus,
        }}
      />,
    );
    expect(screen.getByText(longName)).toBeInTheDocument();
    expect(screen.getByText("АРМ 4")).toBeInTheDocument();
    expect(screen.getByText(longStatus)).toBeInTheDocument();
    // Полное ФИО остаётся доступным мышью — в подсказке всей плитки.
    expect(screen.getByRole("link").getAttribute("title")).toContain(longName);
  });
});
