/* Живой режим карточки обучающегося (волна 2, T2.3-03…T2.3-21): controls из pages/incident, API подменён. */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { telephonyStore } from "@/entities/service";
import { armCardFixtures, classifier } from "@/shared/api";
import type * as SharedApi from "@/shared/api";

import type { IncidentCardControls, IncidentCardData } from "../model/types";
import { IncidentCardView } from "./IncidentCardView";

const api = vi.hoisted(() => ({
  getCardSms: vi.fn(),
  postCardSms: vi.fn(),
  getCardRecordings: vi.fn(),
}));
vi.mock("@/shared/api", async (importOriginal) => ({
  ...(await importOriginal<typeof SharedApi>()),
  ...api,
}));

function getFixture(id: string): IncidentCardData {
  const card = armCardFixtures.find((fixture) => fixture.id === id);
  if (!card) throw new Error(id);
  return card;
}

function entriesOf(card: IncidentCardData) {
  const group = classifier.find((entry) => entry.code === card.what.classifierCode)?.group;
  return classifier.filter((entry) => entry.group === group);
}

function createControls(overrides: Partial<IncidentCardControls> = {}): IncidentCardControls {
  return {
    isLocked: false,
    dispatcher: { text: "", dutyNumber: "", onTextChange: vi.fn(), onDutyNumberChange: vi.fn() },
    amend: {
      isActive: false,
      isBlocked: false,
      notice: null,
      description: "",
      onDescriptionChange: vi.fn(),
      onSiteDigits: "",
      onOnSiteChange: vi.fn(),
      onStart: vi.fn(),
      onView: vi.fn(),
      onSave: vi.fn(),
    },
    workLines: {
      extra: [],
      canAdd: true,
      onAdd: vi.fn(async () => undefined),
      buildCallHref: () => "/arm/phone?cardId=card-881412",
      phoneBook: [{ service: "Служба 101", phone: "101" }],
    },
    flags: { canEdit: true, emergency: { chs: false, chp: false }, onToggle: vi.fn() },
    journalExtra: [],
    showSmsPolygon: false,
    ...overrides,
  };
}

function renderLive(
  id: string,
  controls = createControls(),
  extra: { isExceeded?: boolean; reaction?: string } = {},
) {
  const card = getFixture(id);
  render(
    <IncidentCardView
      card={card}
      classifierEntries={entriesOf(card)}
      linkedCards={[]}
      controls={controls}
      isExceeded={extra.isExceeded}
      timerValue={extra.isExceeded ? "3:01" : "0:42"}
      reactionValue={extra.reaction ?? "0:18"}
      serviceNames={["Служба 101", "Служба 102", "Упр. Чертаново Южное"]}
    />,
  );
  return controls;
}

beforeEach(() => {
  api.getCardSms.mockResolvedValue([]);
  api.getCardRecordings.mockResolvedValue([]);
  telephonyStore.setStatus("available");
});

afterEach(() => vi.clearAllMocks());

describe("шапка и телефония (T2.3-02, T2.3-03, T2.3-04)", () => {
  it("статус линии из общего стора; клик переключает стор; 4 подписи", () => {
    renderLive("card-881412");
    const button = screen.getByRole("button", { name: "Статус телефонии: доступен" });
    fireEvent.click(button);
    expect(telephonyStore.getStatus()).toBe("unavailable");
    act(() => telephonyStore.setStatus("error"));
    expect(screen.getByRole("button", { name: "Статус телефонии: ошибка" })).toBeInTheDocument();
    act(() => telephonyStore.setStatus("disconnected"));
    expect(screen.getByRole("button", { name: "Статус телефонии: не подключен" })).toBeInTheDocument();
  });

  it("телефоны в маске, АОН read-only, копирование кладёт номер в буфер обмена; вызов — софтфон с cardId", () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderLive("card-881412");
    const aon = screen.getByLabelText("АОН");
    expect(aon).toHaveValue("+7 (749) 512-34-56");
    expect(aon).toHaveAttribute("readonly");
    expect(screen.getByLabelText("предоставленный")).toHaveValue("+7 (749) 512-34-56");
    expect(screen.getByLabelText("телефон на место")).toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("button", { name: "Копировать АОН" }));
    expect(writeText).toHaveBeenCalledWith("+7 (749) 512-34-56");
    expect(screen.getByRole("link", { name: "Позвонить: АОН" })).toHaveAttribute(
      "href",
      "/arm/phone?cardId=card-881412",
    );
  });

  it("красная шапка при превышении; нарушенная реакция — без галочки", () => {
    renderLive("card-881412", createControls({ isReactionExceeded: true }), {
      isExceeded: true,
      reaction: "0:45",
    });
    expect(screen.getByRole("timer")).toHaveAttribute("data-exceeded", "true");
    expect(screen.getByTestId("card-header").parentElement).toHaveAttribute("data-exceeded", "true");
    expect(screen.getByLabelText("Норматив 30 сек нарушен: 0:45")).toBeInTheDocument();
  });
});

