/*
 * Экран карточки поверх настоящих route handlers мок-API (fetch → app/api/mock/**): RTL-эквивалент e2e фазы 2.3
 * (Playwright в проекте не установлен). Каждый тест — своя пара «курсант + карточка» (store мок-слоя общий).
 */
import {
  cleanup as cleanupScreen,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { telephonyStore } from "@/entities/service";
import type { PublicUser } from "@/shared/api";
import { appConnectivity } from "@/shared/lib";

import { buildSessionCookie, ensureTestStudent } from "../../../../app/api/mock/_server/testing";
import { createMockApiFetch } from "../lib/mockApiFetch";
import type { MockApiFetch } from "../lib/mockApiFetch";
import { IncidentScreen } from "./IncidentScreen";

/* Сценарии идут через настоящие handlers мок-слоя: запас по времени на медленной машине / параллельном прогоне. */
configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20_000 });

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

/** Cookie мок-сессии текущего обучающегося: серверный fetch мок-слоя определяет пользователя по ней. */
let sessionCookie: string | undefined;

function student(id: string, armNumber = 1, service?: string): PublicUser {
  ensureTestStudent(id);
  sessionCookie = buildSessionCookie(id);
  return {
    id,
    login: id,
    fullName: "Иванов Сергей Петрович",
    role: "student",
    armNumber,
    isActive: true,
    service,
  };
}

/** Плитка панели служб, в которой стоит карандаш «Сменить статус» (блок своей службы, памятка стр. 24). */
function pencilTile(): HTMLElement {
  const pencil = screen.getByRole("button", { name: "Сменить статус (Alt + E)" });
  const tile = pencil.closest<HTMLElement>("[data-active]");
  if (!tile) throw new Error("Карандаш не в плитке службы");
  return tile;
}

let fetcher: MockApiFetch;

beforeEach(() => {
  fetcher = createMockApiFetch({ getCookie: () => sessionCookie });
  vi.stubGlobal("fetch", fetcher);
  window.localStorage.clear();
  push.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  appConnectivity.markOnline();
  sessionCookie = undefined;
});

async function renderCard(cardId: string, user: PublicUser, props: { amendLockSeconds?: number } = {}) {
  const view = render(<IncidentScreen cardId={cardId} student={user} {...props} />);
  await screen.findByTestId("card-header", {}, { timeout: 4000 });
  return view;
}

async function setStatus(title: string, comment = "") {
  fireEvent.click(screen.getByRole("button", { name: "Сменить статус (Alt + E)" }));
  fireEvent.click(screen.getByRole("button", { name: "Статус" }));
  fireEvent.click(screen.getByRole("option", { name: title }));
  if (comment) fireEvent.change(screen.getByLabelText("Комментарий"), { target: { value: comment } });
  fireEvent.click(screen.getByRole("button", { name: "Сохранить статус (Enter)" }));
}

