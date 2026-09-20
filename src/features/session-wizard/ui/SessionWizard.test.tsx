import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { cards, reference, scenarios, sessions, users } from "@/shared/api";
import type { IncidentCard, PublicUser, Scenario, SessionContract } from "@/shared/api";

import { createWizardFakeApi } from "../lib/wizardFakeApi.testing";
import type { WizardFakeApi } from "../lib/wizardFakeApi.testing";
import { SessionWizard } from "./SessionWizard";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

const TEACHER_ID = "u-002";
const GAS_GROUP = "Запах газа в помещении (в доме, в квартире)";
const DTP_GROUP = "Дорожно-транспортные происшествия с пострадавшими";
/** Сценарий с карточкой группы ДТП (s-032 «ДТП с разливом топлива», демо-путь). */
const DTP_SCENARIO = "s-032";

type Overrides = { sessions?: readonly SessionContract[]; cards?: readonly IncidentCard[] };

async function renderWizard(overrides: Overrides = {}): Promise<WizardFakeApi> {
  const fake = createWizardFakeApi({
    users: users as PublicUser[],
    cards: overrides.cards ?? (cards as IncidentCard[]),
    scenarios: scenarios as Scenario[],
    sessions: overrides.sessions ?? (sessions as SessionContract[]),
    reference,
  });
  render(<SessionWizard teacherId={TEACHER_ID} api={fake.api} />);
  await screen.findByRole("heading", { name: "Группа" });
  return fake;
}

function checkbox(name: RegExp | string) {
  return screen.getByRole("checkbox", { name });
}

/** Чекбокс группы ЕКП шага «Категории событий» (точное совпадение доступного имени). */
function category(group: string) {
  return screen.getByRole("checkbox", { name: group });
}

/** Выбор курсанта и сценария — минимум для активного старта. */
async function selectMinimum(): Promise<void> {
  fireEvent.click(checkbox(/Иванов Сергей Петрович/));
  fireEvent.click(category(DTP_GROUP));
  await waitFor(() => expect(screen.getByRole("table", { name: "Подходящие сценарии" })).toBeVisible());
  const table = screen.getByRole("table", { name: "Подходящие сценарии" });
  fireEvent.click(within(table).getAllByRole("checkbox")[0]);
}

describe("Мастер занятия: данные мок-слоя (T3.2-01, T3.2-03)", () => {
  it("восемь секций на одном экране, курсанты группы с № АРМ", async () => {
    await renderWizard();
    [
      "Группа",
      "Категории событий",
      "Категория вопросов",
      "Сценарии",
      "Режим",
      "Тайминги и критерии",
      "Поток карточек",
      "Старт",
    ].forEach((title) => expect(screen.getByRole("heading", { name: title })).toBeInTheDocument());
    expect(screen.getByText("Иванов Сергей Петрович")).toBeInTheDocument();
    expect(screen.getByText("АРМ 1")).toBeInTheDocument();
  });

  it("неподключённый курсант — «не подключён», выбор заблокирован", async () => {
    await renderWizard();
    // u-010 Егоров Павел Сергеевич — isActive: false в users.json.
    expect(checkbox(/Егоров Павел Сергеевич/)).toBeDisabled();
    expect(screen.getByText("не подключён")).toBeInTheDocument();
  });
});

