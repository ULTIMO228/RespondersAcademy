/*
 * Каталог блоков первой версии (data-model.md §2): подписи, выходы, настройки и готовые действия.
 * Подписи — простыми словами (FR-003): без «узлов», «портов» и «переменных».
 */
import type { FlowGroupId, FlowMode, FlowNode, FlowNodeType, FlowOption, FlowPropValue } from "./types";

export type FlowIconName =
  | "flowStart"
  | "flowEnd"
  | "flowCall"
  | "flowReply"
  | "flowQuestion"
  | "flowAction"
  | "flowForbidden"
  | "flowCondition"
  | "flowRandom"
  | "flowBriefing"
  | "flowHint";

export interface FlowGroupDef {
  id: FlowGroupId;
  title: string;
}

/** Порядок групп в библиотеке — от частых к редким. */
export const FLOW_GROUPS: FlowGroupDef[] = [
  { id: "call", title: "Вызов и заявитель" },
  { id: "action", title: "Действия диспетчера" },
  { id: "logic", title: "Логика" },
  { id: "learn", title: "Обучение" },
  { id: "edge", title: "Начало и конец" },
];

export interface FlowOutputDef {
  port: string;
  title: string;
  /** Обязательный выход должен вести к следующему шагу (правило E05). */
  required: boolean;
}

/** Источник вариантов выпадающего списка: справочник, статичный список или блоки схемы. */
export type FlowOptionSource =
  | { kind: "static"; options: FlowOption[] }
  | { kind: "dictionary"; name: "cards" | "ddsStatuses" | "services" | "phoneNumbers" | "signs" }
  | { kind: "questionNodes" };

export interface FlowFieldDef {
  key: string;
  label: string;
  control: "text" | "textarea" | "number" | "select" | "checkbox";
  options?: FlowOptionSource;
  required?: boolean;
  hint?: string;
  min?: number;
  max?: number;
  /** Поле видно, только если другое поле имеет одно из значений. */
  showIf?: { key: string; values: string[] };
}

export interface FlowBlockDef {
  type: FlowNodeType;
  title: string;
  group: FlowGroupId;
  icon: FlowIconName;
  /** Что делает блок — одна строка для библиотеки и свойств. */
  description: string;
  keywords: string[];
  hasInput: boolean;
  outputs: FlowOutputDef[];
  fields: FlowFieldDef[];
  /** check — блок-проверка с баллами; penalty — штрафной; none — без оценки. */
  scoring: "check" | "penalty" | "none";
  defaults: Record<string, FlowPropValue>;
}

/** Этапы «схемы приёма вызова» (как backend/app/services/error_map_stages.py) — для карты ошибок. */
export const FLOW_STAGES: Record<FlowMode, FlowOption[]> = {
  dds: [
    { value: "intake", label: "Приём вызова" },
    { value: "address", label: "Адрес" },
    { value: "decision", label: "Тип происшествия" },
    { value: "card", label: "Карточка" },
    { value: "services", label: "Службы" },
    { value: "route", label: "Маршрут" },
    { value: "statuses", label: "Статусы реагирования" },
    { value: "closing", label: "Закрытие" },
  ],
  operator112: [
    { value: "intake", label: "Приём вызова" },
    { value: "applicant", label: "Заявитель" },
    { value: "place", label: "Место" },
    { value: "essence", label: "Суть происшествия" },
    { value: "type", label: "Тип по классификатору" },
    { value: "signs", label: "Признаки и флаги" },
    { value: "services", label: "Оповещение служб" },
    { value: "closing", label: "Завершение" },
  ],
};

/** Поля карточки, которые студент может зафиксировать (обязательный вопрос, условие по полю). */
export const FLOW_CARD_FIELDS: FlowOption[] = [
  { value: "address", label: "Адрес" },
  { value: "addressRefined", label: "Уточнение адреса" },
  { value: "callerName", label: "ФИО заявителя" },
  { value: "callerPhone", label: "Телефон заявителя" },
  { value: "callerStatus", label: "Статус заявителя" },
  { value: "victims", label: "Число пострадавших" },
  { value: "floor", label: "Этаж" },
  { value: "floors", label: "Этажность дома" },
  { value: "gas", label: "Газификация дома" },
];

export const FLOW_MATCH_MODES: FlowOption[] = [
  { value: "exact", label: "Точно" },
  { value: "contains", label: "Содержит слова" },
  { value: "oneOf", label: "Одно из (через «;»)" },
  { value: "similar", label: "Похоже — допускает опечатки" },
  { value: "range", label: "Число от… до… (через «–»)" },
  { value: "any", label: "Любое заполненное" },
];

