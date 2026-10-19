import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ErrorMapStage, ErrorMapStageDetail, ErrorMapStageLevel } from "@/shared/api";

import { PresentHeadlineSlide, PresentMode, PresentStageSlide } from "./PresentMode";

const onStep = vi.fn();
const onExit = vi.fn();

function setup(step: number, total: number) {
  return render(
    <PresentMode step={step} total={total} onStep={onStep} onExit={onExit}>
      <p>Содержимое шага {step}</p>
    </PresentMode>,
  );
}

describe("режим показа: рамка", () => {
  beforeEach(() => {
    onStep.mockClear();
    onExit.mockClear();
  });

  it("одна тема на экран: счётчик шагов и содержимое только текущего шага", () => {
    setup(2, 3);
    expect(screen.getByText("Шаг 2 из 3")).toBeInTheDocument();
    expect(screen.getByText("Содержимое шага 2")).toBeInTheDocument();
    expect(screen.getAllByText(/Содержимое шага/)).toHaveLength(1);
  });

  it("на первом шаге нет «Назад», есть «Дальше»", () => {
    setup(1, 3);
    expect(screen.queryByRole("button", { name: /Назад/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Дальше/ })).toBeInTheDocument();
  });

  it("на последнем шаге нет «Дальше», есть «Назад»", () => {
    setup(3, 3);
    expect(screen.queryByRole("button", { name: /Дальше/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Назад/ })).toBeInTheDocument();
  });

  it("единственный шаг: листать нечего, выйти можно", () => {
    setup(1, 1);
    expect(screen.queryByRole("button", { name: /Назад/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Дальше/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Выйти из показа" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("мышью: «Дальше» и «Назад» переходят на соседний шаг", () => {
    setup(2, 3);
    fireEvent.click(screen.getByRole("button", { name: /Дальше/ }));
    expect(onStep).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: /Назад/ }));
    expect(onStep).toHaveBeenLastCalledWith(1);
  });

  it("«Выйти из показа» вызывает выход", () => {
    setup(2, 3);
    fireEvent.click(screen.getByRole("button", { name: "Выйти из показа" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("с клавиатуры: стрелки и PageUp/PageDown листают, Esc выходит", () => {
    setup(2, 3);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onStep).toHaveBeenLastCalledWith(3);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onStep).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(window, { key: "PageDown" });
    expect(onStep).toHaveBeenLastCalledWith(3);
    fireEvent.keyDown(window, { key: "PageUp" });
    expect(onStep).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("с клавиатуры: на краях стрелки ничего не делают", () => {
    const { unmount } = setup(1, 3);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onStep).not.toHaveBeenCalled();
    unmount();
    setup(3, 3);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onStep).not.toHaveBeenCalled();
  });

  it("с клавиатуры: сочетания с модификаторами и ввод в поле не листают", () => {
    setup(2, 3);
    fireEvent.keyDown(window, { key: "ArrowRight", altKey: true });
    fireEvent.keyDown(window, { key: "ArrowRight", ctrlKey: true });
    fireEvent.keyDown(window, { key: "ArrowRight", metaKey: true });
    const field = document.createElement("input");
    document.body.appendChild(field);
    fireEvent.keyDown(field, { key: "ArrowRight" });
    field.remove();
    expect(onStep).not.toHaveBeenCalled();
  });

  it("после размонтирования клавиши не обрабатываются", () => {
    const { unmount } = setup(2, 3);
    unmount();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onStep).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
  });

  it("кнопки и подсказка читаются: слова на кнопках, подсказка про клавиши", () => {
    setup(2, 3);
    expect(screen.getByText(/Стрелки/)).toHaveTextContent("Esc");
  });
});

const STAGES: ErrorMapStage[] = [
  { id: "address", order: 1, title: "Адрес" },
  { id: "services", order: 2, title: "Службы" },
];

const LEVELS: ErrorMapStageLevel[] = [
  { stageId: "address", attempts: 10, attemptsWithError: 6, share: 0.6, level: "often", affectedStudents: 4 },
  {
    stageId: "services",
    attempts: 10,
    attemptsWithError: 1,
    share: 0.1,
    level: "sometimes",
    affectedStudents: 1,
  },
];

describe("режим показа: шаг «вывод»", () => {
  it("крупная фраза-вывод и лента этапов со словом уровня", () => {
    render(
      <PresentHeadlineSlide
        headline={{ kind: "problems", stageIds: ["address"], text: "Главная проблема группы: Адрес" }}
        stages={STAGES}
        levels={LEVELS}
      />,
    );
    expect(screen.getByRole("heading", { name: "Главная проблема группы: Адрес" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Адрес: часто/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Службы: иногда/ })).toBeInTheDocument();
  });
});

const DETAIL: ErrorMapStageDetail = {
  stage: STAGES[0],
  level: LEVELS[0],
  typicalErrors: [
    {
      ruleId: "a1",
      plainText: "Адрес не совпадает с билетом",
      severity: "major",
      studentCount: 2,
      students: [
        { id: "u-1", name: "Иванов Пётр" },
        { id: "u-2", name: "Петрова Анна" },
      ],
    },
    {
      ruleId: "a2",
      plainText: "Опечатка в названии улицы",
      severity: "minor",
      studentCount: 1,
      students: [{ id: "u-1", name: "Иванов Пётр" }],
    },
  ],
  chain: [],
  explanation: null,
};

describe("режим показа: шаг этапа", () => {
  it("название, слово уровня, типовые ошибки простыми словами и имена без повторов", () => {
    render(<PresentStageSlide detail={DETAIL} />);
    expect(screen.getByRole("heading", { name: "Адрес" })).toBeInTheDocument();
    expect(screen.getByText(/часто/)).toBeInTheDocument();
    expect(screen.getByText("Адрес не совпадает с билетом")).toBeInTheDocument();
    expect(screen.getByText("Опечатка в названии улицы")).toBeInTheDocument();
    const who = screen.getByText(/Иванов Пётр/);
    expect(who).toHaveTextContent("Иванов Пётр, Петрова Анна");
    expect(who.textContent?.match(/Иванов Пётр/g)).toHaveLength(1);
  });

  it("без типовых ошибок — понятная строка, а не пустое место", () => {
    render(<PresentStageSlide detail={{ ...DETAIL, typicalErrors: [] }} />);
    expect(screen.getByText("Типовых ошибок по этапу не найдено")).toBeInTheDocument();
  });

  it("много обучающихся — первые восемь и «и ещё N»", () => {
    const students = Array.from({ length: 11 }, (_, index) => ({
      id: `u-${index}`,
      name: `Студент ${index}`,
    }));
    render(
      <PresentStageSlide
        detail={{ ...DETAIL, typicalErrors: [{ ...DETAIL.typicalErrors[0], studentCount: 11, students }] }}
      />,
    );
    expect(screen.getByText(/и ещё 3/)).toBeInTheDocument();
  });
});