describe("Категории и профильное предупреждение (T3.2-04)", () => {
  it("категории вне профиля «Мосгаз» дают предупреждение по курсанту", async () => {
    await renderWizard();
    fireEvent.click(checkbox(/Васильева Ольга Николаевна/));
    fireEvent.click(category(DTP_GROUP));
    expect(screen.getByRole("alert")).toHaveTextContent("Васильева Ольга Николаевна");
    expect(screen.getByRole("alert")).toHaveTextContent("Мосгаз (учебный профиль)");
  });

  it("профильная категория предупреждение снимает", async () => {
    await renderWizard();
    fireEvent.click(checkbox(/Васильева Ольга Николаевна/));
    fireEvent.click(category(GAS_GROUP));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Категория вопросов (T3.2-05)", () => {
  it("три режима; studentCreated показывает размер пула и автора карточки", async () => {
    await renderWizard();
    ["сгенерированные системой", "сформированные обучающимися", "смешанный выбор"].forEach((title) =>
      expect(screen.getByText(title)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByLabelText(/сформированные обучающимися/));
    const pool = screen.getByRole("region", { name: "Пул карточек обучающихся" });
    expect(pool).toHaveTextContent("Петрова Анна Дмитриевна");
    expect(within(pool).getAllByRole("row").length).toBeGreaterThan(1);
  });

  it("пустой пул: режим недоступен с понятным пояснением", async () => {
    await renderWizard({ sessions: [], cards: (cards as IncidentCard[]).map((card) => ({ ...card })) });
    expect(screen.getByLabelText(/сформированные обучающимися/)).toBeDisabled();
    expect(screen.getAllByText(/пул пуст/)[0]).toBeInTheDocument();
  });
});

describe("Сценарии, режим, тайминги, поток (T3.2-06…T3.2-09)", () => {
  it("в списке только approved-сценарии выбранных категорий; adaptive — порядок по умолчанию", async () => {
    await renderWizard();
    fireEvent.click(category(DTP_GROUP));
    const table = screen.getByRole("table", { name: "Подходящие сценарии" });
    const nonApproved = (scenarios as Scenario[]).filter(
      (scenario) => scenario.validation.status !== "approved",
    );
    nonApproved.forEach((scenario) => expect(within(table).queryByText(scenario.title)).toBeNull());
    expect(screen.getByRole("radio", { name: /adaptive/ })).toBeChecked();
  });

  it("ручной порядок: перестановка выбранного сценария сохраняется", async () => {
    await renderWizard();
    fireEvent.click(category(DTP_GROUP));
    fireEvent.click(screen.getByRole("radio", { name: /ручной/ }));
    const table = screen.getByRole("table", { name: "Подходящие сценарии" });
    const boxes = within(table).getAllByRole("checkbox");
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    const second = within(table).getAllByRole("row")[2];
    fireEvent.click(within(second).getByRole("button", { name: /Выдавать раньше/ }));
    expect(within(second).getByRole("cell", { name: /1/ })).toBeInTheDocument();
  });

  it("режимы занятия и тумблер подсказок", async () => {
    await renderWizard();
    expect(screen.getByText("demo — показ")).toBeInTheDocument();
    expect(screen.getByText("follow — делай как я")).toBeInTheDocument();
    expect(screen.getByText("practice — самостоятельная")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Подсказки/ })).toBeInTheDocument();
  });

  it("два раздельных норматива 30/180 и переопределение", async () => {
    await renderWizard();
    const reaction = screen.getByLabelText("Норматив первичной реакции, сек");
    const processing = screen.getByLabelText("Норматив полной отработки, сек");
    expect(reaction).toHaveValue(30);
    expect(processing).toHaveValue(180);
    expect(screen.getByText(/Два раздельных норматива/)).toBeInTheDocument();
    fireEvent.change(reaction, { target: { value: "45" } });
    expect(screen.getByLabelText("Норматив первичной реакции, сек")).toHaveValue(45);
  });

  it("нормативы не принимают значение ≤ 0 — поле с пояснением", async () => {
    await renderWizard();
    const reaction = screen.getByLabelText("Норматив первичной реакции, сек");
    fireEvent.change(reaction, { target: { value: "0" } });
    expect(screen.getAllByText("Норматив в секундах, больше 0").length).toBeGreaterThan(0);
    fireEvent.change(reaction, { target: { value: "20" } });
    expect(screen.queryByText("Норматив в секундах, больше 0")).toBeNull();
  });

  it("темп выдачи и бесконечный конвейер", async () => {
    await renderWizard();
    const pace = screen.getByLabelText(/Новая карточка через N сек/);
    fireEvent.change(pace, { target: { value: "60" } });
    expect(screen.getByLabelText(/Новая карточка через N сек/)).toHaveValue(60);
    expect(screen.getByRole("switch", { name: /Бесконечный конвейер/ })).toBeInTheDocument();
  });
});

describe("Старт занятия (T3.2-10)", () => {
  it("без выбора кнопка неактивна с пояснением", async () => {
    await renderWizard();
    expect(screen.getByRole("button", { name: "Начать занятие" })).toBeDisabled();
    expect(screen.getByText("Выберите курсантов и сценарии")).toBeInTheDocument();
    fireEvent.click(checkbox(/Иванов Сергей Петрович/));
    expect(screen.getByText("Выберите сценарии занятия")).toBeInTheDocument();
  });

  it("настройка → POST /sessions с планом мастера → start → переход на /teacher", async () => {
    const fake = await renderWizard();
    await selectMinimum();
    fireEvent.change(screen.getByLabelText(/Новая карточка через N сек/), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("switch", { name: /Бесконечный конвейер/ }));
    fireEvent.click(screen.getByRole("radio", { name: /follow/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Подсказки/ }));
    const start = screen.getByRole("button", { name: "Начать занятие" });
    expect(start).toBeEnabled();
    fireEvent.click(start);
    await waitFor(() => expect(fake.calls.started).toHaveLength(1));
    const [request] = fake.calls.created;
    expect(request).toMatchObject({
      teacherId: TEACHER_ID,
      studentIds: ["u-005"],
      mode: "follow",
      cardSource: "generated",
    });
    expect(request.scenarioIds.length).toBeGreaterThan(0);
    expect(request.plan).toMatchObject({
      categories: [DTP_GROUP],
      issueOrder: "adaptive",
      paceSec: 60,
      conveyor: true,
      hints: true,
      timeNorms: { primaryReactionSec: 30, fullProcessingSec: 180 },
    });
    expect(pushMock).toHaveBeenCalledWith("/teacher");
  });

  it("демо-путь: сценарий s-032 доступен в списке категории ДТП", async () => {
    await renderWizard();
    fireEvent.click(category(DTP_GROUP));
    const table = screen.getByRole("table", { name: "Подходящие сценарии" });
    const demo = (scenarios as Scenario[]).find((scenario) => scenario.id === DTP_SCENARIO);
    expect(within(table).getByText(demo?.title ?? "")).toBeInTheDocument();
  });
});
