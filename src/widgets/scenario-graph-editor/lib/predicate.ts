/* Редактирование предиката ветки: листья fact/op/value и обёртки all/any/not. Чистые функции. */
import type { GraphFactScalar, GraphLeafPredicate, GraphPredicate, GraphPredicateOp } from "@/shared/api";

export type PredicateKind = "leaf" | "all" | "any" | "not";

export const PREDICATE_OPS: { value: GraphPredicateOp; label: string }[] = [
  { value: "eq", label: "равно" },
  { value: "ne", label: "не равно" },
  { value: "in", label: "входит в список" },
  { value: "gt", label: "больше" },
  { value: "ge", label: "больше или равно" },
  { value: "lt", label: "меньше" },
  { value: "le", label: "меньше или равно" },
  { value: "exists", label: "задан" },
];

export function emptyLeaf(): GraphLeafPredicate {
  return { fact: "", op: "eq", value: "" };
}

export function predicateKind(predicate: GraphPredicate): PredicateKind {
  if ("all" in predicate) return "all";
  if ("any" in predicate) return "any";
  if ("not" in predicate) return "not";
  return "leaf";
}

/** Оборачивает предикат в all/any/not (all/any получают второй пустой лист для заполнения). */
export function wrapPredicate(
  predicate: GraphPredicate,
  kind: Exclude<PredicateKind, "leaf">,
): GraphPredicate {
  if (kind === "not") return { not: predicate };
  return kind === "all" ? { all: [predicate, emptyLeaf()] } : { any: [predicate, emptyLeaf()] };
}

/** Снимает обёртку: all/any → первый вложенный, not → вложенный. Лист возвращается как есть. */
export function unwrapPredicate(predicate: GraphPredicate): GraphPredicate {
  if ("all" in predicate) return predicate.all[0] ?? emptyLeaf();
  if ("any" in predicate) return predicate.any[0] ?? emptyLeaf();
  if ("not" in predicate) return predicate.not;
  return predicate;
}

export function parseScalar(raw: string): GraphFactScalar {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
  return raw;
}

export function formatScalar(value: GraphFactScalar | undefined): string {
  return value === undefined ? "" : String(value);
}

/** Значение листа из текста поля: для `in` — список через запятую, для `exists` значения нет. */
export function leafValueFromText(op: GraphPredicateOp, raw: string): GraphLeafPredicate["value"] {
  if (op === "exists") return undefined;
  if (op === "in") {
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== "")
      .map(parseScalar);
  }
  return parseScalar(raw);
}

export function leafValueToText(leaf: GraphLeafPredicate): string {
  if (Array.isArray(leaf.value)) return leaf.value.map(String).join(", ");
  return formatScalar(leaf.value);
}

export function changeLeafOp(leaf: GraphLeafPredicate, op: GraphPredicateOp): GraphLeafPredicate {
  const next: GraphLeafPredicate = { fact: leaf.fact, op };
  if (op === "exists") return next;
  if (op === "in")
    next.value = Array.isArray(leaf.value)
      ? leaf.value
      : leaf.value === undefined || leaf.value === ""
        ? []
        : [leaf.value];
  else next.value = Array.isArray(leaf.value) ? (leaf.value[0] ?? "") : (leaf.value ?? "");
  return next;
}