describe("заявитель и флаги (T2.3-05)", () => {
  it("флаги по casualties; ЧС/ЧП переключаются после карандаша, если сценарий разрешает", () => {
    const controls = renderLive("card-36814850");
    expect(screen.getByText("Пострадавшие: да")).toBeInTheDocument();
    const chs = screen.getByRole("button", { name: /ЧС/ });
    expect(chs).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Изменить (Alt + E)" }));
    fireEvent.click(chs);
    expect(controls.flags.onToggle).toHaveBeenCalledWith("chs");
  });

  it("сценарий запрещает редактирование — карандаш disabled", () => {
    renderLive(
      "card-881412",
      createControls({ flags: { canEdit: false, emergency: { chs: false, chp: false }, onToggle: vi.fn() } }),
    );
    expect(screen.getByRole("button", { name: "Изменить (Alt + E)" })).toBeDisabled();
  });
});

describe("адрес (T2.3-06)", () => {
  it("поиск по локальному справочнику и автозаполнение всех полей", () => {
    renderLive("card-36814845");
    fireEvent.click(screen.getByRole("button", { name: /Развернуть адрес/ }));
    const line = screen.getByRole("combobox", { name: "Адрес:" });
    fireEvent.focus(line);
    fireEvent.change(line, { target: { value: "балаклавский" } });
    const option = screen.getByRole("option", { name: /Балаклавский проспект, 5, под\. 3/ });
    fireEvent.mouseDown(option);
    expect(line).toHaveValue("Россия, Москва, (ЮАО, Чертаново Южное), Балаклавский проспект, 5, под. 3");
    expect(screen.getByLabelText("Округ:")).toHaveValue("ЮАО");
    expect(screen.getByLabelText("Улица:")).toHaveValue("Балаклавский проспект");
    expect(screen.getByLabelText("Подъезд:")).toHaveValue("3");
  });

  it("«Указать на карте» ставит отметку и подставляет ближайший адрес; у СМС-карточки — полигон", () => {
    renderLive("card-36814859", createControls({ showSmsPolygon: true }));
    fireEvent.click(screen.getByRole("button", { name: /Развернуть адрес/ }));
    expect(screen.getByTestId("map-polygon")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Указать на карте" }));
    const map = screen.getByRole("img", { name: /Локальная карта/ });
    map.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
    fireEvent.click(map, { clientX: 46, clientY: 69 });
    expect((screen.getByRole("combobox", { name: "Адрес:" }) as HTMLInputElement).value).toContain("Москва");
    expect(screen.getByLabelText("Улица:")).not.toHaveValue("");
  });
});

describe("журнал, дополнение, ВИС (T2.3-07, T2.3-15, T2.3-21)", () => {
  it("строки журнала «дата · автор · текст» + записи дополнения", () => {
    renderLive(
      "card-36814845",
      createControls({ journalExtra: [{ at: "17.09.2026 11:20:00", author: "Опер. 1", text: "Уточнено" }] }),
    );
    const journal = screen.getByRole("region", { name: "Журнал событий / описание" });
    expect(
      within(journal).getByLabelText("17.09.2026 11:13:19 · УМЦ О.п. · Пожар в квартире"),
    ).toBeInTheDocument();
    expect(within(journal).getByLabelText("17.09.2026 11:20:00 · Опер. 1 · Уточнено")).toBeInTheDocument();
  });

  it("режим дополнения: «Описание со слов заявителя», пустой «телефон на место» редактируется, «Сохранить»", () => {
    const controls = createControls();
    controls.amend = { ...controls.amend, isActive: true, description: "Дым на лестнице" };
    renderLive("card-881412", controls);
    const region = screen.getByRole("region", { name: "Дополнение карточки" });
    expect(within(region).getByLabelText("Описание со слов заявителя")).toHaveValue("Дым на лестнице");
    expect(screen.getByLabelText("телефон на место")).not.toHaveAttribute("readonly");
    fireEvent.click(within(region).getByRole("button", { name: "Сохранить" }));
    expect(controls.amend.onSave).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "просмотр" }));
    expect(controls.amend.onView).toHaveBeenCalled();
  });

  it("мок-блокировка: уведомление «Вы не можете вносить изменения», поля disabled", () => {
    const controls = createControls();
    controls.amend = {
      ...controls.amend,
      isActive: true,
      isBlocked: true,
      notice: "Вы не можете вносить изменения",
    };
    renderLive("card-881412", controls);
    expect(screen.getByRole("alert")).toHaveTextContent("Вы не можете вносить изменения");
    expect(screen.getByLabelText("Описание со слов заявителя")).toBeDisabled();
    expect(screen.getByLabelText("Действие диспетчера")).toBeDisabled();
  });

  it("ВИС-карточка: пустые блоки с пометками, источник ВИС, [ВИС] Класс.", () => {
    renderLive("card-36814856");
    expect(screen.getByText("Заявитель: нет данных (карточка из ВИС)")).toBeInTheDocument();
    expect(screen.getByText("ВИС: СОДЧ (МВД)")).toBeInTheDocument();
    expect(screen.getByText("нет данных (карточка из ВИС)")).toBeInTheDocument();
    expect(screen.getByText("Нет формализованных признаков (карточка из ВИС)")).toBeInTheDocument();
    expect(screen.getByText(/\[ВИС\] Класс\.:/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Аварии и происшествия в городском хозяйстве" }));
    expect(screen.getByText("Опросная карта не заполнена (карточка из ВИС)")).toBeInTheDocument();
  });
});

