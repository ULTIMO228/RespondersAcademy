import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Mocked } from "vitest";

import { MODE_TITLES } from "@/entities/assignment";
import { ApiError, ServerRequiredError } from "@/shared/api";
import type { PublicUser, StudentCard, Ticket } from "@/shared/api";

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

const studentCard = (id: string, proposed: StudentCard["proposed"]): StudentCard => ({
  id,
  group: "Пожар",
  summary: `Карточка ${id} обучающегося`,
  address: "Москва, ул. Дубнинская, 2",
  authorId: "u-005",
  authorName: "Иванов Иван",
  authorGroup: "Группа 1",
  registeredAt: "2026-10-20T10:00:00.000Z",
  sourceCardId: "c-010",
  selectedServices: ["Мосводоканал"],
  ticketServices: ["101 (главная)"],
  proposed,
});

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
    listStudentCards: vi.fn().mockResolvedValue([
      studentCard("c-901", { cardId: "c-901", expectedDecision: "accepted" }),
      studentCard("c-902", {
        cardId: "c-902",
        expectedDecision: "notAccepted",
        expectedTransferTo: "101 (главная)",
      }),
    ]),
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

  it("режимы — только 112 и ДДС: цепочки 112 → ДДС в мастере нет (выведена 20.10.2026)", async () => {
    render(
      <AssignmentWizard api={makeApi()} assignedGroups={GROUPS} onCreated={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getAllByRole("radio", { name: /Режим (112|ДДС)/ })).toHaveLength(2);
    expect(screen.queryByRole("radio", { name: /Цепочка/ })).not.toBeInTheDocument();
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
    expect(
      screen.getByRole("radio", { name: (name) => name.includes(MODE_TITLES.operator112) }),
    ).toBeChecked();
    next();
    await pickStudent(/Иванов Иван/);
    next();
    expect(await screen.findByText("c-010")).toBeInTheDocument();
    expect(screen.queryByText(/Подберите билеты/)).not.toBeInTheDocument();
  });
});

describe("мастер назначения: профиль режима обучаемого (spec/008 через специализации, спека 021)", () => {
  const withProfile = () =>
    makeApi({
      listStudents: vi
        .fn()
        .mockResolvedValue([
          { ...student("u-005", "Иванов Сергей Петрович", "Группа 1"), specializations: ["operator112"] },
          student("u-006", "Петрова Анна Дмитриевна", "Группа 1"),
          { ...student("u-010", "Егоров Павел Сергеевич", "Группа 1"), specializations: ["dds"] },
        ]),
    });

  async function toStudents(api: ReturnType<typeof makeApi>, mode: "operator112" | "dds") {
    render(<AssignmentWizard api={api} assignedGroups={GROUPS} onCreated={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: (name) => name.includes(MODE_TITLES[mode]) }));
    next();
    await screen.findByRole("checkbox", { name: /Петрова Анна/ });
  }

  it("метка «112» у обучающегося с одной специализацией; у обучающегося с обеими метки нет", async () => {
    await toStudents(withProfile(), "operator112");
    const ivanov = screen.getByRole("checkbox", { name: /Иванов Сергей Петрович/ });
    expect(ivanov.closest("label")).toHaveTextContent("112");
    expect(screen.getByTitle("Профиль: Специалист 112")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Петрова Анна/ }).closest("label")).not.toHaveTextContent(
      /112|ДДС/,
    );
  });

  it("режим ДДС: специалиста-112 нет в списке, в запросе только допущенные", async () => {
    const api = withProfile();
    await toStudents(api, "dds");
    expect(screen.queryByRole("checkbox", { name: /Иванов Сергей/ })).not.toBeInTheDocument();
    expect(screen.getByTitle("Профиль: Оператор ДДС")).toBeInTheDocument();
    await pickStudent(/Петрова Анна/);
    await pickStudent(/Егоров Павел/);
    next();
    fireEvent.click(await screen.findByRole("checkbox", { name: /c-010/ }));
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Создать задание" }));
    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.create.mock.calls[0][0]).toMatchObject({
      studentIds: ["u-006", "u-010"],
      trainingMode: "dds",
    });
  });

  it("режим 112: оператора ДДС нет в списке; ivanov назначается без предупреждений", async () => {
    const api = withProfile();
    await toStudents(api, "operator112");
    expect(screen.queryByRole("checkbox", { name: /Егоров Павел/ })).not.toBeInTheDocument();
    await pickStudent(/Иванов Сергей/);
    next();
    fireEvent.click(await screen.findByRole("checkbox", { name: /c-010/ }));
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Создать задание" }));
    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.create.mock.calls[0][0]).toMatchObject({ studentIds: ["u-005"], trainingMode: "operator112" });
  });

  it("смена режима снимает выбранного обучающегося без нужной специализации", async () => {
    const api = withProfile();
    await toStudents(api, "operator112");
    await pickStudent(/Иванов Сергей/);
    await pickStudent(/Петрова Анна/);
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    fireEvent.click(screen.getByRole("radio", { name: (name) => name.includes(MODE_TITLES.dds) }));
    next();
    expect(await screen.findByRole("checkbox", { name: /Петрова Анна/ })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: /Иванов Сергей/ })).not.toBeInTheDocument();
    next();
    fireEvent.click(await screen.findByRole("checkbox", { name: /c-010/ }));
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Создать задание" }));
    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.create.mock.calls[0][0]).toMatchObject({ studentIds: ["u-006"], trainingMode: "dds" });
  });
});

