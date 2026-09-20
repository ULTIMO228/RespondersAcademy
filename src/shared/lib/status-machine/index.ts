/*
 * Дженерик data-driven машина статусных графов (T1.2-01).
 * Граф переходов берётся ТОЛЬКО из данных справочника (DdsStatusDef/ServiceStatusDef.next в reference.json):
 * изменение JSON меняет поведение без правки кода. Константы переходов в коде запрещены.
 */

/** Описание статуса из справочника: форма совпадает с DdsStatusDef / ServiceStatusDef. */
export type StatusDefinition<TStatus extends string> = {
  status: TStatus;
  title: string;
  requiresComment: boolean;
  next: readonly TStatus[];
};

export type StatusMachineOptions<TStatus extends string> = {
  /**
   * Допустимые первичные статусы (переход из «нет статуса»). По умолчанию — статусы графа
   * без входящих рёбер. Отсутствующие в справочнике значения отбрасываются.
   */
  initial?: readonly TStatus[];
};

export type StatusTransitionPayload = {
  comment?: string | null;
};

export type StatusTransitionErrorCode = "unknownStatus" | "invalidTransition" | "commentRequired";

/** Доменная ошибка перехода статуса (сообщение — на русском, для показа пользователю и тела 409/400). */
export class StatusTransitionError extends Error {
  readonly code: StatusTransitionErrorCode;
  readonly from: string | null;
  readonly to: string;

  constructor(code: StatusTransitionErrorCode, message: string, from: string | null, to: string) {
    super(message);
    this.name = "StatusTransitionError";
    this.code = code;
    this.from = from;
    this.to = to;
  }
}

export type StatusMachine<TStatus extends string> = {
  /** Все статусы справочника в порядке данных. */
  readonly statuses: readonly TStatus[];
  /** Допустимые первичные статусы (from = null). */
  readonly initialStatuses: readonly TStatus[];
  hasStatus(status: string): status is TStatus;
  getTitle(status: TStatus): string;
  requiresComment(status: TStatus): boolean;
  /** Статус без исходящих переходов (закрывает карточку для редактирования). */
  isFinal(status: TStatus): boolean;
  /** Доступные следующие статусы; null — статуса ещё нет. */
  nextStatuses(current: TStatus | null): TStatus[];
  canTransition(from: TStatus | null, to: TStatus): boolean;
  /** Бросает StatusTransitionError: неизвестный статус, недопустимый переход, нет обязательного комментария. */
  assertTransition(from: TStatus | null, to: TStatus, payload?: StatusTransitionPayload): void;
};

function findSourceStatuses<TStatus extends string>(defs: readonly StatusDefinition<TStatus>[]): TStatus[] {
  const targets = new Set<TStatus>(defs.flatMap((def) => def.next));
  return defs.map((def) => def.status).filter((status) => !targets.has(status));
}

function quoteTitles(titles: string[]): string {
  return titles.length === 0 ? "нет" : titles.map((title) => `«${title}»`).join(", ");
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

type MachineCore<TStatus extends string> = Omit<StatusMachine<TStatus>, "assertTransition">;

function createAssertTransition<TStatus extends string>(
  core: MachineCore<TStatus>,
): StatusMachine<TStatus>["assertTransition"] {
  const assertKnown = (status: string | null, from: TStatus | null, to: TStatus): void => {
    if (status !== null && !core.hasStatus(status)) {
      throw new StatusTransitionError("unknownStatus", `Неизвестный статус «${status}»`, from, to);
    }
  };
  return (from, to, payload = {}) => {
    assertKnown(from, from, to);
    assertKnown(to, from, to);
    const allowed = core.nextStatuses(from);
    if (!allowed.includes(to)) {
      const fromText = from === null ? "Первичный статус" : `Переход из «${core.getTitle(from)}»`;
      const allowedText = quoteTitles(allowed.map(core.getTitle));
      const message = `${fromText} в «${core.getTitle(to)}» недопустим. Доступно: ${allowedText}`;
      throw new StatusTransitionError("invalidTransition", message, from, to);
    }
    if (core.requiresComment(to) && !hasText(payload.comment)) {
      const message = `Для статуса «${core.getTitle(to)}» обязателен комментарий`;
      throw new StatusTransitionError("commentRequired", message, from, to);
    }
  };
}

export function buildStatusMachine<TStatus extends string>(
  defs: readonly StatusDefinition<TStatus>[],
  options: StatusMachineOptions<TStatus> = {},
): StatusMachine<TStatus> {
  const byStatus = new Map<string, StatusDefinition<TStatus>>(defs.map((def) => [def.status, def]));
  const initialStatuses = (options.initial ?? findSourceStatuses(defs)).filter((status) =>
    byStatus.has(status),
  );
  const hasStatus = (status: string): status is TStatus => byStatus.has(status);
  const nextStatuses = (current: TStatus | null): TStatus[] =>
    current === null ? [...initialStatuses] : [...(byStatus.get(current)?.next ?? [])];
  const core: MachineCore<TStatus> = {
    statuses: defs.map((def) => def.status),
    initialStatuses,
    hasStatus,
    getTitle: (status) => byStatus.get(status)?.title ?? status,
    requiresComment: (status) => byStatus.get(status)?.requiresComment ?? false,
    isFinal: (status) => hasStatus(status) && nextStatuses(status).length === 0,
    nextStatuses,
    canTransition: (from, to) => hasStatus(to) && nextStatuses(from).includes(to),
  };
  return { ...core, assertTransition: createAssertTransition(core) };
}
