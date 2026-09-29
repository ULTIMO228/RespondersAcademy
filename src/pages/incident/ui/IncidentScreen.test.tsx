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

function student(id: string, armNumber = 1): PublicUser {
  ensureTestStudent(id);
  sessionCookie = buildSessionCookie(id);
  return { id, login: id, fullName: "Иванов Сергей Петрович", role: "student", armNumber, isActive: true };
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
    await renderCard("c-094", student("u-005"));
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
    expect(screen.getByLabelText("Действие диспетчера")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Сменить статус (Alt + E)" })).toBeNull();
  });

  it("завершённая попытка занятия (att-01) сразу показывает итог с баллами и разбором", async () => {
    render(<IncidentScreen cardId="c-063" student={student("u-005")} />);
    const result = await screen.findByRole("region", { name: "Итог попытки" }, { timeout: 4000 });
    expect(await within(result).findByText("Разбор ошибок")).toBeInTheDocument();
  });

  it("Alt — подсказки; Alt+T не действует; Shift+F2 — дополнение; Esc — закрытие карточки", async () => {
    await renderCard("card-36814854", student("u-105"));
    fireEvent.keyDown(document, { key: "Alt", altKey: true });
    expect(screen.getByRole("dialog", { name: "Горячие клавиши" })).toHaveTextContent("Alt+T");
    fireEvent.keyDown(document, { key: "t", code: "KeyT", altKey: true });
    fireEvent.keyUp(document, { key: "Alt" });
    expect(screen.queryByRole("dialog", { name: "Горячие клавиши" })).toBeNull();
    expect(push).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "F2", shiftKey: true });
    expect(screen.getByRole("region", { name: "Дополнение карточки" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "F1", shiftKey: true });
    expect(screen.queryByRole("region", { name: "Дополнение карточки" })).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(push).toHaveBeenCalledWith("/arm");
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

describe("IncidentScreen — подсказки и «Действие диспетчера» (T2.3-13, T2.3-09)", () => {
  it("hints.enabled: плашка с текстом шага меняется после «Принята»; без флага плашки нет", async () => {
    await renderCard("c-004", student("u-107"));
    const hint = screen.getByRole("complementary", { name: "Подсказка" });
    expect(hint).toHaveTextContent("Откройте карточку в течение 30 секунд");
    await setStatus("Принята");
    await waitFor(() => expect(hint).toHaveTextContent("Задымление без открытого пламени"));
    cleanupScreen();
    await renderCard("c-094", student("u-108"));
    expect(screen.queryByRole("complementary", { name: "Подсказка" })).toBeNull();
  });

  it("ввод автосохраняется в буфер (курсант + карточка), уходит в enteredText и переживает перезагрузку", async () => {
    const first = await renderCard("card-36814853", student("u-109"));
    fireEvent.change(screen.getByLabelText("Действие диспетчера"), {
      target: { value: "Сообщение принято" },
    });
    fireEvent.change(screen.getByLabelText("Номер наряда"), { target: { value: "Н-5" } });
    await waitFor(() =>
      expect(window.localStorage.getItem("arm112:draft:u-109:card-36814853")).toContain("Н-5"),
    );
    await waitFor(() =>
      expect(fetcher.calls.some((call) => /POST \/attempts\/.+\/progress/.test(call))).toBe(true),
    );
    first.unmount();
    await renderCard("card-36814853", student("u-109"));
    expect(screen.getByLabelText("Действие диспетчера")).toHaveValue("Сообщение принято");
    expect(screen.getByLabelText("Номер наряда")).toHaveValue("Н-5");
  });

  it("входящая СМС-карточка: текст СМС предзаполняет «Описание со слов заявителя»", async () => {
    await renderCard("card-36814859", student("u-110"));
    fireEvent.click(screen.getByRole("button", { name: "дополнение" }));
    expect(screen.getByLabelText("Описание со слов заявителя")).toHaveValue(
      "Помогите мне! Дым в квартире. Имя: Адрес: Группа крови…",
    );
  });
});