describe("IncidentScreen — загрузка и попытка (T2.3-01)", () => {
  it("card-881412: данные фикстуры, «Получена службой» в таймлайне моей службы, линия «недоступен»", async () => {
    await renderCard("card-881412", student("u-101"));
    expect(screen.getByRole("heading", { name: "Происшествие 881412" })).toBeInTheDocument();
    expect(screen.getByText("Опер. 14, АРМ 7, Рожкова О.И.")).toBeInTheDocument();
    expect(telephonyStore.getStatus()).toBe("unavailable");
    const panel = screen.getByRole("contentinfo", { name: "Службы" });
    expect(within(panel).getByText(/Получена службой$/)).toBeInTheDocument();
    expect(fetcher.calls).toContain("POST /cards/card-881412/attempt");
  });

  it("повторное открытие продолжает ту же попытку (без дублирования CardEvent)", async () => {
    const first = await renderCard("card-36814852", student("u-102"));
    first.unmount();
    await renderCard("card-36814852", student("u-102"));
    const sessions = (await (await fetcher("/api/mock/sessions?studentId=u-102")).json()) as {
      cardEvents: { cardId: string }[];
    }[];
    const attempts = sessions
      .flatMap((session) => session.cardEvents)
      .filter((e) => e.cardId === "card-36814852");
    expect(attempts).toHaveLength(1);
  });

  it("спека 012 FR-001/FR-002: в шапке карточки нет таймера, нормативы 0:30 и 3:00 — в полосе тренажёра", async () => {
    render(
      <>
        <div data-simulator-bar data-testid="simulator-bar">
          <div data-simulator-bar-slot />
        </div>
        <IncidentScreen cardId="c-094" student={student("u-106")} />
      </>,
    );
    const header = await screen.findByTestId("card-header", {}, { timeout: 4000 });
    expect(within(header.parentElement as HTMLElement).queryByRole("timer")).toBeNull();
    expect(screen.queryByText(/Реакция:/)).toBeNull();
    const bar = screen.getByTestId("simulator-bar");
    const norms = await within(bar).findByTestId("trainer-norms");
    expect(norms).toHaveTextContent("норматив 0:30");
    expect(norms).toHaveTextContent("норматив 3:00");
    expect(within(norms).getByRole("timer")).toHaveAttribute("data-exceeded", "false");
  });

  it("спека 012 FR-007: у egorov (ДДС района Обручевский) карандаш на «Упр. Обручевский», не на чужой службе", async () => {
    await renderCard("c-096", student("u-010", 6, "ДДС района Обручевский"));
    expect(screen.getAllByRole("button", { name: "Сменить статус (Alt + E)" })).toHaveLength(1);
    expect(pencilTile()).toHaveTextContent("Упр. Обручевский");
    expect(pencilTile()).toHaveTextContent(/Получена службой/);
  });

  it("спека 012 FR-007: у petrova (ДДС района Чертаново Южное) карандаш на «Упр. Чертаново Южное»", async () => {
    await renderCard("c-095", student("u-006", 2, "ДДС района Чертаново Южное"));
    expect(screen.getAllByRole("button", { name: "Сменить статус (Alt + E)" })).toHaveLength(1);
    expect(pencilTile()).toHaveTextContent("Упр. Чертаново Южное");
  });

  it("неизвестная карточка → сообщение и ссылка в список", async () => {
    render(<IncidentScreen cardId="card-000" student={student("u-103")} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("не найдена");
    expect(screen.getByRole("link", { name: "К списку происшествий" })).toHaveAttribute("href", "/arm");
  });

  it("учебная карточка c-094 рендерится поверх фикстуры группы ЕКП: заявитель и адрес учебные", async () => {
    await renderCard("c-094", student("u-104"));
    expect(screen.getByRole("heading", { name: "Происшествие 94" })).toBeInTheDocument();
    expect(screen.getByLabelText("АОН")).not.toHaveValue("");
  });
});

describe("IncidentScreen — статусы, итог, хоткеи (T2.3-12, T2.3-19, T2.3-22)", () => {
  it("полный цикл «Принята → … → Работы завершены» с предупреждением; итог с мок-оценкой ИИ", async () => {
    // Карточка ДДС — зона «оператор ДДС» (спека 007): petrova; ivanov — только 112 (spec/008).
    await renderCard("c-094", student("u-006", 2, "ДДС района Чертаново Южное"));
    await setStatus("Не принята");
    expect(screen.getByRole("button", { name: "Сохранить статус (Enter)" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Отмена (Esc)" }));
    for (const title of ["Принята", "Начало реагирования", "Прибытие", "Проведение работ"]) {
      await setStatus(title);
      await waitFor(() => expect(screen.queryByTestId("status-overlay")).toBeNull());
    }
    await setStatus("Работы завершены", "Работы завершены, бригада убыла");
    const confirm = screen.getByRole("alertdialog");
    expect(confirm).toHaveTextContent("закрывает карточку для редактирования");
    fireEvent.click(within(confirm).getByRole("button", { name: "Сохранить статус и закрыть карточку" }));
    const result = await screen.findByRole("region", { name: "Итог попытки" }, { timeout: 4000 });
    await within(result).findByText("Интегральный балл", {}, { timeout: 4000 });
    expect(within(result).getAllByText("ИИ").length).toBeGreaterThan(0);
    expect(within(result).getByRole("link", { name: "К списку" })).toHaveAttribute("href", "/arm");
    expect(within(result).getByRole("link", { name: "Следующая карточка" })).toHaveAttribute(
      "href",
      "/arm/card/c-095",
    );
    fireEvent.click(within(result).getByRole("button", { name: "Просмотр карточки" }));
    expect(screen.queryByRole("button", { name: "Сменить статус (Alt + E)" })).toBeNull();
  });

  it("завершённая попытка занятия (att-03) сразу показывает итог с баллами и разбором", async () => {
    // att-01 — старая ДДС-попытка ivanov, а он теперь только специалист-112 (spec/008): берём att-03 petrova.
    render(<IncidentScreen cardId="c-063" student={student("u-006", 2, "ДДС района Чертаново Южное")} />);
    const result = await screen.findByRole("region", { name: "Итог попытки" }, { timeout: 4000 });
    expect(await within(result).findByText("Разбор ошибок")).toBeInTheDocument();
  });

  it("для оператора ДДС показываются только доступные горячие клавиши", async () => {
    await renderCard("card-36814854", student("u-105"));
    fireEvent.keyDown(document, { key: "Alt", altKey: true });
    const hints = screen.getByRole("dialog", { name: "Горячие клавиши" });
    expect(hints).toHaveTextContent("Shift+F1");
    expect(hints).not.toHaveTextContent("Alt+T");
    fireEvent.keyDown(document, { key: "t", code: "KeyT", altKey: true });
    fireEvent.keyUp(document, { key: "Alt" });
    expect(screen.queryByRole("dialog", { name: "Горячие клавиши" })).toBeNull();
    expect(push).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(push).toHaveBeenCalledWith("/arm");
  });
});

describe("IncidentScreen — дополнение карточки", () => {
  // TODO(021): конфликт правил — SASHA (20.10 вечер) разрешает ДДС дополнение и флаги, спека 019 (seva) запрещает; решить владельцу.
  it.skip("сохранённое дополнение остаётся в журнале после повторного открытия, новое дописывается к прежним", async () => {
    const amend = async (text: string) => {
      fireEvent.keyDown(document, { key: "F2", shiftKey: true });
      const region = screen.getByRole("region", { name: "Дополнение карточки" });
      fireEvent.change(within(region).getByRole("textbox"), { target: { value: text } });
      fireEvent.click(within(region).getByRole("button", { name: /Сохранить/ }));
      await waitFor(() => expect(screen.queryByRole("region", { name: "Дополнение карточки" })).toBeNull());
    };
    const first = await renderCard("card-36814853", student("u-107"));
    await amend("Заявитель перезвонил: водитель выбрался сам");
    first.unmount();
    await renderCard("card-36814853", student("u-107"));
    expect(await screen.findByText(/Заявитель перезвонил: водитель выбрался сам/)).toBeInTheDocument();
    await amend("Пострадавших нет");
    await waitFor(async () => {
      const sessions = (await (await fetcher("/api/mock/sessions?studentId=u-107")).json()) as {
        cardEvents: { cardId: string; enteredText: Record<string, string> }[];
      }[];
      const event = sessions
        .flatMap((session) => session.cardEvents)
        .find((e) => e.cardId === "card-36814853");
      expect(event?.enteredText.amendment).toBe(
        "Заявитель перезвонил: водитель выбрался сам\nПострадавших нет",
      );
    });
  });
});

describe("IncidentScreen — флаги карточки", () => {
  const savedFlags = async () => {
    const sessions = (await (await fetcher("/api/mock/sessions?studentId=u-107")).json()) as {
      cardEvents: { cardId: string; enteredText: Record<string, string> }[];
    }[];
    return sessions.flatMap((session) => session.cardEvents).find((e) => e.cardId === "card-36814853")
      ?.enteredText;
  };

  // TODO(021): конфликт правил — SASHA (20.10 вечер) разрешает ДДС дополнение и флаги, спека 019 (seva) запрещает; решить владельцу.
  it.skip("клик ЧС без карандаша переключает aria-pressed и сохраняется после повторного открытия", async () => {
    const first = await renderCard("card-36814853", student("u-107"));
    const before = screen.getByRole("button", { name: /ЧС/ }).getAttribute("aria-pressed");
    fireEvent.click(screen.getByRole("button", { name: /ЧС/ }));
    const after = before === "true" ? "false" : "true";
    expect(screen.getByRole("button", { name: /ЧС/ })).toHaveAttribute("aria-pressed", after);
    await waitFor(async () => expect((await savedFlags())?.["flag.emergency"]).toBeDefined());
    first.unmount();
    await renderCard("card-36814853", student("u-107"));
    expect(screen.getByRole("button", { name: /ЧС/ })).toHaveAttribute("aria-pressed", after);
  });

  // TODO(021): конфликт правил — SASHA (20.10 вечер) разрешает ДДС дополнение и флаги, спека 019 (seva) запрещает; решить владельцу.
  it.skip("клик «Пострадавшие» меняет да/нет и сохраняется", async () => {
    const first = await renderCard("card-36814853", student("u-107"));
    const item = screen.getByRole("button", { name: /Пострадавшие: (да|нет) — изменить/ });
    const was = item.textContent;
    fireEvent.click(item);
    const now = was === "Пострадавшие: да" ? "нет" : "да";
    expect(screen.getByRole("button", { name: `Пострадавшие: ${now} — изменить` })).toBeInTheDocument();
    await waitFor(async () => expect((await savedFlags())?.["flag.victims"]).toBe(now));
    first.unmount();
    await renderCard("card-36814853", student("u-107"));
    expect(screen.getByRole("button", { name: `Пострадавшие: ${now} — изменить` })).toBeInTheDocument();
  });
});

describe("IncidentScreen — потеря соединения (T2.3-20)", () => {
  it("сбой сети → баннер, статус в буфере; восстановление → досылка, баннер скрыт", async () => {
    await renderCard("card-36814858", student("u-106"));
    fetcher.setOffline(true);
    await setStatus("Принята");
    expect(await screen.findByText(/Соединение потеряно — восстанавливаем…/)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Не отправлено действий: 1");
    fetcher.setOffline(false);
    appConnectivity.markOnline();
    await waitFor(() => expect(screen.queryByText(/Соединение потеряно/)).toBeNull());
    await waitFor(() => expect(fetcher.calls).toContain("POST /cards/card-36814858/status"));
  });
});

describe("IncidentScreen — подсказки; без «Действия диспетчера» (T2.3-13, спека 012)", () => {
  it("hints.enabled: плашка с текстом шага меняется после «Принята»; без флага плашки нет", async () => {
    await renderCard("c-004", student("u-107"));
    const hint = screen.getByRole("complementary", { name: "Подсказка" });
    expect(hint).toHaveTextContent("Откройте карточку и в течение 30 секунд");
    await setStatus("Принята");
    await waitFor(() => expect(hint).toHaveTextContent("Ход работ — по факту информации от бригады"));
    cleanupScreen();
    await renderCard("c-094", student("u-108"));
    expect(screen.queryByRole("complementary", { name: "Подсказка" })).toBeNull();
  });

  it("текст и номер наряда — только в форме статуса своей службы (памятка, стр. 24)", async () => {
    await renderCard("card-36814853", student("u-109"));
    expect(screen.queryByLabelText("Действие диспетчера")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Сменить статус (Alt + E)" }));
    expect(screen.getByLabelText("Номер наряда")).toBeInTheDocument();
    expect(screen.getByLabelText("Комментарий")).toBeInTheDocument();
  });

  it("обучающийся ДДС не может редактировать поля 112 карточки", async () => {
    await renderCard("card-36814859", student("u-110"));
    fireEvent.click(screen.getByRole("button", { name: "дополнение" }));
    expect(screen.queryByLabelText("Описание со слов заявителя")).toBeNull();
    // Поле «Действие диспетчера» убрано из карточки ДДС (спека 012) — редактировать нечего.
    expect(screen.queryByLabelText("Действие диспетчера")).toBeNull();
  });
});
