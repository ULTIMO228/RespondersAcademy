import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Mocked } from "vitest";

import { MODE_TITLES } from "@/entities/assignment";
import { ApiError } from "@/shared/api";
import type { PublicUser, Ticket } from "@/shared/api";

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
    await screen.findByText("Иванов Иван");
    expect(screen.queryByText(/Заблокированный/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Чужой/)).not.toBeInTheDocument();
    next();
    expect(screen.getByRole("alert")).toHaveTextContent("Выберите хотя бы одного обучающегося");
    expect(screen.getByRole("heading", { name: "Обучающиеся" })).toBeInTheDocument();
  });

  it("шаг 1: без закреплённых групп обучающихся нет", async () => {
    render(<AssignmentWizard api={makeApi()} onCreated={vi.fn()} onCancel={vi.fn()} />);
    expect(await screen.findByText("Нет доступных обучающихся")).toBeInTheDocument();
    expect(screen.queryByText("Иванов Иван")).not.toBeInTheDocument();
  });

  it("полный путь: обучающийся → режим → билеты → параметры → создание", async () => {
    const api = makeApi();
    const onCreated = vi.fn();
    render(<AssignmentWizard api={api} assignedGroups={GROUPS} onCreated={onCreated} onCancel={vi.fn()} />);
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
    render(<AssignmentWizard api={api} assignedGroups={GROUPS} onCreated={vi.fn()} onCancel={vi.fn()} />);
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
    render(
      <AssignmentWizard
        api={makeApi({ create })}
        assignedGroups={GROUPS}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
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

  it("режимы — только 112 и ДДС: цепочки 112 → ДДС в мастере нет (выведена 20.10.2026)", async () => {
    render(
      <AssignmentWizard api={makeApi()} assignedGroups={GROUPS} onCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    await pickStudent(/Иванов Иван/);
    next();
    expect(screen.getAllByRole("radio", { name: /Режим (112|ДДС)/ })).toHaveLength(2);
    expect(screen.queryByRole("radio", { name: /Цепочка/ })).not.toBeInTheDocument();
  });

  it("Отмена вызывает onCancel; «Назад» возвращает к прошлому шагу с сохранённым выбором", async () => {
    const onCancel = vi.fn();
    render(
      <AssignmentWizard api={makeApi()} assignedGroups={GROUPS} onCreated={vi.fn()} onCancel={onCancel} />,
    );
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
    expect(await screen.findByRole("checkbox", { name: /Иванов Иван/ })).toBeChecked();
    expect(screen.queryByText(/Заблокированный/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Чужой/)).not.toBeInTheDocument();
    expect(screen.getByText(/они не выбраны: 3/)).toBeInTheDocument();
    next();
    expect(screen.getByLabelText("Название задания")).toHaveValue("Тренировка: Пожар");
    expect(screen.getByRole("radio", { name: (name) => name.includes(MODE_TITLES.dds) })).toBeChecked();
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
    fireEvent.click(await screen.findByRole("checkbox", { name: /Иванов Иван/ }));
    next();
    expect(await screen.findByRole("heading", { name: "Режим и формат" })).toBeInTheDocument();
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
    await screen.findByRole("checkbox", { name: /Иванов Иван/ });
    next();
    expect(screen.getByLabelText("Название задания")).toHaveValue("я".repeat(120));
  });

  it("без начальных значений: режим оператора 112 по умолчанию, название пустое, подсказки о этапе нет", async () => {
    render(
      <AssignmentWizard api={makeApi()} assignedGroups={GROUPS} onCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    await pickStudent(/Иванов Иван/);
    next();
    expect(screen.getByLabelText("Название задания")).toHaveValue("");
    expect(
      screen.getByRole("radio", { name: (name) => name.includes(MODE_TITLES.operator112) }),
    ).toBeChecked();
    next();
    expect(await screen.findByText("c-010")).toBeInTheDocument();
    expect(screen.queryByText(/Подберите билеты/)).not.toBeInTheDocument();
  });
});

describe("мастер назначения: профиль режима обучаемого (spec/008)", () => {
  const withProfile = () =>
    makeApi({
      listStudents: vi
        .fn()
        .mockResolvedValue([
          { ...student("u-005", "Иванов Сергей Петрович", "Группа 1"), trainingProfile: "operator112" },
          student("u-006", "Петрова Анна Дмитриевна", "Группа 1"),
        ]),
    });

  async function toMode(api: ReturnType<typeof makeApi>, names: RegExp[]) {
    render(<AssignmentWizard api={api} assignedGroups={GROUPS} onCreated={vi.fn()} onCancel={vi.fn()} />);
    for (const name of names) await pickStudent(name);
    next();
  }

  it("метка «112» у курсанта с профилем на шаге «Обучающиеся»", async () => {
    render(
      <AssignmentWizard api={withProfile()} assignedGroups={GROUPS} onCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    const ivanov = await screen.findByRole("checkbox", { name: /Иванов Сергей Петрович/ });
    expect(ivanov.closest("label")).toHaveTextContent("112");
    expect(screen.getByTitle("Профиль: Специалист системы-112")).toBeInTheDocument();
  });

  it("ivanov + petrova → ДДС: предупреждение о пропуске, в запросе только petrova", async () => {
    const api = withProfile();
    await toMode(api, [/Иванов Сергей/, /Петрова Анна/]);
    expect(screen.queryByText(/Пропущены/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: (name) => name.includes(MODE_TITLES.dds) }));
    expect(screen.getByText("Пропущены (профиль специалиста-112): Иванов С. П.")).toBeInTheDocument();
    next();
    fireEvent.click(await screen.findByRole("checkbox", { name: /c-010/ }));
    next();
    next();
    expect(screen.getByText("Петрова Анна Дмитриевна")).toBeInTheDocument();
    expect(screen.getByText("Пропущены (профиль режима)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Создать задание" }));
    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.create.mock.calls[0][0]).toMatchObject({ studentIds: ["u-006"], trainingMode: "dds" });
  });

  it("только ivanov → ДДС: ошибка шага, дальше не пускает", async () => {
    await toMode(withProfile(), [/Иванов Сергей/]);
    fireEvent.click(screen.getByRole("radio", { name: (name) => name.includes(MODE_TITLES.dds) }));
    next();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Нет обучающихся для режима ДДС: у выбранных профиль специалиста-112",
    );
    expect(screen.getByRole("heading", { name: "Режим и формат" })).toBeInTheDocument();
  });

  it("ivanov → 112: попадает в задание без предупреждений", async () => {
    const api = withProfile();
    await toMode(api, [/Иванов Сергей/]);
    expect(screen.queryByText(/Пропущены/)).not.toBeInTheDocument();
    next();
    fireEvent.click(await screen.findByRole("checkbox", { name: /c-010/ }));
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Создать задание" }));
    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.create.mock.calls[0][0]).toMatchObject({ studentIds: ["u-005"], trainingMode: "operator112" });
  });
});
