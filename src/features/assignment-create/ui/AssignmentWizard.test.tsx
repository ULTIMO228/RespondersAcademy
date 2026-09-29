import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Mocked } from "vitest";

import { ApiError } from "@/shared/api";
import type { AIScenarioVersion, PublicUser, Scenario, Ticket } from "@/shared/api";

import type { AssignmentCreateApi } from "../api/assignmentCreateApi";
import { AssignmentWizard } from "./AssignmentWizard";

const student = (id: string, fullName: string, group: string, isActive = true): PublicUser => ({
  id,
  login: id,
  fullName,
  role: "student",
  armNumber: 1,
  isActive,
  group,
});

const ticket = (id: string, group: string, approved = true): Ticket =>
  ({
    id,
    group,
    summary: `Фабула ${id}`,
    address: "Москва",
    difficulty: 2,
    approved,
    modeOrigin: "seed",
  }) as unknown as Ticket;

const version = (approval: AIScenarioVersion["approval"], number: number): AIScenarioVersion =>
  ({
    scenarioId: "sc-1",
    version: number,
    mode: "operator112",
    approval,
    cardSnapshot: { id: "c-500", fields: {} },
  }) as unknown as AIScenarioVersion;

function makeApi(overrides: Partial<AssignmentCreateApi> = {}) {
  const api = {
    listStudents: vi
      .fn()
      .mockResolvedValue([
        student("u-005", "Иванов Иван", "Группа 1"),
        student("u-006", "Петров Пётр", "Группа 1"),
        student("u-007", "Заблокированный Б.", "Группа 1", false),
        student("u-008", "Чужой Ч.", "Группа 9"),
      ]),
    listTickets: vi
      .fn()
      .mockResolvedValue([ticket("c-010", "Пожар"), ticket("c-020", "ДТП"), ticket("c-030", "Пожар", false)]),
    listIncidentGroups: vi.fn().mockResolvedValue(["Пожар", "ДТП"]),
    listScenarios: vi.fn().mockResolvedValue([{ id: "sc-1", title: "Сценарий один" } as Scenario]),
    listScenarioVersions: vi.fn().mockResolvedValue([version("approved", 2), version("pending_review", 3)]),
    create: vi.fn().mockResolvedValue({ id: "asg-010" }),
    ...overrides,
  };
  return api as unknown as Mocked<AssignmentCreateApi>;
}

const next = () => fireEvent.click(screen.getByRole("button", { name: "Далее" }));

async function pickStudent(name: RegExp) {
  fireEvent.click(await screen.findByRole("checkbox", { name }));
}