/** Что должен сделать студент: варианты «Действия» и «Запрещённого действия». */
export const FLOW_ACTION_KINDS: (FlowOption & { modes: FlowMode[] })[] = [
  { value: "setStatus", label: "Поставить статус", modes: ["dds"] },
  { value: "callService", label: "Вызвать службу по телефону", modes: ["dds"] },
  { value: "notifyService", label: "Оповестить службу", modes: ["operator112"] },
  { value: "transferRegion", label: "Перевести в ЦУС другого региона", modes: ["dds", "operator112"] },
  { value: "selectSign", label: "Выбрать признак", modes: ["operator112"] },
  { value: "writeComment", label: "Написать комментарий, содержащий…", modes: ["dds", "operator112"] },
];

/** Что проверяет «Условие». */
export const FLOW_CONDITION_CHECKS: FlowOption[] = [
  { value: "sign", label: "Студент выбрал признак" },
  { value: "status", label: "Студент поставил статус" },
  { value: "service", label: "Студент вызвал или оповестил службу" },
  { value: "field", label: "Студент указал в поле значение" },
  { value: "questionCorrect", label: "Ответ на вопрос верный" },
  { value: "reactionInNorm", label: "Студент уложился в норматив реакции" },
  { value: "usedHint", label: "Студент брал подсказку" },
];

const STATIC = (options: FlowOption[]): FlowOptionSource => ({ kind: "static", options });

const SCORE_FIELDS = (mode: "check" | "penalty"): FlowFieldDef[] => [
  {
    key: "points",
    label: mode === "check" ? "Баллы" : "Штраф, баллы",
    control: "number",
    min: 1,
    max: 10,
    required: true,
  },
  {
    key: "critical",
    label: "Критическая ошибка",
    control: "checkbox",
    hint: mode === "check" ? "Не выполнил — задание не сдано" : "Сделал запрещённое — задание не сдано",
  },
];

const ACTION_VALUE_FIELDS: FlowFieldDef[] = [
  {
    key: "what",
    label: "Что должен сделать студент",
    control: "select",
    options: STATIC(FLOW_ACTION_KINDS),
    required: true,
  },
  {
    key: "status",
    label: "Статус",
    control: "select",
    options: { kind: "dictionary", name: "ddsStatuses" },
    required: true,
    showIf: { key: "what", values: ["setStatus"] },
  },
  {
    key: "phone",
    label: "Служба (учебный номер)",
    control: "select",
    options: { kind: "dictionary", name: "phoneNumbers" },
    required: true,
    showIf: { key: "what", values: ["callService"] },
  },
  {
    key: "service",
    label: "Служба",
    control: "select",
    options: { kind: "dictionary", name: "services" },
    required: true,
    showIf: { key: "what", values: ["notifyService"] },
  },
  {
    key: "sign",
    label: "Признак",
    control: "select",
    options: { kind: "dictionary", name: "signs" },
    required: true,
    showIf: { key: "what", values: ["selectSign"] },
  },
  {
    key: "phrases",
    label: "Слова в комментарии (через запятую)",
    control: "text",
    required: true,
    showIf: { key: "what", values: ["writeComment"] },
  },
];

