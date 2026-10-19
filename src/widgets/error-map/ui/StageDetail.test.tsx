import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ErrorMapStage, ErrorMapStageDetail, ErrorMapTypicalError } from "@/shared/api";

import { StageDetail } from "./StageDetail";

const stages: ErrorMapStage[] = [
  { id: "intake", order: 1, title: "Приём вызова", articleId: "art-intake" },
  { id: "address", order: 2, title: "Адрес" },
];

function typical(overrides: Partial<ErrorMapTypicalError> = {}): ErrorMapTypicalError {
  return {
    ruleId: "r1",
    plainText: "Не уточнён номер дома",
    severity: "major",
    studentCount: 2,
    students: [
      { id: "u1", name: "Иванов Пётр" },
      { id: "u2", name: "Сидорова Анна" },
    ],
    exampleAttemptId: "att-1",
    exampleSessionId: "ses-1",
    ...overrides,
  };
}

function detail(overrides: Partial<ErrorMapStageDetail> = {}): ErrorMapStageDetail {
  return {
    stage: stages[0],
    level: {
      stageId: "intake",
      attempts: 10,
      attemptsWithError: 5,
      share: 0.5,
      level: "often",
      affectedStudents: 2,
    },
    typicalErrors: [typical()],
    chain: [{ from: "intake", to: "address", caption: "неточный адрес" }],
    explanation: null,
    ...overrides,
  };
}

describe("StageDetail", () => {
  it("показывает название этапа, типовые ошибки простыми словами и имена обучающихся", () => {
    render(<StageDetail detail={detail()} stages={stages} onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /Приём вызова/ })).toBeInTheDocument();
    expect(screen.getByText("Не уточнён номер дома")).toBeInTheDocument();
    expect(screen.getByText(/Иванов Пётр/)).toBeInTheDocument();
    expect(screen.getByText(/Сидорова Анна/)).toBeInTheDocument();
  });

  it("ссылка «Открыть пример» ведёт на отчёт занятия", () => {
    render(<StageDetail detail={detail()} stages={stages} onClose={vi.fn()} />);
    expect(screen.getByRole("link", { name: /Открыть пример/ })).toHaveAttribute(
      "href",
      "/teacher/reports/ses-1",
    );
  });

  it("«Открыть пример» скрыта, если exampleSessionId нет", () => {
    render(
      <StageDetail
        detail={detail({ typicalErrors: [typical({ exampleSessionId: undefined })] })}
        stages={stages}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("link", { name: /Открыть пример/ })).toBeNull();
  });

  it("ссылка на статью справочника показывается при articleId", () => {
    render(<StageDetail detail={detail()} stages={stages} onClose={vi.fn()} />);
    expect(screen.getByRole("link", { name: /Статья справочника/ })).toHaveAttribute(
      "href",
      "/reference?article=art-intake",
    );
  });

  it("ссылка на статью скрыта, если articleId нет", () => {
    render(<StageDetail detail={detail({ stage: stages[1] })} stages={stages} onClose={vi.fn()} />);
    expect(screen.queryByRole("link", { name: /Статья справочника/ })).toBeNull();
  });

  it("слот assignAction выводится в разборе", () => {
    render(
      <StageDetail
        detail={detail()}
        stages={stages}
        onClose={vi.fn()}
        assignAction={<a href="/teacher/assignments/new">Назначить тренировку по этому этапу</a>}
      />,
    );
    expect(screen.getByRole("link", { name: "Назначить тренировку по этому этапу" })).toBeInTheDocument();
  });

  it("без assignAction кнопки назначения нет", () => {
    render(<StageDetail detail={detail()} stages={stages} onClose={vi.fn()} />);
    expect(screen.queryByText(/Назначить тренировку/)).toBeNull();
  });

  it("кнопка закрытия вызывает onClose", () => {
    const onClose = vi.fn();
    render(<StageDetail detail={detail()} stages={stages} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть разбор" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("пустой список ошибок — понятный текст, без блока примеров", () => {
    render(<StageDetail detail={detail({ typicalErrors: [] })} stages={stages} onClose={vi.fn()} />);
    expect(screen.getByText("По этому этапу типовых ошибок за период нет")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Открыть пример/ })).toBeNull();
  });

  it("показывает не более трёх типовых ошибок", () => {
    const many = ["a", "b", "c", "d"].map((id) => typical({ ruleId: id, plainText: `Ошибка ${id}` }));
    render(<StageDetail detail={detail({ typicalErrors: many })} stages={stages} onClose={vi.fn()} />);
    const list = screen.getByRole("list", { name: "Типовые ошибки" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  });

  it("цепочка причин показывается подписью словами", () => {
    render(<StageDetail detail={detail()} stages={stages} onClose={vi.fn()} />);
    expect(screen.getByText("Влияет на:")).toBeInTheDocument();
    expect(screen.getByText("неточный адрес")).toBeInTheDocument();
  });
});

describe("StageDetail: ссылки на обучающихся", () => {
  it("с studentHref имя — ссылка на карту обучающегося", () => {
    render(
      <StageDetail
        detail={detail()}
        stages={stages}
        onClose={vi.fn()}
        studentHref={(id) => `/teacher/error-map/students/${id}`}
      />,
    );
    expect(screen.getByRole("link", { name: "Иванов Пётр" })).toHaveAttribute(
      "href",
      "/teacher/error-map/students/u1",
    );
    expect(screen.getByRole("link", { name: "Сидорова Анна" })).toHaveAttribute(
      "href",
      "/teacher/error-map/students/u2",
    );
  });

  it("без studentHref имена остаются текстом", () => {
    render(<StageDetail detail={detail()} stages={stages} onClose={vi.fn()} />);
    expect(screen.queryByRole("link", { name: "Иванов Пётр" })).not.toBeInTheDocument();
    expect(screen.getByText(/Иванов Пётр, Сидорова Анна/)).toBeInTheDocument();
  });
  describe("пояснение «Почему так происходит»", () => {
    const explanation = {
      text: "Спешат и не сверяют адрес.",
      source: "ai",
      textHash: "h".repeat(64),
    } as const;
    const target = { groupId: "g-1", mode: "dds", period: "1m", stageId: "intake" } as const;

    it("с пояснением и контекстом блок показан", () => {
      render(
        <StageDetail
          detail={detail({ explanation })}
          stages={stages}
          onClose={vi.fn()}
          explainTarget={target}
        />,
      );
      expect(screen.getByText("Спешат и не сверяют адрес.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Согласен" })).toBeInTheDocument();
    });

    it("без пояснения (мало данных) или без контекста блока нет", () => {
      const { unmount } = render(
        <StageDetail detail={detail()} stages={stages} onClose={vi.fn()} explainTarget={target} />,
      );
      expect(screen.queryByText(/Почему так происходит/)).not.toBeInTheDocument();
      unmount();
      render(<StageDetail detail={detail({ explanation })} stages={stages} onClose={vi.fn()} />);
      expect(screen.queryByText(/Почему так происходит/)).not.toBeInTheDocument();
    });
  });
});