describe("мастер назначения", () => {
  it("шаг 1: без обучающихся дальше не пускает; блокированные и чужие группы не показываются", async () => {
    render(
      <AssignmentWizard
        api={makeApi()}
        assignedGroups={["Группа 1"]}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await screen.findByText("Иванов Иван");
    expect(screen.queryByText(/Заблокированный/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Чужой/)).not.toBeInTheDocument();
    next();
    expect(screen.getByRole("alert")).toHaveTextContent("Выберите хотя бы одного обучающегося");
    expect(screen.getByRole("heading", { name: "Обучающиеся" })).toBeInTheDocument();
  });

  it("полный путь: обучающийся → режим → билеты → параметры → создание", async () => {
    const api = makeApi();
    const onCreated = vi.fn();
    render(<AssignmentWizard api={api} onCreated={onCreated} onCancel={vi.fn()} />);
    await pickStudent(/Иванов Иван/);
    next();
    fireEvent.change(screen.getByLabelText("Название задания"), { target: { value: "Пожары" } });
    next();
    // Только утверждённые билеты
    expect(await screen.findByText("c-010")).toBeInTheDocument();
    expect(screen.queryByText("c-030")).not.toBeInTheDocument();
    next();
    expect(screen.getByRole("alert")).toHaveTextContent("Выберите хотя бы один билет");
    fireEvent.click(screen.getByRole("checkbox", { name: /c-010/ }));
    next();
    fireEvent.change(screen.getByLabelText("Реакция на вызов, сек"), { target: { value: "0" } });
    next();
    expect(screen.getByText(/Норматив ответа/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Реакция на вызов, сек"), { target: { value: "30" } });
    next();
    expect(screen.getByRole("heading", { name: "Проверка и создание" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Создать задание" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "asg-010" }));
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        studentIds: ["u-005"],
        trainingMode: "operator112",
        format: "training",
        cardIds: ["c-010"],
        title: "Пожары",
      }),
    );
    expect(api.create.mock.calls[0][0]).not.toHaveProperty("randomRule");
  });

  it("случайный набор: ровно один источник — randomRule без cardIds; количество 1–100", async () => {
    const api = makeApi();
    render(<AssignmentWizard api={api} onCreated={vi.fn()} onCancel={vi.fn()} />);
    await pickStudent(/Иванов Иван/);
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Случайный набор" }));
    fireEvent.change(await screen.findByLabelText("Количество билетов"), { target: { value: "101" } });
    next();
    expect(screen.getByText("Количество случайных билетов — от 1 до 100")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Количество билетов"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Пожар" }));
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Создать задание" }));
    await waitFor(() => expect(api.create).toHaveBeenCalled());
    const body = api.create.mock.calls[0][0];
    expect(body.randomRule).toEqual({ groups: ["Пожар"], difficulty: [], count: 2 });
    expect(body).not.toHaveProperty("cardIds");
  });

  it("экзамен: подсказки не настраиваются, есть порог; 400 сервера показывается дословно, введённое сохраняется", async () => {
    const create = vi
      .fn()
      .mockRejectedValue(
        new ApiError(400, "validationFailed", "По правилу найдено билетов: 1, требуется: 5"),
      );
    render(<AssignmentWizard api={makeApi({ create })} onCreated={vi.fn()} onCancel={vi.fn()} />);
    await pickStudent(/Иванов Иван/);
    next();
    fireEvent.click(screen.getByRole("radio", { name: /Экзамен/ }));
    next();
    fireEvent.click(await screen.findByRole("checkbox", { name: /c-010/ }));
    next();
    expect(screen.queryByText("Показывать подсказки обучающемуся")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Порог сдачи/), { target: { value: "150" } });
    next();
    expect(screen.getByText("Порог экзамена — число от 0 до 100")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Порог сдачи/), { target: { value: "80" } });
    next();
    fireEvent.click(screen.getByRole("button", { name: "Создать задание" }));
    expect(await screen.findByText("По правилу найдено билетов: 1, требуется: 5")).toBeInTheDocument();
    expect(create.mock.calls[0][0].params).toMatchObject({ passThreshold: 80, hints: { enabled: false } });
    // Мастер остался на шаге проверки; повторная отправка возможна
    expect(screen.getByRole("button", { name: "Создать задание" })).toBeEnabled();
  });

  it("цепочка: выбираются только утверждённые версии operator112, у каждого билета — своя версия", async () => {
    const api = makeApi();
    render(<AssignmentWizard api={api} onCreated={vi.fn()} onCancel={vi.fn()} />);
    await pickStudent(/Иванов Иван/);
    next();
    fireEvent.click(screen.getByRole("radio", { name: /Цепочка/ }));
    next();
    fireEvent.click(await screen.findByRole("button", { name: "Показать утверждённые версии" }));
    const versionRow = await screen.findByRole("checkbox", { name: /Версия 2/ });
    expect(screen.queryByRole("checkbox", { name: /Версия 3/ })).not.toBeInTheDocument();
    fireEvent.click(versionRow);
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Создать задание" }));
    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.create.mock.calls[0][0]).toMatchObject({
      trainingMode: "chain",
      cardIds: ["c-500"],
      scenarioVersions: [{ scenarioId: "sc-1", version: 2, cardId: "c-500" }],
    });
  });

  it("Отмена вызывает onCancel; «Назад» возвращает к прошлому шагу с сохранённым выбором", async () => {
    const onCancel = vi.fn();
    render(<AssignmentWizard api={makeApi()} onCreated={vi.fn()} onCancel={onCancel} />);
    await pickStudent(/Петров Пётр/);
    next();
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(await screen.findByRole("checkbox", { name: /Петров Пётр/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