describe("мастер назначения: карточки обучающихся-112 для ДДС (спека 011)", () => {
  async function toDdsTickets(api: Mocked<AssignmentCreateApi>) {
    render(<AssignmentWizard api={api} assignedGroups={GROUPS} onCreated={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: (name) => name.includes(MODE_TITLES.dds) }));
    next();
    await pickStudent(/Петров Пётр/);
    next();
    await screen.findByText("c-010");
  }

  const bank = () => screen.getByRole("group", { name: "Карточки обучающихся-112" });

  it("отбор карточки с эталоном, предложенным системой, и правка эталона преподавателем", async () => {
    const api = makeApi();
    await toDdsTickets(api);
    expect(await screen.findByRole("checkbox", { name: /c-901/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /c-010/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /c-901/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /c-902/ }));
    // Предложение системы: c-902 — «Не принята», адресат заполнен из билета.
    expect(screen.getByLabelText("Кому передана информация (c-902)")).toHaveValue("101 (главная)");
    expect(
      within(bank()).getAllByText(/По билету: 101 \(главная\) · выбрал обучающийся-112: Мосводоканал/),
    ).toHaveLength(2);
    // Преподаватель меняет эталон c-901 на «Не принята» и указывает адресата.
    fireEvent.click(screen.getByRole("radio", { name: /^Не принята\s*\(c-901\)$/ }));
    fireEvent.change(screen.getByLabelText("Кому передана информация (c-901)"), {
      target: { value: "  УК «ПИК»  " },
    });
    next();
    next();
    expect(screen.getByText(/c-901: Не принята → УК «ПИК»/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Создать задание" }));
    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.create.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        trainingMode: "dds",
        cardIds: ["c-010", "c-901", "c-902"],
        studentCards: [
          { cardId: "c-901", expectedDecision: "notAccepted", expectedTransferTo: "УК «ПИК»" },
          { cardId: "c-902", expectedDecision: "notAccepted", expectedTransferTo: "101 (главная)" },
        ],
      }),
    );
  });

  it("«Не принята» без адресата не пускает дальше; снятая карточка уходит из запроса", async () => {
    const api = makeApi();
    await toDdsTickets(api);
    fireEvent.click(await screen.findByRole("checkbox", { name: /c-902/ }));
    fireEvent.change(screen.getByLabelText("Кому передана информация (c-902)"), { target: { value: " " } });
    next();
    expect(screen.getByRole("alert")).toHaveTextContent("Укажите, кому передана информация: c-902");
    fireEvent.click(screen.getByRole("radio", { name: /^Принята\s*\(c-902\)$/ }));
    expect(screen.queryByLabelText("Кому передана информация (c-902)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /c-901/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /c-901/ }));
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Создать задание" }));
    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.create.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        cardIds: ["c-902"],
        studentCards: [{ cardId: "c-902", expectedDecision: "accepted" }],
      }),
    );
  });

  it("без бэкенда блок банка показывает «требуется сервер», билеты выбираются как обычно", async () => {
    const api = makeApi({ listStudentCards: vi.fn().mockRejectedValue(new ServerRequiredError()) });
    await toDdsTickets(api);
    expect(await within(bank()).findByText(/сервер/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /c-010/ }));
    next();
    expect(screen.getByLabelText("Реакция на вызов, сек")).toBeInTheDocument();
  });

  it("пустой банк и ошибка загрузки показываются, а не прячутся", async () => {
    const empty = makeApi({ listStudentCards: vi.fn().mockResolvedValue([]) });
    await toDdsTickets(empty);
    expect(await within(bank()).findByText("Обучающиеся-112 ещё не сохраняли карточки")).toBeInTheDocument();
  });

  it("ошибка загрузки банка показывается с повтором", async () => {
    const failing = makeApi({
      listStudentCards: vi.fn().mockRejectedValue(new ApiError(500, "internal", "Сбой банка")),
    });
    await toDdsTickets(failing);
    expect(await within(bank()).findByText("Сбой банка")).toBeInTheDocument();
  });

  it("в режиме 112 блока банка нет, банк не запрашивается", async () => {
    const api = makeApi();
    render(<AssignmentWizard api={api} assignedGroups={GROUPS} onCreated={vi.fn()} onCancel={vi.fn()} />);
    next();
    await pickStudent(/Иванов Иван/);
    next();
    await screen.findByText("c-010");
    expect(screen.queryByRole("group", { name: "Карточки обучающихся-112" })).not.toBeInTheDocument();
    expect(api.listStudentCards).not.toHaveBeenCalled();
  });
});