export const FLOW_BLOCKS: Record<FlowNodeType, FlowBlockDef> = {
  start: {
    type: "start",
    title: "Начало",
    group: "edge",
    icon: "flowStart",
    description: "Отсюда начинается сценарий",
    keywords: ["старт", "начало"],
    hasInput: false,
    outputs: [{ port: "next", title: "Следующий шаг", required: true }],
    fields: [],
    scoring: "none",
    defaults: {},
  },
  end: {
    type: "end",
    title: "Завершение",
    group: "edge",
    icon: "flowEnd",
    description: "Конец прохождения",
    keywords: ["конец", "финиш", "итог"],
    hasInput: true,
    outputs: [],
    fields: [
      {
        key: "outcome",
        label: "Исход",
        control: "select",
        required: true,
        options: STATIC([
          { value: "success", label: "Успешно" },
          { value: "fail", label: "Неуспешно" },
          { value: "neutral", label: "Нейтрально" },
        ]),
      },
      { key: "message", label: "Сообщение для разбора", control: "textarea" },
    ],
    scoring: "none",
    defaults: { outcome: "success", message: "" },
  },
  incomingCall: {
    type: "incomingCall",
    title: "Входящий вызов",
    group: "call",
    icon: "flowCall",
    description: "Новая карточка из билета",
    keywords: ["звонок", "карточка", "билет", "вызов"],
    hasInput: true,
    outputs: [{ port: "next", title: "Следующий шаг", required: true }],
    fields: [
      {
        key: "source",
        label: "Источник",
        control: "select",
        required: true,
        options: STATIC([
          { value: "bank", label: "Из банка билетов" },
          { value: "custom", label: "Своя ситуация" },
        ]),
      },
      {
        key: "cardId",
        label: "Ситуация из билета",
        control: "select",
        required: true,
        options: { kind: "dictionary", name: "cards" },
        showIf: { key: "source", values: ["bank"] },
      },
      {
        key: "summary",
        label: "Суть происшествия",
        control: "textarea",
        required: true,
        showIf: { key: "source", values: ["custom"] },
      },
      {
        key: "address",
        label: "Адрес",
        control: "text",
        required: true,
        showIf: { key: "source", values: ["custom"] },
      },
      {
        key: "callerName",
        label: "Заявитель",
        control: "text",
        showIf: { key: "source", values: ["custom"] },
      },
    ],
    scoring: "none",
    defaults: { source: "bank", cardId: "" },
  },
  callerReply: {
    type: "callerReply",
    title: "Реплика заявителя",
    group: "call",
    icon: "flowReply",
    description: "Что говорит заявитель",
    keywords: ["фраза", "речь", "ответ", "заявитель"],
    hasInput: true,
    outputs: [{ port: "next", title: "Следующий шаг", required: true }],
    fields: [{ key: "text", label: "Текст реплики", control: "textarea", required: true }],
    scoring: "none",
    defaults: { text: "" },
  },
  requiredQuestion: {
    type: "requiredQuestion",
    title: "Обязательный вопрос",
    group: "call",
    icon: "flowQuestion",
    description: "Что нужно выяснить у заявителя",
    keywords: ["вопрос", "уточнить", "адрес", "выяснить"],
    hasInput: true,
    outputs: [
      { port: "correct", title: "Верно", required: true },
      { port: "wrong", title: "Неверно", required: false },
    ],
    fields: [
      {
        key: "field",
        label: "Что выяснить",
        control: "select",
        required: true,
        options: STATIC(FLOW_CARD_FIELDS),
      },
      {
        key: "match",
        label: "Как сравнивать",
        control: "select",
        required: true,
        options: STATIC(FLOW_MATCH_MODES),
      },
      {
        key: "expected",
        label: "Правильный ответ",
        control: "text",
        required: true,
        showIf: { key: "match", values: ["exact", "contains", "oneOf", "similar", "range"] },
      },
      { key: "deadlineSec", label: "Срок, секунд (необязательно)", control: "number", min: 0, max: 3600 },
      ...SCORE_FIELDS("check"),
    ],
    scoring: "check",
    defaults: {
      field: "address",
      match: "similar",
      expected: "",
      deadlineSec: 0,
      points: 1,
      critical: false,
    },
  },
  action: {
    type: "action",
    title: "Действие",
    group: "action",
    icon: "flowAction",
    description: "Ждёт нужное действие студента в АРМ",
    keywords: ["статус", "служба", "оповестить", "перевод", "газ", "скорая", "полиция", "пожарные"],
    hasInput: true,
    outputs: [
      { port: "done", title: "Выполнено", required: true },
      { port: "missed", title: "Не выполнено", required: false },
    ],
    fields: [
      ...ACTION_VALUE_FIELDS,
      { key: "deadlineSec", label: "Срок выполнения, секунд", control: "number", min: 0, max: 3600 },
      {
        key: "orderMatters",
        label: "Важен порядок",
        control: "checkbox",
        hint: "Засчитывать, только если сделано после предыдущего шага",
      },
      ...SCORE_FIELDS("check"),
    ],
    scoring: "check",
    defaults: { what: "", deadlineSec: 60, orderMatters: false, points: 1, critical: false },
  },
  forbiddenAction: {
    type: "forbiddenAction",
    title: "Запрещённое действие",
    group: "action",
    icon: "flowForbidden",
    description: "Чего делать нельзя до конца сценария",
    keywords: ["нельзя", "ошибка", "ловушка", "запрет"],
    hasInput: true,
    outputs: [{ port: "next", title: "Следующий шаг", required: true }],
    fields: [
      ...ACTION_VALUE_FIELDS,
      { key: "reason", label: "Почему нельзя", control: "textarea" },
      ...SCORE_FIELDS("penalty"),
    ],
    scoring: "penalty",
    defaults: { what: "", reason: "", points: 1, critical: false },
  },
  condition: {
    type: "condition",
    title: "Условие",
    group: "logic",
    icon: "flowCondition",
    description: "Развилка «Да / Нет» по действиям студента",
    keywords: ["если", "развилка", "ветка", "да", "нет"],
    hasInput: true,
    outputs: [
      { port: "yes", title: "Да", required: true },
      { port: "no", title: "Нет", required: true },
    ],
    fields: [
      {
        key: "check",
        label: "Что проверить",
        control: "select",
        required: true,
        options: STATIC(FLOW_CONDITION_CHECKS),
      },
      {
        key: "sign",
        label: "Признак",
        control: "select",
        required: true,
        options: { kind: "dictionary", name: "signs" },
        showIf: { key: "check", values: ["sign"] },
      },
      {
        key: "status",
        label: "Статус",
        control: "select",
        required: true,
        options: { kind: "dictionary", name: "ddsStatuses" },
        showIf: { key: "check", values: ["status"] },
      },
      {
        key: "service",
        label: "Служба",
        control: "select",
        required: true,
        options: { kind: "dictionary", name: "services" },
        showIf: { key: "check", values: ["service"] },
      },
      {
        key: "field",
        label: "Поле",
        control: "select",
        required: true,
        options: STATIC(FLOW_CARD_FIELDS),
        showIf: { key: "check", values: ["field"] },
      },
      {
        key: "expected",
        label: "Значение",
        control: "text",
        required: true,
        showIf: { key: "check", values: ["field"] },
      },
      {
        key: "question",
        label: "Вопрос",
        control: "select",
        required: true,
        options: { kind: "questionNodes" },
        showIf: { key: "check", values: ["questionCorrect"] },
      },
      {
        key: "waitSec",
        label: "Сколько ждать, секунд",
        control: "number",
        min: 0,
        max: 3600,
        hint: "0 — проверить сразу",
      },
    ],
    scoring: "none",
    defaults: { check: "", waitSec: 60 },
  },
  randomVariant: {
    type: "randomVariant",
    title: "Случайный вариант",
    group: "logic",
    icon: "flowRandom",
    description: "Делает попытки разными",
    keywords: ["случайно", "вариант", "разнообразие"],
    hasInput: true,
    outputs: [
      { port: "a", title: "Вариант А", required: true },
      { port: "b", title: "Вариант Б", required: true },
      { port: "c", title: "Вариант В", required: true },
    ],
    fields: [
      {
        key: "variants",
        label: "Число вариантов",
        control: "select",
        required: true,
        options: STATIC([
          { value: "2", label: "Два" },
          { value: "3", label: "Три" },
        ]),
      },
      { key: "weightA", label: "Вес варианта А", control: "number", min: 1, max: 100 },
      { key: "weightB", label: "Вес варианта Б", control: "number", min: 1, max: 100 },
      {
        key: "weightC",
        label: "Вес варианта В",
        control: "number",
        min: 1,
        max: 100,
        showIf: { key: "variants", values: ["3"] },
      },
    ],
    scoring: "none",
    defaults: { variants: "2", weightA: 1, weightB: 1, weightC: 1 },
  },
  briefing: {
    type: "briefing",
    title: "Вводная",
    group: "logic",
    icon: "flowBriefing",
    description: "Событие по ходу работы",
    keywords: ["событие", "сообщение", "перезвонил", "отказ", "прибыли"],
    hasInput: true,
    outputs: [{ port: "next", title: "Следующий шаг", required: true }],
    fields: [
      {
        key: "kind",
        label: "Вид вводной",
        control: "select",
        required: true,
        options: STATIC([
          { value: "workMessage", label: "Сообщение о ходе работ" },
          { value: "recall", label: "Повторный звонок заявителя" },
          { value: "refusal", label: "Служба отказалась" },
        ]),
      },
      { key: "text", label: "Текст", control: "textarea", required: true },
      { key: "delaySec", label: "Задержка, секунд", control: "number", min: 0, max: 3600 },
    ],
    scoring: "none",
    defaults: { kind: "workMessage", text: "", delaySec: 0 },
  },
  hint: {
    type: "hint",
    title: "Подсказка",
    group: "learn",
    icon: "flowHint",
    description: "Только в тренировке, в экзамене пропускается",
    keywords: ["помощь", "совет", "подсказка"],
    hasInput: true,
    outputs: [{ port: "next", title: "Следующий шаг", required: true }],
    fields: [
      { key: "text", label: "Текст подсказки", control: "textarea", required: true },
      { key: "points", label: "Штраф, баллы", control: "number", min: 0, max: 10 },
    ],
    scoring: "penalty",
    defaults: { text: "", points: 1 },
  },
};

