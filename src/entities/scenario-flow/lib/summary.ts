/* Краткое содержание настроек блока одной фразой (design-concept.md §3: «Оповестить службу 104 · срок 60 с · 2 балла»). */
import {
  FLOW_ACTION_KINDS,
  FLOW_CARD_FIELDS,
  FLOW_CONDITION_CHECKS,
  FLOW_MATCH_MODES,
} from "../model/catalog";
import type { FlowDictionaries, FlowNode, FlowOption } from "../model/types";

function labelOf(options: FlowOption[], value: unknown): string {
  return options.find((option) => option.value === String(value))?.label ?? "";
}

function str(value: unknown): string {
  return value === undefined || value === null ? "" : String(value).trim();
}

function quote(text: string): string {
  return text ? `«${text}»` : "";
}

function pointsWord(points: number): string {
  const mod10 = points % 10;
  const mod100 = points % 100;
  if (mod10 === 1 && mod100 !== 11) return "балл";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "балла";
  return "баллов";
}

function scoreTail(node: FlowNode): string[] {
  const parts: string[] = [];
  const points = Number(node.props.points ?? 0);
  if (points > 0) parts.push(`${points} ${pointsWord(points)}`);
  if (node.props.critical === true) parts.push("критично");
  return parts;
}

/** Что сделать — фраза «Оповестить службу 104» / «Поставить статус „Принята“». */
export function describeAction(node: FlowNode, dict: FlowDictionaries): string {
  const what = str(node.props.what);
  switch (what) {
    case "setStatus":
      return `Поставить статус ${quote(labelOf(dict.ddsStatuses, node.props.status))}`.trim();
    case "callService":
      return `Вызвать службу ${str(node.props.phone)}`.trim();
    case "notifyService": {
      const service = labelOf(dict.services, node.props.service);
      return `Оповестить: ${service || "служба не выбрана"}`;
    }
    case "transferRegion":
      return "Перевести в ЦУС другого региона";
    case "selectSign":
      return `Выбрать признак ${quote(str(node.props.sign))}`.trim();
    case "writeComment":
      return `Комментарий со словами ${quote(str(node.props.phrases))}`.trim();
    default:
      return labelOf(FLOW_ACTION_KINDS, what) || "Не выбрано, что сделать";
  }
}

export function summarizeNode(
  node: FlowNode,
  dict: FlowDictionaries,
  questionTitles: Map<string, string> = new Map(),
): string {
  const props = node.props;
  switch (node.type) {
    case "start":
      return "Начало сценария";
    case "end":
      return props.outcome === "fail" ? "Неуспешно" : props.outcome === "neutral" ? "Нейтрально" : "Успешно";
    case "incomingCall": {
      if (props.source === "custom") return str(props.summary) || "Своя ситуация не описана";
      const card = dict.cards.find((option) => option.value === props.cardId);
      return card ? `${card.label}: ${card.summary}` : "Ситуация не выбрана";
    }
    case "callerReply":
      return quote(str(props.text)) || "Текст реплики не задан";
    case "requiredQuestion": {
      const field = labelOf(FLOW_CARD_FIELDS, props.field) || "Поле не выбрано";
      const match = str(props.match);
      const expected =
        match === "any" ? "любое значение" : quote(str(props.expected)) || labelOf(FLOW_MATCH_MODES, match);
      return [`${field}: ${expected}`, ...scoreTail(node)].join(" · ");
    }
    case "action": {
      const deadline = Number(props.deadlineSec ?? 0);
      return [describeAction(node, dict), deadline > 0 ? `срок ${deadline} с` : "", ...scoreTail(node)]
        .filter(Boolean)
        .join(" · ");
    }
    case "forbiddenAction":
      return [`Нельзя: ${describeAction(node, dict)}`, ...scoreTail(node)].join(" · ");
    case "condition": {
      const check = str(props.check);
      const wait = Number(props.waitSec ?? 0);
      let text = labelOf(FLOW_CONDITION_CHECKS, check) || "Не выбрано, что проверить";
      if (check === "sign") text = `Выбран признак ${quote(str(props.sign))}?`;
      if (check === "status") text = `Поставлен статус ${quote(labelOf(dict.ddsStatuses, props.status))}?`;
      if (check === "service") text = `Оповещена служба ${quote(labelOf(dict.services, props.service))}?`;
      if (check === "field")
        text = `${labelOf(FLOW_CARD_FIELDS, props.field) || "Поле"} = ${quote(str(props.expected))}?`;
      if (check === "questionCorrect")
        text = `Верный ответ: ${quote(questionTitles.get(str(props.question)) ?? "вопрос не выбран")}?`;
      return [text, wait > 0 ? `ждать ${wait} с` : ""].filter(Boolean).join(" · ");
    }
    case "randomVariant":
      return String(props.variants) === "3" ? "Три варианта на выбор" : "Два варианта на выбор";
    case "briefing": {
      const delay = Number(props.delaySec ?? 0);
      return [quote(str(props.text)) || "Текст вводной не задан", delay > 0 ? `через ${delay} с` : ""]
        .filter(Boolean)
        .join(" · ");
    }
    case "hint": {
      const penalty = Number(props.points ?? 0);
      return [
        quote(str(props.text)) || "Текст подсказки не задан",
        penalty > 0 ? `−${penalty} ${pointsWord(penalty)}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
    }
  }
}
