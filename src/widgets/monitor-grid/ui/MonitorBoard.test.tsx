/* T3.3-04…T3.3-06: сетка, лента и очередь строятся из одной ленты занятия (без статичных снимков). */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DEFAULT_FULL_PROCESSING_MS, DEFAULT_PRIMARY_REACTION_MS } from "@/entities/session";
import type { DdsStatusDef, SessionContract, SessionFeedEvent } from "@/shared/api";

import { buildFeedItems } from "../lib/buildFeed";
import { buildQueueItems, buildStudentTiles } from "../lib/buildMonitorModel";
import { reduceLiveStates } from "../lib/liveState";
import type { MonitorSource } from "../lib/monitorSource";
import { MonitorBoard } from "./MonitorBoard";

const NOW = "2026-09-17T11:23:20+03:00";
const IVANOV = "u-005";
const PETROVA = "u-006";

const session = {
  id: "ses-2026-09-17-demo",
  teacherId: "u-002",
  studentIds: [IVANOV, PETROVA],
  scenarioIds: ["s-032"],
  mode: "practice",
  cardSource: "generated",
  state: "running",
  startedAt: "2026-09-17T11:20:00+03:00",
  finishedAt: null,
  cardEvents: [],
  cardFlow: [
    { cardId: "c-095", studentId: IVANOV, issuedAt: "2026-09-17T11:20:00+03:00", level: 2 },
    { cardId: "c-013", studentId: PETROVA, issuedAt: "2026-09-17T11:20:00+03:00", level: 3 },
    { cardId: "c-093", studentId: IVANOV, issuedAt: "2026-09-17T11:24:00+03:00", level: 2 },
  ],
} as unknown as SessionContract;

const events: SessionFeedEvent[] = [
  { kind: "cardIssued", at: "2026-09-17T11:20:00+03:00", studentId: IVANOV, cardId: "c-095", level: 2 },
  { kind: "cardIssued", at: "2026-09-17T11:20:00+03:00", studentId: PETROVA, cardId: "c-013", level: 3 },
  {
    kind: "cardOpened",
    at: "2026-09-17T11:20:09+03:00",
    studentId: IVANOV,
    cardId: "c-095",
    attemptId: "att-1",
  },
  {
    kind: "statusChanged",
    at: "2026-09-17T11:20:23+03:00",
    studentId: IVANOV,
    cardId: "c-095",
    attemptId: "att-1",
    mark: { ddsStatus: "accepted", at: "2026-09-17T11:20:23+03:00" },
  },
  {
    kind: "cardOpened",
    at: "2026-09-17T11:20:45+03:00",
    studentId: PETROVA,
    cardId: "c-013",
    attemptId: "att-2",
  },
  {
    kind: "cardCompleted",
    at: "2026-09-17T11:22:30+03:00",
    studentId: PETROVA,
    cardId: "c-013",
    attemptId: "att-2",
    fullProcessingMs: 105_000,
  },
  {
    kind: "aiEvaluation",
    at: "2026-09-17T11:22:30+03:00",
    studentId: PETROVA,
    cardId: "c-013",
    attemptId: "att-2",
    isAi: true,
    totalScore: 74,
    errorCount: 3,
    aiComment: "ИИ-оценка (мок): пропущен вызов",
  },
];

const ddsStatuses = [
  { status: "accepted", title: "Принята", requiresComment: false, next: [] },
] as unknown as DdsStatusDef[];

const source: MonitorSource = {
  session,
  students: [
    { id: IVANOV, fullName: "Иванов Сергей Петрович", armNumber: 1 },
    { id: PETROVA, fullName: "Петрова Анна Дмитриевна", armNumber: 2 },
  ],
  captions: {
    "c-095": { number: "36814850", type: "ДТП" },
    "c-013": { number: "36814845", type: "Пожар" },
    "c-093": { number: "36814851", type: "Газ" },
  },
  ddsStatuses,
  live: reduceLiveStates(events, session.studentIds),
  nowMs: Date.parse(NOW),
  norms: { primaryReactionMs: DEFAULT_PRIMARY_REACTION_MS, fullProcessingMs: DEFAULT_FULL_PROCESSING_MS },
};

function renderBoard() {
  return render(
    <MonitorBoard
      tiles={buildStudentTiles(source)}
      feedItems={buildFeedItems({
        ...source,
        events,
        issuedAt: (studentId, cardId) =>
          source.live[studentId]?.issued.findLast((item) => item.cardId === cardId)?.issuedAt,
      })}
      queueItems={buildQueueItems(source)}
    />,
  );
}

describe("MonitorBoard (T3.3-04…T3.3-06)", () => {
  it("плитка на каждого курсанта занятия, клик ведёт на экран курсанта", () => {
    renderBoard();
    const grid = screen.getByRole("region", { name: "Курсанты занятия" });
    const tiles = within(grid).getAllByRole("link");
    expect(tiles).toHaveLength(session.studentIds.length);
    expect(tiles[0]).toHaveAttribute("href", `/teacher/monitor/${IVANOV}`);
  });

  it("превышение норматива отработки краснит таймер плитки", () => {
    const { container } = renderBoard();
    const working = container.querySelector(`[href='/teacher/monitor/${IVANOV}']`);
    expect(working).toHaveAttribute("data-state", "working");
    expect(working).toHaveAttribute("data-exceeded", "true");
    expect(working?.querySelector("[role='timer'][data-exceeded='true']")).not.toBeNull();
  });

  it("счётчик ошибок мок-оценки помечен бейджем «ИИ», состояние — «завершил карточку»", () => {
    const { container } = renderBoard();
    const finished = container.querySelector(`[href='/teacher/monitor/${PETROVA}']`) as HTMLElement;
    expect(finished).toHaveAttribute("data-state", "finished");
    expect(within(finished).getByText("3")).toBeInTheDocument();
    expect(within(finished).getByText("ИИ")).toBeInTheDocument();
  });

  it("лента: новые события сверху, оценка ИИ с бейджем, превышение реакции отдельной строкой", () => {
    const { container } = renderBoard();
    const items = [...container.querySelectorAll("[data-kind]")];
    expect(items.length).toBeGreaterThanOrEqual(events.length);
    expect(items[0]).toHaveAttribute("data-kind", "aiEvaluation");
    expect(within(items[0] as HTMLElement).getByText("ИИ")).toBeInTheDocument();
    expect(screen.getByText(/Курсант Иванов открыл карточку 36814850/)).toBeInTheDocument();
    expect(screen.getByText(/Петрова превысила норматив реакции/)).toBeInTheDocument();
    expect(screen.getByText(/Иванов проставил «Принята»/)).toBeInTheDocument();
  });

  it("очередь: выданные и ожидающие по cardFlow и текущему времени", () => {
    renderBoard();
    expect(screen.getAllByText("выдана")).toHaveLength(2);
    expect(screen.getAllByText("ожидает")).toHaveLength(1);
  });
});
