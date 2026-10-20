/*
 * Пробный прогон схемы (data-model.md §6–7): детерминированный движок без ИИ. Состояние — чистые данные; время —
 * учебные часы прогона в секундах (автор продвигает их кнопками «Подождать»), случайный вариант — по зерну.
 * Отличие от будущего серверного движка: события вводит автор из панели прогона, а не симулятор АРМ.
 */
import { FLOW_BLOCKS, outputsOf } from "../model/catalog";
import type { FlowDictionaries, FlowGraph, FlowNode } from "../model/types";
import { edgeFromPort, nodeById, startNode, stepLabel, stepNumbers } from "./graph";
import { describeAction } from "./summary";

export type PreviewEventKind = "status" | "call" | "service" | "transfer" | "sign" | "field" | "text";

export interface PreviewEvent {
  kind: PreviewEventKind;
  value: string;
  /** Поле карточки для kind = field / text. */
  field?: string;
  /** Секунда прогона. */
  at: number;
}

export interface PreviewFeedItem {
  at: number;
  kind: "call" | "callerReply" | "briefing" | "hint" | "variant";
  text: string;
}

export type PreviewOutcome =
  "done" | "late" | "missed" | "correct" | "wrong" | "yes" | "no" | "shown" | "skipped" | "passed";

export interface PreviewStep {
  nodeId: string;
  enteredAt: number;
  leftAt?: number;
  port?: string;
  outcome?: PreviewOutcome;
  /** Шаг достроен при досрочном завершении — студент до него не дошёл. */
  virtual?: boolean;
}

export interface PreviewViolation {
  nodeId: string;
  at: number;
}

export interface PreviewState {
  seed: number;
  exam: boolean;
  clock: number;
  activeNodeId: string | null;
  steps: PreviewStep[];
  events: PreviewEvent[];
  feed: PreviewFeedItem[];
  watchers: { nodeId: string; since: number }[];
  violations: PreviewViolation[];
  finished: boolean;
  finishReason?: "end" | "student";
}

export interface PreviewError {
  nodeId: string;
  severity: "critical" | "major" | "minor";
  message: string;
  pointsLost: number;
}

export interface PreviewResult {
  earned: number;
  max: number;
  score: number;
  passed: boolean;
  errors: PreviewError[];
}

const MAX_STEPS = 1000;

/* ——— сравнение ответов ——— */

export function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Адресные сокращения: «улица» = «ул», «проспект» = «пр», «корпус» = «к»; слово «дом» / «д» не значимо. */
const ADDRESS_WORDS: Record<string, string> = { улица: "ул", проспект: "пр", корпус: "к", дом: "", д: "" };