describe("отработки (T2.3-16)", () => {
  it("без подтверждающей галочки не сохраняется; поиск службы; автоподстановка телефона; сохранение", async () => {
    const controls = renderLive("card-881412");
    fireEvent.click(screen.getByRole("button", { name: "Добавить отработку" }));
    const service = screen.getByRole("combobox", { name: "Служба" });
    fireEvent.focus(service);
    fireEvent.change(service, { target: { value: "102" } });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Служба 102"]);
    fireEvent.change(service, { target: { value: "101" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: "Служба 101" }));
    expect(screen.getByLabelText("Телефон")).toHaveValue("101");
    fireEvent.change(screen.getByLabelText("Куда звонили"), { target: { value: "дежурный" } });
    fireEvent.change(screen.getByLabelText("Кто принял"), { target: { value: "Петров" } });
    fireEvent.change(screen.getByLabelText("Суть сообщения"), { target: { value: "Передана информация" } });
    const save = screen.getByRole("button", { name: "Сохранить" });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить отработку" }));
    fireEvent.click(save);
    await waitFor(() => expect(controls.workLines.onAdd).toHaveBeenCalled());
    expect(controls.workLines.onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ service: "Служба 101", phone: "101", confirmed: true }),
    );
  });

  it("добавленные отработки видны в таблице; сценарий запрещает — формы нет", () => {
    const line = {
      operator: "оп. 1",
      at: "2026-09-17T11:40:00+03:00",
      service: "Служба 102",
      calledTo: "дежурный · 102",
      person: "Иванов",
      message: "Сообщено",
    };
    const controls = createControls();
    controls.workLines = { ...controls.workLines, extra: [line], canAdd: false };
    renderLive("card-881412", controls);
    const work = screen.getByRole("region", { name: "Отработки" });
    expect(within(work).getByText("Сообщено")).toBeInTheDocument();
    expect(within(work).getByText("102")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Добавить отработку" })).toBeNull();
  });
});

describe("записи разговоров и SMS (T2.3-17, T2.3-18)", () => {
  it("записей нет → «Записей не найдено»; с записями — мм:сс; окно перетаскивается", async () => {
    renderLive("card-881412");
    fireEvent.click(screen.getByRole("button", { name: "записи звонков" }));
    expect(await screen.findByText("Записей не найдено")).toBeInTheDocument();
    expect(api.getCardRecordings).toHaveBeenCalledWith("card-881412", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Закрыть (Esc)" }));
    api.getCardRecordings.mockResolvedValue([
      {
        id: "rec-1",
        cardId: "card-881412",
        startedAt: "2026-08-20T11:57:19+03:00",
        duration: "01:24",
        title: "Входящий",
        audioUrl: null,
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "записи звонков" }));
    expect(await screen.findByText("01:24")).toBeInTheDocument();
    const window = screen.getByTestId("draggable-window");
    const header = within(window).getByRole("heading", { name: "Записи разговоров" })
      .parentElement as HTMLElement;
    fireEvent.pointerDown(header, { button: 0, clientX: 130, clientY: 100 });
    fireEvent.pointerMove(globalThis.window, { clientX: 230, clientY: 180 });
    fireEvent.pointerUp(globalThis.window);
    expect(window.style.left).toBe("220px");
    expect(window.style.top).toBe("176px");
  });

  it("SMS: история по АОН из мок-слоя и отправка", async () => {
    api.getCardSms.mockResolvedValue([
      {
        id: "sms-1",
        cardId: "card-36814859",
        direction: "incoming",
        text: "Дым в квартире",
        at: "2026-09-17T11:50:44+03:00",
      },
    ]);
    api.postCardSms.mockResolvedValue({
      id: "sms-2",
      cardId: "card-36814859",
      direction: "outgoing",
      text: "Помощь направлена",
      at: "2026-09-17T11:52:00+03:00",
    });
    renderLive("card-36814859");
    fireEvent.click(screen.getByRole("button", { name: "список SMS" }));
    const history = await screen.findByRole("list", { name: "История сообщений" });
    expect(within(history).getByText("Дым в квартире")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Текст СМС"), { target: { value: "Помощь направлена" } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить СМС" }));
    expect(await within(history).findByText("Помощь направлена")).toBeInTheDocument();
    expect(api.postCardSms).toHaveBeenCalledWith("card-36814859", { text: "Помощь направлена" });
  });
});