/** Блоки, которые можно добавить из библиотеки (без «Начала» — оно одно и создаётся вместе со сценарием). */
export const FLOW_LIBRARY_TYPES: FlowNodeType[] = [
  "incomingCall",
  "callerReply",
  "requiredQuestion",
  "action",
  "forbiddenAction",
  "condition",
  "randomVariant",
  "briefing",
  "hint",
  "end",
];

/** Выходы блока с учётом настроек (у «Случайного варианта» их 2 или 3). */
export function outputsOf(node: Pick<FlowNode, "type" | "props">): FlowOutputDef[] {
  const outputs = FLOW_BLOCKS[node.type].outputs;
  if (node.type === "randomVariant" && String(node.props.variants) !== "3") return outputs.slice(0, 2);
  return outputs;
}

export interface FlowTemplate {
  id: string;
  title: string;
  type: FlowNodeType;
  props: Record<string, FlowPropValue>;
  modes: FlowMode[];
  keywords: string[];
}

/** «Готовые действия»: преднастроенные блоки из справочников (design-concept.md §5). */
export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: "tpl-status-accepted",
    title: "Поставить статус «Принята»",
    type: "action",
    props: { what: "setStatus", status: "accepted", deadlineSec: 30, points: 2, critical: true },
    modes: ["dds"],
    keywords: ["принята", "статус", "30 секунд"],
  },
  {
    id: "tpl-status-done",
    title: "Поставить статус «Работы завершены»",
    type: "action",
    props: { what: "setStatus", status: "workDone", deadlineSec: 180, points: 1 },
    modes: ["dds"],
    keywords: ["завершены", "статус", "закрыть"],
  },
  ...["101", "102", "103", "104"].map((number) => ({
    id: `tpl-call-${number}`,
    title: `Вызвать службу ${number} по телефону`,
    type: "action" as const,
    props: { what: "callService", phone: number, deadlineSec: 60, points: 1 },
    modes: ["dds"] as FlowMode[],
    keywords: ["звонок", "телефон", number],
  })),
  ...[
    ["101", "пожарные мчс"],
    ["102", "полиция"],
    ["103", "скорая смп"],
    ["104", "газ мосгаз"],
  ].map(([number, words]) => ({
    id: `tpl-notify-${number}`,
    title: `Оповестить службу ${number}`,
    type: "action" as const,
    props: { what: "notifyService", service: `svc-${number}`, deadlineSec: 60, points: 1 },
    modes: ["operator112"] as FlowMode[],
    keywords: words.split(" "),
  })),
  {
    id: "tpl-transfer",
    title: "Перевести в ЦУС другого региона",
    type: "action",
    props: { what: "transferRegion", deadlineSec: 60, points: 2, critical: true },
    modes: ["dds", "operator112"],
    keywords: ["регион", "область", "цус", "перевод"],
  },
  {
    id: "tpl-forbid-103",
    title: "Запрещено: оповестить 103 («03 не требуется»)",
    type: "forbiddenAction",
    props: {
      what: "notifyService",
      service: "svc-103",
      reason: "В билете пометка «03 не требуется»",
      points: 1,
    },
    modes: ["operator112"],
    keywords: ["скорая", "запрет", "03"],
  },
  {
    id: "tpl-question-address",
    title: "Уточнить адрес",
    type: "requiredQuestion",
    props: { field: "addressRefined", match: "similar", expected: "", points: 2, critical: true },
    modes: ["dds", "operator112"],
    keywords: ["адрес", "где", "место"],
  },
];

/** Значения по умолчанию нового блока: общие умолчания типа + настройки готового действия. */
export function defaultPropsFor(
  type: FlowNodeType,
  overrides: Record<string, FlowPropValue> = {},
): Record<string, FlowPropValue> {
  return { ...FLOW_BLOCKS[type].defaults, ...overrides };
}

/** Заготовка нового блока: тип и (для готового действия) его настройки и название. */
export interface FlowBlockDraft {
  type: FlowNodeType;
  props?: Record<string, FlowPropValue>;
  title?: string;
}

/** Тип данных перетаскивания из библиотеки на поле. */
export const FLOW_DRAG_MIME = "application/x-ra-flow-block";

export function draftFromTemplate(template: FlowTemplate): FlowBlockDraft {
  return { type: template.type, props: template.props, title: template.title };
}
