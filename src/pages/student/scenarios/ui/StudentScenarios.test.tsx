import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Mocked } from "vitest";

import { ApiError, ServerRequiredError } from "@/shared/api";
import type { AssignedScenario, ScenarioRunResult, ScenarioRunView } from "@/shared/api";

import type { StudentScenariosApi } from "../api/scenariosApi";
import { StudentScenarioRunScreen } from "./StudentScenarioRunScreen";
import { StudentScenariosScreen } from "./StudentScenariosScreen";

const RESULT: ScenarioRunResult = {
  score: 85,
  passed: true,
  outcome: "completed",
  outcomeTitle: "Вызов обработан верно",
  wrongAttempts: 1,
  steps: 3,
  durationMs: 125_000,
  finishedAt: "2026-10-20T10:00:00+03:00",
};

const assigned = (overrides: Partial<AssignedScenario> = {}): AssignedScenario => ({
  assignmentId: "asg-1",
  assignmentTitle: "Падение дерева",
  scenarioId: "s-ai-001",
  version: 2,
  title: "Дерево на проезжей части",
  mode: "operator112",
  attempts: 0,
  activeRunId: null,
  ...overrides,
});

const waiting = (overrides: Partial<ScenarioRunView> = {}): ScenarioRunView => ({
  runId: "run-1",
  scenarioId: "s-ai-001",
  version: 2,
  studentId: "u-005",
  status: "waiting",
  outcome: null,
  steps: 0,
  step: { title: "Приём вызова", prompt: "Заявитель сообщает о дереве.", input: null },
  actions: [{ action: "captureCaller", label: "Принять вызов" }],
  ...overrides,
});

const completed = (overrides: Partial<ScenarioRunView> = {}): ScenarioRunView => ({
  runId: "run-1",
  scenarioId: "s-ai-001",
  version: 2,
  studentId: "u-005",
  status: "completed",
  outcome: "completed",
  steps: 1,
  result: RESULT,
  ...overrides,
});

function makeApi(overrides: Partial<StudentScenariosApi> = {}) {
  return {
    list: vi.fn().mockResolvedValue([]),
    start: vi.fn().mockResolvedValue(waiting()),
    get: vi.fn().mockResolvedValue(waiting()),
    act: vi.fn().mockResolvedValue(completed()),
    finish: vi.fn().mockResolvedValue(
      completed({
        status: "aborted",
        outcome: "abandoned",
        result: { ...RESULT, score: 0, passed: false },
      }),
    ),
    ...overrides,
  } as unknown as Mocked<StudentScenariosApi>;
}

