/*
 * Проверка схемы (data-model.md §5). В прототипе правила работают в браузере; на сервере их повторит
 * flow_validator.py (plan.md Ф1) — тексты и коды должны совпасть.
 * Реализованы: E01–E05, E07–E10, E12–E14, W01–W03, W06. Не реализованы: E06 (битые связи — их не даёт редактор),
 * E11 (вопрос выше по каждому пути — пока проверяется только существование вопроса), W04–W05.
 */
import { FLOW_ACTION_KINDS, FLOW_BLOCKS, outputsOf } from "../model/catalog";
import type { FlowFieldDef } from "../model/catalog";
import type { FlowDictionaries, FlowGraph, FlowIssue, FlowNode, FlowValidationReport } from "../model/types";
import {
  edgeFromPort,
  findCycle,
  isCheckNode,
  nodeById,
  predecessors,
  reaches,
  startNode,
  stepLabel,
  stepNumbers,
  successors,
  topologicalOrder,
} from "./graph";

export const FLOW_LIMITS = { nodes: 150, edges: 300, paths: 500, text: 2000 } as const;

/** Блоки, которые работают с карточкой вызова и требуют «Входящий вызов» выше по каждому пути (E09). */
const NEEDS_CALL = new Set([
  "callerReply",
  "requiredQuestion",
  "action",
  "forbiddenAction",
  "condition",
  "briefing",
]);

export function isFieldVisible(field: FlowFieldDef, node: Pick<FlowNode, "props">): boolean {
  if (!field.showIf) return true;
  return field.showIf.values.includes(String(node.props[field.showIf.key] ?? ""));
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === "";
}

function dictionaryValues(dict: FlowDictionaries, name: keyof FlowDictionaries): Set<string> {
  return new Set(dict[name].map((option) => option.value));
}

