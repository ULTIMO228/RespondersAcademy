import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Mocked } from "vitest";

import { MODE_TITLES } from "@/entities/assignment";
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
  specializations: ["operator112", "dds"],
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

const GROUPS = ["Группа 1"];

const next = () => fireEvent.click(screen.getByRole("button", { name: "Далее" }));

async function pickStudent(name: RegExp) {
  fireEvent.click(await screen.findByRole("checkbox", { name }));
}

describe("мастер назначения", () => {
  it("шаг 1: без обучающихся дальше не пускает; блокированные и чужие группы не показываются", async () => {
    render(
      <AssignmentWizard api={makeApi()} assignedGroups={GROUPS} onCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    next();
    await screen.findByText("Иванов Иван");
    expect(screen.queryByText(/Заблокированный/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Чужой/)).not.toBeInTheDocument();
    next();
    expect(screen.getByRole("alert")).toHaveTextContent("Выберите хотя бы одного обучающегося");
    expect(screen.getByRole("heading", { name: "Обучающиеся" })).toBeInTheDocument();
  });

  it("шаг 1: без закреплённых групп обучающихся нет", async () => {
    render(<AssignmentWizard api={makeApi()} onCreated={vi.fn()} onCancel={vi.fn()} />);
    next();
    expect(await screen.findByText("Нет доступных обучающихся")).toBeInTheDocument();
    expect(screen.queryByText("Иванов Иван")).not.toBeInTheDocument();
  });

  it("полный путь: режим → подходящий обучающийся → билеты → параметры → создание", async () => {
    const api = makeApi();
    const onCreated = vi.fn();
    render(<AssignmentWizard api={api} assignedGroups={GROUPS} onCreated={onCreated} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Название задания"), { target: { value: "Пожары" } });
    next();
    await pickStudent(/Иванов Иван/);
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
    render(<AssignmentWizard api={api} assignedGroups={GROUPS} onCreated={vi.fn()} onCancel={vi.fn()} />);
    next();
    await pickStudent(/Иванов Иван/);
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
    render(
      <AssignmentWizard
        api={makeApi({ create })}
        assignedGroups={GROUPS}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Экзамен/ }));
    next();
    await pickStudent(/Иванов Иван/);
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
    render(<AssignmentWizard api={api} assignedGroups={GROUPS} onCreated={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /Цепочка/ }));
    next();
    await pickStudent(/Иванов Иван/);
    next();
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
    render(
      <AssignmentWizard api={makeApi()} assignedGroups={GROUPS} onCreated={vi.fn()} onCancel={onCancel} />,
    );
    next();
    await pickStudent(/Петров Пётр/);
    next();
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(await screen.findByRole("checkbox", { name: /Петров Пётр/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("мастер назначения: начальные значения из карты ошибок", () => {
  it("предвыбранные обучающиеся: в черновик попадают только доступные; остальные названы в подсказке", async () => {
    const api = makeApi();
    const onCreated = vi.fn();
    render(
      <AssignmentWizard
        api={api}
        assignedGroups={GROUPS}
        initial={{
          studentIds: ["u-005", "u-007", "u-008", "u-999"],
          trainingMode: "dds",
          title: "Тренировка: Пожар",
        }}
        onCreated={onCreated}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Название задания")).toHaveValue("Тренировка: Пожар");
    expect(screen.getByRole("radio", { name: (name) => name.includes(MODE_TITLES.dds) })).toBeChecked();
    next();
    expect(await screen.findByRole("checkbox", { name: /Иванов Иван/ })).toBeChecked();
    expect(screen.queryByText(/Заблокированный/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Чужой/)).not.toBeInTheDocument();
    expect(screen.getByText(/они не выбраны: 3/)).toBeInTheDocument();
    next();
    fireEvent.click(await screen.findByRole("checkbox", { name: /c-010/ }));
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Создать задание" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "asg-010" }));
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        studentIds: ["u-005"],
        trainingMode: "dds",
        title: "Тренировка: Пожар",
      }),
    );
  });

  it("предвыбран только недоступный обучающийся: выбора нет, «Далее» не пускает дальше шага", async () => {
    render(
      <AssignmentWizard
        api={makeApi()}
        assignedGroups={GROUPS}
        initial={{ studentIds: ["u-008"] }}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    next();
    expect(await screen.findByRole("checkbox", { name: /Иванов Иван/ })).not.toBeChecked();
    next();
    expect(screen.getByRole("alert")).toHaveTextContent("Выберите хотя бы одного обучающегося");
  });

  it("до загрузки списка «Далее» недоступна: черновик не уходит дальше шага с непроверенными id", async () => {
    let resolveStudents: (value: PublicUser[]) => void = () => undefined;
    const listStudents = vi.fn(
      () =>
        new Promise<PublicUser[]>((resolve) => {
          resolveStudents = resolve;
        }),
    );
    render(
      <AssignmentWizard
        api={makeApi({ listStudents })}
        assignedGroups={GROUPS}
        initial={{ studentIds: ["u-005"] }}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    next();
    expect(screen.getByRole("button", { name: "Далее" })).toBeDisabled();
    await act(async () => resolveStudents([student("u-005", "Иванов Иван", "Группа 1")]));
    expect(await screen.findByRole("checkbox", { name: /Иванов Иван/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Далее" })).toBeEnabled();
  });

  it("предвыбранный обучающийся, снятый вручную, не возвращается после «Назад»", async () => {
    render(
      <AssignmentWizard
        api={makeApi()}
        assignedGroups={GROUPS}
        initial={{ studentIds: ["u-005", "u-006"] }}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    next();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Иванов Иван/ }));
    next();
    expect(await screen.findByRole("heading", { name: "Билеты" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(await screen.findByRole("checkbox", { name: /Петров Пётр/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Иванов Иван/ })).not.toBeChecked();
  });

  it("focusStage: на шаге билетов подсказка подобрать билеты на тему этапа; билеты сами не выбираются", async () => {
    render(
      <AssignmentWizard
        api={makeApi()}
        assignedGroups={GROUPS}
        initial={{ studentIds: ["u-005"], trainingMode: "dds" }}
        focusStage="Пожар"
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    next();
    await screen.findByRole("checkbox", { name: /Иванов Иван/ });
    next();
    next();
    expect(await screen.findByText("Подберите билеты на тему «Пожар»")).toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: /c-010/ })).not.toBeChecked();
  });

  it("название из карты ограничивается 120 символами", async () => {
    render(
      <AssignmentWizard
        api={makeApi()}
        assignedGroups={GROUPS}
        initial={{ studentIds: ["u-005"], title: "я".repeat(150) }}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Название задания")).toHaveValue("я".repeat(120));
    next();
    await screen.findByRole("checkbox", { name: /Иванов Иван/ });
  });

  it("без начальных значений: режим оператора 112 по умолчанию, название пустое, подсказки о этапе нет", async () => {
    render(
      <AssignmentWizard api={makeApi()} assignedGroups={GROUPS} onCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByLabelText("Название задания")).toHaveValue("");
    expect(screen.getByRole("radio", { name: (name) => name.includes(MODE_TITLES.operator112) })).toBeChecked();
    next();
    await pickStudent(/Иванов Иван/);
    next();
    expect(await screen.findByText("c-010")).toBeInTheDocument();
    expect(screen.queryByText(/Подберите билеты/)).not.toBeInTheDocument();
  });
});