describe("StudentScenariosScreen", () => {
  it("карточки: задание, попытки, последний результат словом и кнопка по состоянию", async () => {
    const api = makeApi({
      list: vi.fn().mockResolvedValue([
        assigned(),
        assigned({
          scenarioId: "s-2",
          title: "Пожар на кухне",
          attempts: 2,
          lastResult: RESULT,
        }),
        assigned({ scenarioId: "s-3", title: "ДТП", attempts: 1, activeRunId: "run-9" }),
        assigned({
          scenarioId: "s-4",
          title: "Запах газа",
          attempts: 1,
          lastResult: { ...RESULT, passed: false, score: 40 },
        }),
      ]),
    });
    render(<StudentScenariosScreen api={api} />);
    const first = await screen.findByRole("article", { name: "Дерево на проезжей части" });
    expect(within(first).getByText(/Падение дерева/)).toBeInTheDocument();
    expect(within(first).getByRole("link", { name: "Начать" })).toHaveAttribute(
      "href",
      "/student/scenarios/s-ai-001/2",
    );
    const passed = screen.getByRole("article", { name: "Пожар на кухне" });
    expect(within(passed).getByText(/Зачтено/)).toBeInTheDocument();
    expect(within(passed).getByText("85")).toBeInTheDocument();
    expect(within(passed).getByText("02:05", { exact: false })).toBeInTheDocument();
    expect(within(passed).getByRole("link", { name: "Пройти ещё раз" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("article", { name: "ДТП" })).getByRole("link", { name: "Продолжить" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("article", { name: "Запах газа" })).getByText(/Не зачтено/),
    ).toBeInTheDocument();
  });

  it("загрузка, пусто, ошибка с повтором и «нужен сервер»", async () => {
    const list = vi.fn().mockRejectedValueOnce(new ApiError(500, "internal", "Сбой списка"));
    list.mockResolvedValueOnce([]);
    const api = makeApi({ list });
    render(<StudentScenariosScreen api={api} />);
    expect(screen.getByRole("status", { name: "Загрузка…" })).toBeInTheDocument();
    expect(await screen.findByText("Сбой списка")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByText("Сценариев пока нет")).toBeInTheDocument();
  });

  it("без бэкенда показывает «требуется сервер»", async () => {
    const api = makeApi({ list: vi.fn().mockRejectedValue(new ServerRequiredError()) });
    render(<StudentScenariosScreen api={api} />);
    expect(await screen.findByText(/требует подключения к серверу/)).toBeInTheDocument();
  });
});

describe("StudentScenarioRunScreen", () => {
  it("запускает прогон при входе, шаг → действие → результат", async () => {
    const api = makeApi();
    render(<StudentScenarioRunScreen scenarioId="s-ai-001" version={2} api={api} />);
    const heading = await screen.findByRole("heading", { name: "Приём вызова" });
    expect(api.start).toHaveBeenCalledWith("s-ai-001", 2, expect.anything());
    expect(screen.getByText("Заявитель сообщает о дереве.")).toBeInTheDocument();
    await waitFor(() => expect(heading).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "Принять вызов" }));
    await waitFor(() =>
      expect(api.act).toHaveBeenCalledWith("run-1", { action: "captureCaller", expectedSteps: 0 }),
    );
    expect(await screen.findByText("Вызов обработан верно")).toBeInTheDocument();
    expect(screen.getByText("85")).toBeInTheDocument();
    expect(screen.getByText(/из 100/)).toBeInTheDocument();
    expect(screen.getByText(/Зачтено/)).toBeInTheDocument();
    expect(screen.getByText("02:05")).toBeInTheDocument();
    expect(screen.getByText("Неверных действий").nextSibling).toHaveTextContent("1");
    expect(screen.getByRole("link", { name: "К списку сценариев" })).toHaveAttribute(
      "href",
      "/student/scenarios",
    );
  });

  it("неверное действие: сообщение в aria-live, состояние перечитано, шаг не изменился", async () => {
    const api = makeApi({
      act: vi
        .fn()
        .mockRejectedValue(new ApiError(409, "conflict", "Действие не соответствует текущему шагу сценария")),
    });
    render(<StudentScenarioRunScreen scenarioId="s-ai-001" version={2} api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Принять вызов" }));
    const live = await screen.findByText(/Это действие не подходит к текущему шагу\. Попробуйте другое\./);
    expect(live.closest("[aria-live]")).not.toBeNull();
    expect(screen.getByText(/учитывается в итоговом балле/)).toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("run-1"));
    expect(screen.getByRole("heading", { name: "Приём вызова" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Принять вызов" })).toBeEnabled();
  });

  it("устаревшее состояние (409) показывает сообщение сервера и перечитывает прогон", async () => {
    const api = makeApi({
      act: vi
        .fn()
        .mockRejectedValue(new ApiError(409, "conflict", "Состояние прогона изменилось, обновите страницу")),
      get: vi
        .fn()
        .mockResolvedValue(waiting({ steps: 1, step: { title: "Второй шаг", prompt: null, input: null } })),
    });
    render(<StudentScenarioRunScreen scenarioId="s-ai-001" version={2} api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Принять вызов" }));
    expect(await screen.findByText(/Состояние прогона изменилось/)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Второй шаг" })).toBeInTheDocument();
    expect(screen.queryByText(/учитывается в итоговом балле/)).not.toBeInTheDocument();
  });

  it("шаг с input: без выбора действие недоступно, с выбором уходит choice", async () => {
    const step = {
      title: "Тип происшествия",
      prompt: "Уточните.",
      input: {
        options: [
          { value: "tree", label: "Дерево" },
          { value: "fire", label: "Пожар" },
        ],
      },
    };
    const api = makeApi({
      start: vi.fn().mockResolvedValue(waiting({ step })),
    });
    render(<StudentScenarioRunScreen scenarioId="s-ai-001" version={2} api={api} />);
    const group = await screen.findByRole("group", { name: "Выберите вариант" });
    const submit = screen.getByRole("button", { name: "Принять вызов" });
    expect(submit).toBeDisabled();
    expect(screen.getByText("Сначала выберите вариант.")).toBeInTheDocument();
    fireEvent.click(within(group).getByRole("radio", { name: "Пожар" }));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() =>
      expect(api.act).toHaveBeenCalledWith("run-1", {
        action: "captureCaller",
        expectedSteps: 0,
        choice: "fire",
      }),
    );
  });

  it("прерывание требует подтверждения; после — результат 0 баллов, «Не зачтено»", async () => {
    const api = makeApi();
    render(<StudentScenarioRunScreen scenarioId="s-ai-001" version={2} api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Прервать прохождение" }));
    const dialog = screen.getByRole("alertdialog", { name: "Подтверждение прерывания" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Отмена" }));
    expect(api.finish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Прервать прохождение" }));
    fireEvent.click(screen.getByRole("button", { name: "Да, прервать" }));
    await waitFor(() => expect(api.finish).toHaveBeenCalledWith("run-1"));
    expect(await screen.findByText(/Прохождение прервано/)).toBeInTheDocument();
    expect(screen.getByText(/Не зачтено/)).toBeInTheDocument();
  });

  it("«Пройти ещё раз» запускает новый прогон", async () => {
    const api = makeApi({
      start: vi
        .fn()
        .mockResolvedValueOnce(completed())
        .mockResolvedValueOnce(waiting({ runId: "run-2" })),
    });
    render(<StudentScenarioRunScreen scenarioId="s-ai-001" version={2} api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Пройти ещё раз" }));
    expect(await screen.findByRole("heading", { name: "Приём вызова" })).toBeInTheDocument();
    expect(api.start).toHaveBeenCalledTimes(2);
  });

  it("ошибка запуска показывается с «Повторить»; повтор открывает шаг", async () => {
    const start = vi.fn().mockRejectedValueOnce(new ApiError(403, "forbidden", "Сценарий вам не назначен"));
    start.mockResolvedValue(waiting());
    render(<StudentScenarioRunScreen scenarioId="s-ai-001" version={2} api={makeApi({ start })} />);
    expect(await screen.findByText("Сценарий вам не назначен")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByRole("heading", { name: "Приём вызова" })).toBeInTheDocument();
  });

  it("сбой действия (не 409) показывает текст сервера, шаг остаётся; без бэкенда — «нужен сервер»", async () => {
    const api = makeApi({
      act: vi.fn().mockRejectedValue(new ApiError(400, "badRequest", "Недопустимый вариант")),
    });
    const first = render(<StudentScenarioRunScreen scenarioId="s-ai-001" version={2} api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Принять вызов" }));
    expect(await screen.findByText("Недопустимый вариант")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
    first.unmount();

    render(
      <StudentScenarioRunScreen
        scenarioId="s-ai-001"
        version={2}
        api={makeApi({ start: vi.fn().mockRejectedValue(new ServerRequiredError()) })}
      />,
    );
    expect(await screen.findByText(/требует подключения к серверу/)).toBeInTheDocument();
  });

  it("некорректный номер версии не запускает прогон", () => {
    const api = makeApi();
    render(<StudentScenarioRunScreen scenarioId="s-ai-001" version={Number.NaN} api={api} />);
    expect(screen.getByText("Некорректная версия сценария")).toBeInTheDocument();
    expect(api.start).not.toHaveBeenCalled();
  });
});