export function validateFlow(graph: FlowGraph, dict: FlowDictionaries): FlowValidationReport {
  const errors: FlowIssue[] = [];
  const warnings: FlowIssue[] = [];
  const numbers = stepNumbers(graph);
  const label = (id: string) => stepLabel(graph, id, numbers);
  const error = (issue: Omit<FlowIssue, "level">) => errors.push({ ...issue, level: "error" });
  const warn = (issue: Omit<FlowIssue, "level">) => warnings.push({ ...issue, level: "warning" });

  // E01, E02 — «Начало» и «Завершение».
  const starts = graph.nodes.filter((node) => node.type === "start");
  if (starts.length !== 1)
    error({
      code: "E01",
      message: `В сценарии должен быть ровно один блок «Начало» (сейчас: ${starts.length}).`,
      nodeId: starts[1]?.id,
    });
  if (!graph.nodes.some((node) => node.type === "end"))
    error({ code: "E02", message: "Добавьте блок «Завершение»: без него сценарий не закончится." });

  // E13 — размеры.
  if (graph.nodes.length > FLOW_LIMITS.nodes)
    error({
      code: "E13",
      message: `Слишком много блоков: ${graph.nodes.length} (максимум ${FLOW_LIMITS.nodes}).`,
    });
  if (graph.edges.length > FLOW_LIMITS.edges)
    error({
      code: "E13",
      message: `Слишком много связей: ${graph.edges.length} (максимум ${FLOW_LIMITS.edges}).`,
    });

  // E03 — круги.
  const cycle = findCycle(graph);
  if (cycle)
    error({
      code: "E03",
      message: `Стрелки образуют круг: ${[...cycle, cycle[0]].map((id) => label(id)).join(" → ")}. Сценарий не сможет закончиться.`,
      nodeId: cycle[0],
    });

  const start = starts[0];
  for (const node of graph.nodes) {
    const block = FLOW_BLOCKS[node.type];

    // E04 — достижимость.
    if (start && node.id !== start.id && !reaches(graph, start.id, node.id))
      error({
        code: "E04",
        message: `${label(node.id)}: блок недостижим — к нему не ведёт ни одна стрелка от «Начала».`,
        nodeId: node.id,
      });

    // E05 — обязательные выходы.
    for (const output of outputsOf(node)) {
      const edge = edgeFromPort(graph, node.id, output.port);
      if (output.required && (!edge || !nodeById(graph, edge.to.node)))
        error({
          code: "E05",
          message: `${label(node.id)}: не указан следующий шаг для «${output.title}». Соедините выход с блоком или нажмите «+ Добавить шаг».`,
          nodeId: node.id,
          port: output.port,
        });
    }

    // E07, E08, E14 — настройки.
    for (const field of block.fields) {
      if (!isFieldVisible(field, node)) continue;
      const value = node.props[field.key];
      if (field.required && isEmpty(value)) {
        error({
          code: "E07",
          message: `${label(node.id)}: не заполнено поле «${field.label}».`,
          nodeId: node.id,
        });
        continue;
      }
      if (field.options?.kind === "dictionary" && !isEmpty(value)) {
        if (!dictionaryValues(dict, field.options.name).has(String(value)))
          error({
            code: "E08",
            message: `${label(node.id)}: значение поля «${field.label}» не найдено в справочнике.`,
            nodeId: node.id,
          });
      }
      if (field.options?.kind === "questionNodes" && !isEmpty(value)) {
        const question = nodeById(graph, String(value));
        if (!question || question.type !== "requiredQuestion")
          error({
            code: "E11",
            message: `${label(node.id)}: условие ссылается на удалённый вопрос.`,
            nodeId: node.id,
          });
      }
      if (typeof value === "string" && value.length > FLOW_LIMITS.text)
        error({
          code: "E14",
          message: `${label(node.id)}: текст поля «${field.label}» длиннее ${FLOW_LIMITS.text} символов.`,
          nodeId: node.id,
        });
      if (typeof value === "string" && /https?:\/\//i.test(value))
        error({
          code: "E14",
          message: `${label(node.id)}: в тексте не должно быть ссылок на внешние сайты.`,
          nodeId: node.id,
        });
    }
    if (node.type === "action" || node.type === "forbiddenAction") {
      const kind = FLOW_ACTION_KINDS.find((option) => option.value === node.props.what);
      if (kind && !kind.modes.includes(graph.mode))
        error({
          code: "E08",
          message: `${label(node.id)}: «${kind.label}» недоступно в режиме «${graph.mode === "dds" ? "ДДС" : "Специалист 112"}».`,
          nodeId: node.id,
        });
    }

    // E12 — веса случайного варианта.
    if (node.type === "randomVariant") {
      const keys =
        String(node.props.variants) === "3" ? ["weightA", "weightB", "weightC"] : ["weightA", "weightB"];
      if (keys.some((key) => !(Number(node.props[key]) > 0)))
        error({
          code: "E12",
          message: `${label(node.id)}: у каждого варианта вес должен быть больше нуля.`,
          nodeId: node.id,
        });
    }

    // W03 — срок больше норматива отработки.
    const deadline = Number(node.props.deadlineSec ?? 0);
    if (
      (node.type === "action" || node.type === "requiredQuestion") &&
      deadline > graph.settings.fullProcessingSec
    )
      warn({
        code: "W03",
        message: `${label(node.id)}: срок ${deadline} с больше норматива отработки ${graph.settings.fullProcessingSec} с. Опубликовать можно.`,
        nodeId: node.id,
      });

    // W06 — провал шага ведёт сразу к успешному завершению.
    for (const port of ["missed", "wrong"]) {
      const edge = edgeFromPort(graph, node.id, port);
      const target = edge ? nodeById(graph, edge.to.node) : undefined;
      if (target?.type === "end" && (target.props.outcome ?? "success") === "success")
        warn({
          code: "W06",
          message: `${label(node.id)}: при провале шага студент сразу попадает в «Завершение» с исходом «Успешно».`,
          nodeId: node.id,
        });
    }
  }

  // Правила по путям считаются только на схеме без кругов.
  const order = cycle ? null : topologicalOrder(graph);
  let paths = 0;
  let maxScore = 0;
  if (order && start) {
    const pathCount = new Map<string, number>();
    const best = new Map<string, number>();
    /** Есть путь от «Начала», на котором ещё не было «Входящего вызова». */
    const callFree = new Map<string, boolean>();
    /** Есть путь от «Начала» без единого блока-проверки (включая этот блок). */
    const checkFree = new Map<string, boolean>();
    /** Статусы, которые могли быть последними перед блоком. */
    const lastStatuses = new Map<string, Set<string>>();
    for (const id of order) {
      const node = nodeById(graph, id)!;
      const preds = predecessors(graph, id).filter((pred) => successors(graph, pred).includes(id));
      const isStart = id === start.id;
      if (!isStart && !preds.length) continue; // недостижимые блоки уже отмечены E04
      const count = isStart ? 1 : preds.reduce((sum, pred) => sum + (pathCount.get(pred) ?? 0), 0);
      pathCount.set(id, count);
      const points = isCheckNode(node) ? Number(node.props.points ?? 0) : 0;
      best.set(id, (isStart ? 0 : Math.max(...preds.map((pred) => best.get(pred) ?? 0))) + points);
      const freeBefore = isStart || preds.some((pred) => callFree.get(pred));
      callFree.set(id, node.type !== "incomingCall" && freeBefore);
      checkFree.set(id, !isCheckNode(node) && (isStart || preds.some((pred) => checkFree.get(pred))));
      const incoming = new Set<string>();
      for (const pred of preds) for (const status of lastStatuses.get(pred) ?? []) incoming.add(status);
      const ownStatus =
        node.type === "action" && node.props.what === "setStatus" && !isEmpty(node.props.status)
          ? String(node.props.status)
          : null;

      // E09 — работа с карточкой без входящего вызова.
      if (NEEDS_CALL.has(node.type) && freeBefore)
        error({
          code: "E09",
          message: `${label(id)}: перед этим шагом нет «Входящего вызова» хотя бы на одном пути.`,
          nodeId: id,
        });

      // W01 — порядок статусов по справочнику.
      if (ownStatus) {
        for (const previous of incoming) {
          const definition = dict.ddsStatuses.find((status) => status.value === previous);
          if (definition && previous !== ownStatus && !definition.next.includes(ownStatus)) {
            const nextTitles = definition.next
              .map((value) => dict.ddsStatuses.find((status) => status.value === value)?.label)
              .filter(Boolean)
              .join(" или ");
            warn({
              code: "W01",
              message: `${label(id)}: после «${definition.label}» по справочнику идёт ${nextTitles ? `«${nextTitles}»` : "завершение"}, а в схеме — «${dict.ddsStatuses.find((status) => status.value === ownStatus)?.label ?? ownStatus}».`,
              nodeId: id,
            });
          }
        }
      }
      lastStatuses.set(id, ownStatus ? new Set([ownStatus]) : incoming);

      if (node.type === "end") {
        paths += count;
        maxScore = Math.max(maxScore, best.get(id) ?? 0);
        // E10 — путь без проверок.
        if (checkFree.get(id))
          error({
            code: "E10",
            message: `${label(id)}: на одном из путей к этому завершению нечего оценивать — добавьте «Действие» или «Обязательный вопрос».`,
            nodeId: id,
          });
      }
    }
    if (paths > FLOW_LIMITS.paths)
      error({
        code: "E13",
        message: `Слишком много путей прохождения: ${paths} (максимум ${FLOW_LIMITS.paths}). Разбейте сценарий на два.`,
      });
  }

  // W02 — «Не принята» / «Отказ» без комментария.
  const refusal = graph.nodes.find(
    (node) =>
      node.type === "action" &&
      node.props.what === "setStatus" &&
      ["notAccepted", "workRefused"].includes(String(node.props.status)),
  );
  if (refusal && !graph.nodes.some((node) => node.type === "action" && node.props.what === "writeComment"))
    warn({
      code: "W02",
      message: `${label(refusal.id)}: для этого статуса памятка требует комментарий — добавьте «Действие: написать комментарий».`,
      nodeId: refusal.id,
    });

  if (!startNode(graph)) paths = 0;
  return {
    ok: errors.length === 0,
    errors: dedupe(errors),
    warnings: dedupe(warnings),
    stats: { nodes: graph.nodes.length, edges: graph.edges.length, paths, maxScore },
  };
}

function dedupe(issues: FlowIssue[]): FlowIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}|${issue.nodeId ?? ""}|${issue.port ?? ""}|${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
