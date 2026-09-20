import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicUser } from "@/shared/api";

import { createTestDeps } from "../lib/journalFakeApi.testing";
import { STORAGE_KEYS } from "../model/storedValue";
import { advance, DEMO_NOW, renderJournal, STUDENT } from "./journalTestUtils.testing";

vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...rest }: React.ComponentProps<"a">) => (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));

/** Курсант без профильной привязки службы — лента занятия без профильного фильтра. */
const STUDENT_NO_PROFILE: PublicUser = { ...STUDENT, service: undefined };
const SECOND = 1000;
const ISSUE_STEP_MS = 180_000;

function sessionRows() {
  return screen
    .getAllByRole("rowgroup")
    .filter((row) => row.dataset.state !== "normal" || row.dataset.session);
}

function rowOf(number: number): HTMLElement {
  const link = screen.getByRole("link", { name: String(number) });
  return link.closest('[role="rowgroup"]') as HTMLElement;
}

async function startModule(title: RegExp) {
  const modules = screen.getByRole("region", { name: "Мои назначенные модули" });
  fireEvent.click(within(modules).getByRole("button", { name: title }));
  await advance();
  await advance();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(DEMO_NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("«Мои назначенные модули» и бейдж занятия (T2.2-15)", () => {
  it("только approved-сценарии занятий курсанта: название, категории, сложность, дедлайн", async () => {
    await renderJournal();
    const modules = screen.getByRole("region", { name: "Мои назначенные модули" });
    const rows = within(modules).getAllByRole("button");
    expect(rows.map((row) => row.querySelector("strong")?.textContent?.slice(0, 9))).toEqual([
      "Билет 32:",
      "Билет 05:",
      "Билет 31:",
      "Билет 21:",
      "Билет 27:",
      "Билет 28:",
    ]);
    const ticket5 = within(modules).getByRole("button", { name: /Билет 05/ });
    expect(ticket5).toHaveTextContent("пожар в жилом доме");
    expect(ticket5).toHaveTextContent("4 из 5 · продвинутый");
    expect(ticket5).toHaveTextContent("17.09.2026 12:20");
  });

  it("клик по модулю стартует занятие: POST /sessions + start, бейдж «занятие: Билет 05» с таймером", async () => {
    const { deps } = await renderJournal();
    await startModule(/Билет 05/);
    expect(deps.api.calls.createSession[0]).toMatchObject({
      studentIds: ["u-005"],
      scenarioIds: ["s-005"],
      teacherId: "u-002",
      mode: "practice",
    });
    expect(screen.getByText(/занятие: Билет 05/)).toBeInTheDocument();
    expect(screen.getByText("осталось 60:00")).toBeInTheDocument();
    await advance(5 * SECOND);
    expect(screen.getByText("осталось 59:55")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Билет 05/ })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Профильный фильтр ленты (T2.2-14)", () => {
  it("ДДС Чертаново Южное: в ленту и расписание попадают только карточки профильных групп", async () => {
    const { deps } = await renderJournal();
    await startModule(/Билет 05/);
    expect(deps.api.calls.createSession[0].cardFlow?.map((item) => item.cardId)).toEqual(["c-013"]);
    await advance(10 * 60 * SECOND);
    expect(screen.getByRole("link", { name: "13" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "14" })).not.toBeInTheDocument();
  });

  it("модуль без профильных карточек — сообщение, занятие не создаётся", async () => {
    const { deps } = await renderJournal();
    await startModule(/Билет 32/);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "В модуле нет карточек профильных групп службы «ДДС района Чертаново Южное»",
    );
    expect(deps.api.calls.createSession).toHaveLength(0);
  });

  it("вне занятия лента — полный журнал (фильтр не применяется)", async () => {
    await renderJournal();
    expect(screen.getByText("1-10 из 12")).toBeInTheDocument();
    expect(screen.queryByText(/занятие:/)).not.toBeInTheDocument();
  });
});

describe("Поступление карточек и таймер 30 сек (T2.2-06, T2.2-07)", () => {
  it("новая строка сверху, счётчик, независимые таймеры, покраснение после 30 сек, открытие фиксирует реакцию", async () => {
    const { deps } = await renderJournal(createTestDeps(), STUDENT_NO_PROFILE);
    await startModule(/Билет 32/);
    const first = rowOf(94);
    expect(screen.getAllByRole("rowgroup")[0]).toBe(first);
    expect(first).toHaveAttribute("data-state", "new");
    expect(within(first).getByRole("timer")).toHaveTextContent("0:30");
    expect(within(screen.getByTitle("Новые неоткрытые карточки")).getByText("1")).toBeInTheDocument();

    await advance(30 * SECOND);
    expect(within(rowOf(94)).getByRole("timer")).toHaveTextContent("0:00");
    expect(rowOf(94)).toHaveAttribute("data-state", "new");
    await advance(SECOND);
    expect(rowOf(94)).toHaveAttribute("data-state", "violation");
    expect(within(rowOf(94)).getByRole("timer")).toHaveAttribute("data-exceeded", "true");

    await advance(ISSUE_STEP_MS - 31 * SECOND);
    expect(screen.getAllByRole("rowgroup")[0]).toBe(rowOf(95));
    expect(within(rowOf(95)).getByRole("timer")).toHaveTextContent("0:30");
    expect(rowOf(94)).toHaveAttribute("data-state", "violation");
    expect(within(screen.getByTitle("Новые неоткрытые карточки")).getByText("2")).toBeInTheDocument();

    await advance(12 * SECOND);
    fireEvent.click(screen.getByRole("link", { name: "95" }));
    expect(rowOf(95)).toHaveAttribute("data-state", "normal");
    expect(within(rowOf(95)).queryByRole("timer")).not.toBeInTheDocument();
    const records = JSON.parse(deps.storage.get(STORAGE_KEYS.reactions) ?? "{}") as Record<string, unknown>;
    expect(records["ses-test-1:c-095"]).toMatchObject({ primaryReactionMs: 12_000, isViolation: false });
    expect(records["ses-test-1:c-094"]).toMatchObject({ openedAt: null, isViolation: true });
    expect(sessionRows().length).toBeGreaterThan(0);
  });

  it("повторный тик ленты не дублирует строки; выкл. автообновление останавливает поллинг ленты", async () => {
    const { deps } = await renderJournal(createTestDeps(), STUDENT_NO_PROFILE);
    await startModule(/Билет 32/);
    await advance(9 * SECOND);
    expect(screen.getAllByRole("link", { name: "94" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("switch", { name: "Автообновление" }));
    const polls = deps.api.calls.feed;
    await advance(ISSUE_STEP_MS);
    expect(deps.api.calls.feed).toBe(polls);
    expect(screen.queryByRole("link", { name: "95" })).not.toBeInTheDocument();
  });

  it("prefers-reduced-motion: новая строка без мигания — статичный маркер", async () => {
    await renderJournal(createTestDeps({ prefersReducedMotion: () => true }), STUDENT_NO_PROFILE);
    await startModule(/Билет 32/);
    const row = rowOf(94);
    expect(row).toHaveAttribute("data-motion", "reduced");
    expect(row.className).toContain("incident-row--static");
    expect(row).toHaveAttribute("data-state", "new");
  });
});

describe("Будильник «напоминание» (T2.2-11)", () => {
  async function createReminder() {
    const deps = createTestDeps();
    await renderJournal(deps);
    const row = screen.getAllByRole("rowgroup")[0];
    fireEvent.click(within(row).getByRole("button", { name: "Напоминание" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Текст напоминания"), {
      target: { value: "Перезвонить заявителю" },
    });
    fireEvent.change(within(dialog).getByLabelText("Время срабатывания"), {
      target: { value: "2026-09-17T11:52" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
    await advance();
    return deps;
  }

  it("срабатывает в заданное время; закрыть без действий — повтор каждые 20 сек", async () => {
    await createReminder();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await advance(76 * SECOND);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Перезвонить заявителю");
    fireEvent.click(screen.getByRole("button", { name: "Закрыть (Esc)" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await advance(19 * SECOND);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await advance(SECOND);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await advance(20 * SECOND);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("действия окна: перейти в карточку, переназначить (только время), удалить", async () => {
    await createReminder();
    await advance(76 * SECOND);
    expect(screen.getByRole("link", { name: "Перейти в карточку" })).toHaveAttribute(
      "href",
      "/arm/card/card-36814859",
    );
    fireEvent.click(screen.getByRole("button", { name: "Переназначить" }));
    fireEvent.change(screen.getByLabelText("Новое время срабатывания"), {
      target: { value: "2026-09-17T11:55" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить время" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await advance(170 * SECOND);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await advance(10 * SECOND);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Перезвонить заявителю");
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    await advance(60 * SECOND);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("«Перейти в карточку» закрывает напоминание", async () => {
    await createReminder();
    await advance(76 * SECOND);
    fireEvent.click(screen.getByRole("link", { name: "Перейти в карточку" }));
    await advance(60 * SECOND);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