function shortenAddressWords(text: string): string {
  return text
    .split(" ")
    .map((word) => ADDRESS_WORDS[word] ?? word)
    .filter(Boolean)
    .join(" ");
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/** Ответ студента против правильного ответа по способу сравнения обязательного вопроса. */
export function answerMatches(mode: string, expected: string, actual: string): boolean {
  const value = normalizeAnswer(actual);
  const target = normalizeAnswer(expected);
  switch (mode) {
    case "any":
      return value.length > 0;
    case "exact": {
      const digits = (text: string) => text.replace(/\D/g, "");
      if (digits(target).length >= 7 && digits(target) === digits(value)) return true; // телефоны в любом формате
      return value === target;
    }
    case "contains":
      return target.split(" ").every((word) => value.includes(word));
    case "oneOf":
      return expected.split(";").map(normalizeAnswer).filter(Boolean).includes(value);
    case "similar": {
      if (!value) return false;
      // Номера домов, этажей и телефонов — не опечатки: цифры должны совпасть точно.
      const digits = (text: string) => text.match(/\d+/g)?.join(" ") ?? "";
      if (digits(target) !== digits(value)) return false;
      const short = (text: string) => shortenAddressWords(text);
      if (short(value) === short(target) || short(value).includes(short(target))) return true;
      const longest = Math.max(short(value).length, short(target).length);
      return 1 - levenshtein(short(value), short(target)) / longest >= 0.85;
    }
    case "range": {
      const [low, high = low] = expected.split(/[–—-]/).map((part) => Number(part.replace(",", ".").trim()));
      const number = Number(value.replace(",", "."));
      return Number.isFinite(number) && number >= low && number <= high;
    }
    default:
      return false;
  }
}

/** Подходит ли событие к «Действию» / «Запрещённому действию». */
export function eventMatchesAction(node: FlowNode, event: PreviewEvent): boolean {
  const props = node.props;
  switch (props.what) {
    case "setStatus":
      return event.kind === "status" && event.value === String(props.status);
    case "callService":
      return event.kind === "call" && event.value === String(props.phone);
    case "notifyService":
      return event.kind === "service" && event.value === String(props.service);
    case "transferRegion":
      return event.kind === "transfer";
    case "selectSign":
      return event.kind === "sign" && normalizeAnswer(event.value) === normalizeAnswer(String(props.sign));
    case "writeComment": {
      if (event.kind !== "text") return false;
      const phrases = String(props.phrases ?? "")
        .split(",")
        .map(normalizeAnswer)
        .filter(Boolean);
      const text = normalizeAnswer(event.value);
      return phrases.length > 0 && phrases.every((phrase) => text.includes(phrase));
    }
    default:
      return false;
  }
}

/* ——— случайный вариант по зерну ——— */

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function chooseVariant(node: FlowNode, seed: number): string {
  const ports = outputsOf(node).map((output) => output.port);
  const given = ports.map((port) => Math.max(0, Number(node.props[`weight${port.toUpperCase()}`] ?? 1) || 0));
  // Все веса нулевые (ошибка E12) — варианты считаются равновероятными.
  const weights = given.some((weight) => weight > 0) ? given : ports.map(() => 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = (hash(`${seed}:${node.id}`) / 2 ** 32) * total;
  for (let index = 0; index < ports.length; index += 1) {
    roll -= weights[index];
    if (roll < 0) return ports[index];
  }
  return ports[ports.length - 1];
}

/* ——— ход прогона ——— */

function currentStep(state: PreviewState): PreviewStep | undefined {
  const last = state.steps[state.steps.length - 1];
  return last && last.leftAt === undefined ? last : undefined;
}

function cardSummary(node: FlowNode, dict: FlowDictionaries): string {
  if (node.props.source === "custom") return String(node.props.summary ?? "");
  const card = dict.cards.find((option) => option.value === node.props.cardId);
  return card ? `${card.summary}. ${card.address}` : "";
}

/** Уйти из активного блока через выход; если выход не подключён — к основному выходу. */
function leave(graph: FlowGraph, state: PreviewState, port: string, outcome: PreviewOutcome): PreviewState {
  const step = currentStep(state);
  const nodeId = state.activeNodeId!;
  const node = nodeById(graph, nodeId)!;
  const outputs = outputsOf(node);
  const edge =
    edgeFromPort(graph, nodeId, port) ??
    (outputs[0] ? edgeFromPort(graph, nodeId, outputs[0].port) : undefined);
  const steps = step
    ? [...state.steps.slice(0, -1), { ...step, leftAt: state.clock, port: edge?.from.port ?? port, outcome }]
    : state.steps;
  const target = edge ? nodeById(graph, edge.to.node) : undefined;
  if (!target) return { ...state, steps, activeNodeId: null, finished: true, finishReason: "end" };
  return {
    ...state,
    steps: [...steps, { nodeId: target.id, enteredAt: state.clock }],
    activeNodeId: target.id,
  };
}

function conditionHolds(graph: FlowGraph, state: PreviewState, node: FlowNode): boolean {
  const props = node.props;
  const events = state.events;
  switch (props.check) {
    case "sign":
      return events.some(
        (event) =>
          event.kind === "sign" && normalizeAnswer(event.value) === normalizeAnswer(String(props.sign)),
      );
    case "status":
      return events.some((event) => event.kind === "status" && event.value === String(props.status));
    case "service":
      return events.some(
        (event) =>
          (event.kind === "service" || event.kind === "call") &&
          [String(props.service), String(props.service).replace("svc-", "")].includes(event.value),
      );
    case "field": {
      const last = [...events]
        .reverse()
        .find((event) => event.kind === "field" && event.field === props.field);
      return Boolean(last && answerMatches("similar", String(props.expected ?? ""), last.value));
    }
    case "questionCorrect":
      return state.steps.some(
        (step) => step.nodeId === props.question && step.outcome === "correct" && !step.virtual,
      );
    case "reactionInNorm": {
      const call = state.steps.find((step) => nodeById(graph, step.nodeId)?.type === "incomingCall");
      const first = events[0];
      return Boolean(call && first && first.at - call.enteredAt <= graph.settings.primaryReactionSec);
    }
    case "usedHint":
      return state.steps.some((step) => step.outcome === "shown");
    default:
      return false;
  }
}

/** Продвинуть прогон, пока активный блок может завершиться при текущих событиях и часах. */
export function advancePreview(
  graph: FlowGraph,
  dict: FlowDictionaries,
  initial: PreviewState,
): PreviewState {
  let state = initial;
  for (let guard = 0; guard < MAX_STEPS && state.activeNodeId && !state.finished; guard += 1) {
    const node = nodeById(graph, state.activeNodeId);
    const step = currentStep(state);
    if (!node || !step) return { ...state, activeNodeId: null, finished: true, finishReason: "end" };
    const props = node.props;
    const deadline = Number(props.deadlineSec ?? 0);
    const expired = deadline > 0 && state.clock >= step.enteredAt + deadline;
    const hasPort = (port: string) => Boolean(edgeFromPort(graph, node.id, port));
    let next: PreviewState | null = null;
    switch (node.type) {
      case "start":
        next = leave(graph, state, "next", "passed");
        break;
      case "end":
        return {
          ...state,
          steps: [...state.steps.slice(0, -1), { ...step, leftAt: state.clock, outcome: "passed" }],
          activeNodeId: null,
          finished: true,
          finishReason: "end",
        };
      case "incomingCall":
        next = leave(
          graph,
          {
            ...state,
            feed: [
              ...state.feed,
              { at: state.clock, kind: "call", text: `Поступил вызов: ${cardSummary(node, dict)}` },
            ],
          },
          "next",
          "passed",
        );
        break;
      case "callerReply":
        next = leave(
          graph,
          {
            ...state,
            feed: [...state.feed, { at: state.clock, kind: "callerReply", text: String(props.text ?? "") }],
          },
          "next",
          "passed",
        );
        break;
      case "hint":
        next = state.exam
          ? leave(graph, state, "next", "skipped")
          : leave(
              graph,
              {
                ...state,
                feed: [...state.feed, { at: state.clock, kind: "hint", text: String(props.text ?? "") }],
              },
              "next",
              "shown",
            );
        break;
      case "forbiddenAction":
        next = leave(
          graph,
          { ...state, watchers: [...state.watchers, { nodeId: node.id, since: state.clock }] },
          "next",
          "passed",
        );
        break;
      case "briefing":
        if (state.clock >= step.enteredAt + Number(props.delaySec ?? 0))
          next = leave(
            graph,
            {
              ...state,
              feed: [...state.feed, { at: state.clock, kind: "briefing", text: String(props.text ?? "") }],
            },
            "next",
            "passed",
          );
        break;
      case "randomVariant": {
        const port = chooseVariant(node, state.seed);
        const title = outputsOf(node).find((output) => output.port === port)?.title ?? port;
        next = leave(
          graph,
          {
            ...state,
            feed: [
              ...state.feed,
              { at: state.clock, kind: "variant", text: `Выбран ${title.toLowerCase()}` },
            ],
          },
          port,
          "passed",
        );
        break;
      }
      case "condition":
        if (conditionHolds(graph, state, node)) next = leave(graph, state, "yes", "yes");
        else if (state.clock >= step.enteredAt + Number(props.waitSec ?? 0))
          next = leave(graph, state, "no", "no");
        break;
      case "action": {
        const candidates =
          props.orderMatters === true
            ? state.events.filter((event) => event.at >= step.enteredAt)
            : state.events;
        const match = candidates.find((event) => eventMatchesAction(node, event));
        if (match)
          next = leave(
            graph,
            state,
            "done",
            deadline > 0 && match.at > step.enteredAt + deadline ? "late" : "done",
          );
        else if (expired && hasPort("missed")) next = leave(graph, state, "missed", "missed");
        break;
      }
      case "requiredQuestion": {
        const answers = state.events.filter((event) => event.kind === "field" && event.field === props.field);
        const last = answers[answers.length - 1];
        const correct =
          last && answerMatches(String(props.match ?? "exact"), String(props.expected ?? ""), last.value);
        if (correct)
          next = leave(
            graph,
            state,
            "correct",
            deadline > 0 && last.at > step.enteredAt + deadline ? "late" : "correct",
          );
        else if (expired && hasPort("wrong")) next = leave(graph, state, "wrong", last ? "wrong" : "missed");
        break;
      }
    }
    if (!next) return state;
    state = next;
  }
  return state;
}

export function startPreview(
  graph: FlowGraph,
  dict: FlowDictionaries,
  options: { seed: number; exam?: boolean },
): PreviewState {
  const start = startNode(graph);
  const state: PreviewState = {
    seed: options.seed,
    exam: options.exam ?? false,
    clock: 0,
    activeNodeId: start?.id ?? null,
    steps: start ? [{ nodeId: start.id, enteredAt: 0 }] : [],
    events: [],
    feed: [],
    watchers: [],
    violations: [],
    finished: !start,
  };
  return advancePreview(graph, dict, state);
}

/** Действие студента в момент `clock`; срабатывание запрещённых действий фиксируется сразу. */
export function recordPreviewEvent(
  graph: FlowGraph,
  dict: FlowDictionaries,
  state: PreviewState,
  event: Omit<PreviewEvent, "at">,
): PreviewState {
  if (state.finished) return state;
  const stamped: PreviewEvent = { ...event, at: state.clock };
  const violations = [...state.violations];
  for (const watcher of state.watchers) {
    const node = nodeById(graph, watcher.nodeId);
    if (
      node &&
      eventMatchesAction(node, stamped) &&
      !violations.some((violation) => violation.nodeId === node.id)
    )
      violations.push({ nodeId: node.id, at: stamped.at });
  }
  return advancePreview(graph, dict, { ...state, events: [...state.events, stamped], violations });
}

export function waitPreview(
  graph: FlowGraph,
  dict: FlowDictionaries,
  state: PreviewState,
  seconds: number,
): PreviewState {
  if (state.finished) return state;
  return advancePreview(graph, dict, { ...state, clock: state.clock + seconds });
}

/**
 * «Завершить» до конца схемы: активный блок и блоки-проверки дальше по пути — по выходам «Не выполнено» / «Неверно» /
 * «Нет» (без них — по основному) — считаются невыполненными (data-model.md §6, п. 5).
 */
export function finishPreview(graph: FlowGraph, state: PreviewState): PreviewState {
  if (state.finished) return state;
  const steps = [...state.steps];
  let nodeId = state.activeNodeId;
  let virtual = false;
  for (let guard = 0; nodeId && guard < MAX_STEPS; guard += 1) {
    const node = nodeById(graph, nodeId);
    if (!node) break;
    if (!virtual) steps.pop();
    if (node.type === "end") {
      steps.push({ nodeId, enteredAt: state.clock, leftAt: state.clock, outcome: "passed", virtual });
      break;
    }
    const fallback: Record<string, [string, PreviewOutcome]> = {
      action: ["missed", "missed"],
      requiredQuestion: ["wrong", "missed"],
      condition: ["no", "no"],
      randomVariant: [chooseVariant(node, state.seed), "passed"],
    };
    let [port, outcome] = fallback[node.type] ?? ["next", node.type === "hint" ? "skipped" : "passed"];
    // Шаги впереди засчитываются, если нужное уже сделано раньше и порядок не важен (data-model.md §6, п. 4).
    if (virtual && node.props.orderMatters !== true) {
      if (node.type === "action" && state.events.some((event) => eventMatchesAction(node, event)))
        [port, outcome] = ["done", "done"];
      if (node.type === "requiredQuestion") {
        const answers = state.events.filter(
          (event) => event.kind === "field" && event.field === node.props.field,
        );
        const last = answers[answers.length - 1];
        if (
          last &&
          answerMatches(String(node.props.match ?? "exact"), String(node.props.expected ?? ""), last.value)
        )
          [port, outcome] = ["correct", "correct"];
      }
    }
    const edge =
      edgeFromPort(graph, nodeId, port) ?? edgeFromPort(graph, nodeId, outputsOf(node)[0]?.port ?? "");
    steps.push({
      nodeId,
      enteredAt: virtual ? state.clock : (state.steps[state.steps.length - 1]?.enteredAt ?? state.clock),
      leftAt: state.clock,
      port: edge?.from.port,
      outcome,
      virtual,
    });
    nodeId = edge?.to.node ?? null;
    virtual = true;
  }
  return { ...state, steps, activeNodeId: null, finished: true, finishReason: "student" };
}

/** Итог по правилам data-model.md §7: баллы проверок на пройденном пути, опоздание, штрафы, критичность. */
export function scorePreview(graph: FlowGraph, dict: FlowDictionaries, state: PreviewState): PreviewResult {
  const numbers = stepNumbers(graph);
  const errors: PreviewError[] = [];
  let earned = 0;
  let max = 0;
  const lateShare = graph.settings.lateCreditPercent / 100;
  for (const step of state.steps) {
    const node = nodeById(graph, step.nodeId);
    if (!node || step.outcome === undefined) continue;
    const label = stepLabel(graph, node.id, numbers);
    const points = Number(node.props.points ?? 0);
    const critical = node.props.critical === true;
    if (FLOW_BLOCKS[node.type].scoring === "check") {
      max += points;
      if (step.outcome === "done" || step.outcome === "correct") earned += points;
      else if (step.outcome === "late") {
        earned += points * lateShare;
        errors.push({
          nodeId: node.id,
          severity: "minor",
          message: `${label}: выполнено позже срока ${node.props.deadlineSec} с`,
          pointsLost: points * (1 - lateShare),
        });
      } else {
        const what = node.type === "action" ? describeAction(node, dict) : "сведения не зафиксированы";
        const message =
          step.outcome === "wrong"
            ? `${label}: ответ не совпал с правильным`
            : `${label}: не выполнено${node.type === "action" ? ` — ${what}` : ""}${step.virtual ? " (прохождение завершено раньше)" : ""}`;
        errors.push({
          nodeId: node.id,
          severity: critical ? "critical" : "major",
          message,
          pointsLost: points,
        });
      }
    }
    if (node.type === "hint" && step.outcome === "shown") {
      const penalty = Number(node.props.points ?? graph.settings.hintPenalty);
      earned -= penalty;
      if (penalty > 0)
        errors.push({
          nodeId: node.id,
          severity: "minor",
          message: `${label}: взята подсказка`,
          pointsLost: penalty,
        });
    }
  }
  for (const violation of state.violations) {
    const node = nodeById(graph, violation.nodeId);
    if (!node) continue;
    const points = Number(node.props.points ?? 0);
    earned -= points;
    errors.push({
      nodeId: node.id,
      severity: node.props.critical === true ? "critical" : "major",
      message: `${stepLabel(graph, node.id, numbers)}: сделано запрещённое — ${describeAction(node, dict)}`,
      pointsLost: points,
    });
  }
  const score = max > 0 ? Math.round((100 * Math.max(0, earned)) / max) : 0;
  const passed =
    score >= graph.settings.passThreshold && !errors.some((item) => item.severity === "critical");
  return { earned: Math.max(0, earned), max, score, passed, errors };
}
