/*
 * Форма карточки режима 112 → CardDraft (submit) и восстановление формы из событий попытки после перезагрузки.
 * Имена полей событий fieldChanged совпадают с теми, что понимает сервер (services/operator112_service.draft_from_events):
 * what.casualties.injured / what.casualties.blocked → флаги «Пострадавшие» / «НД» для условных служб оповещения.
 * Вкладки «Происшествие …» (спека 009, FR-017): первая вкладка — плоские поля формы (их правит экран), дополнительные —
 * extraIncidents. В CardDraft incidents = [первая, …дополнительные], what = incidents[0].
 */
import { composeFormal } from "@/features/operator112/address";
import type {
  CardChannel,
  CardDraft,
  CardDraftAddress,
  CardDraftLink,
  CardDraftNotification,
  CardDraftWhat,
  CardOutcome,
  NotificationListItem,
  OperatorEvent,
} from "@/shared/api";

/** Адрес по умолчанию (спека 009, FR-014): страна и город Москва. «Очистить адрес» возвращает эти значения. */
export const ADDRESS_DEFAULTS = { country: "Россия", subject: "Москва", locality: "Москва" } as const;

export function emptyAddress(): CardDraftAddress {
  return {
    formal: "",
    street: "",
    house: "",
    okrug: "",
    raion: "",
    descriptive: "",
    source: "manual",
    ...ADDRESS_DEFAULTS,
  };
}

/** Вкладка «Происшествие …» после первой: своя опросная часть и свой список оповещения. */
export type DraftIncident = {
  what: CardDraftWhat;
  notifications: NotificationListItem[];
};

export type DraftForm = {
  applicantName: string;
  applicantStatus: string;
  phoneProvided: string;
  phoneOnSite: string;
  address: CardDraftAddress;
  description: string;
  pollAnswers: string;
  injured: boolean;
  ambulanceRefused: boolean;
  blocked: boolean;
  chs: boolean;
  chp: boolean;
  signs: string[];
  finalType: string;
  classifierCode: string;
  /** Список оповещения первой вкладки из последнего пересчёта сервера (обязательные + добавленные вручную). */
  notifications: NotificationListItem[];
  /** Вкладки после первой (спека 009, FR-017); первая вкладка — плоские поля этой формы. */
  extraIncidents: DraftIncident[];
  /** Связи с карточками журнала; ровно одна primary, пока связи есть (спека 009, FR-016). */
  links: CardDraftLink[];
  /** Исход карточки: заполнена, «нет контакта», «срыв звонка» (спека 009, FR-017 007). */
  outcome: CardOutcome;
  /** Канал поступления из билета: звонок или СМС (спека 009, R5). */
  channel: CardChannel;
};

export const EMPTY_FORM: DraftForm = {
  applicantName: "",
  applicantStatus: "",
  phoneProvided: "",
  phoneOnSite: "",
  address: emptyAddress(),
  description: "",
  pollAnswers: "",
  injured: false,
  ambulanceRefused: false,
  blocked: false,
  chs: false,
  chp: false,
  signs: [],
  finalType: "",
  classifierCode: "",
  notifications: [],
  extraIncidents: [],
  links: [],
  outcome: "filled",
  channel: "call",
};

/**
 * Объединение списков оповещения всех вкладок без дублей (спека 009, FR-017): служба попадает в карточку один раз.
 * Если хотя бы одна вкладка требует её как обязательную (auto), она остаётся auto: такую службу нельзя удалить.
 */
export function mergeNotificationList(
  lists: readonly (readonly NotificationListItem[])[],
): CardDraftNotification[] {
  const byService = new Map<string, CardDraftNotification>();
  for (const list of lists) {
    for (const item of list) {
      const previous = byService.get(item.serviceId);
      if (!previous) {
        byService.set(item.serviceId, { serviceId: item.serviceId, addedBy: item.addedBy });
      } else if (item.addedBy === "auto") {
        previous.addedBy = "auto";
      }
    }
  }
  return [...byService.values()];
}

/**
 * Карточка к передаче. АОН заявителя — из попытки: обучающийся его не вводит. notificationConfirmed — «оповестить» в
 * окне подтверждения оповещения служб (фича 007): без него сервер не сохраняет заполненную карточку.
 */
export function toCardDraft(form: DraftForm, aon: string, notificationConfirmed = false): CardDraft {
  const first: CardDraftWhat = {
    pollAnswers: form.pollAnswers.trim(),
    signs: form.signs,
    flags: [],
    finalType: form.finalType,
    classifierCode: form.classifierCode,
    casualties: { injured: form.injured, ambulanceRefused: form.ambulanceRefused, blocked: form.blocked },
  };
  const incidents = [first, ...form.extraIncidents.map((item) => item.what)];
  return {
    applicant: { name: form.applicantName.trim(), status: form.applicantStatus.trim() },
    phones: { aon, provided: form.phoneProvided.trim(), onSite: form.phoneOnSite.trim() },
    address: form.address,
    what: first,
    incidents,
    description: form.description.trim(),
    emergency: { chs: form.chs, chp: form.chp },
    notificationList: mergeNotificationList([
      form.notifications,
      ...form.extraIncidents.map((item) => item.notifications),
    ]),
    channel: form.channel,
    links: form.links,
    outcome: form.outcome,
    notificationConfirmed,
  };
}

/** Имена полей событий fieldChanged. */
export const FIELD = {
  applicantName: "applicant.name",
  applicantStatus: "applicant.status",
  phoneProvided: "phones.provided",
  phoneOnSite: "phones.onSite",
  street: "address.street",
  house: "address.house",
  okrug: "address.okrug",
  raion: "address.raion",
  descriptive: "address.descriptive",
  addressSource: "address.source",
  country: "address.country",
  subject: "address.subject",
  locality: "address.locality",
  object: "address.object",
  korpus: "address.korpus",
  building: "address.building",
  flat: "address.flat",
  entrance: "address.entrance",
  floor: "address.floor",
  code: "address.code",
  lat: "address.lat",
  lon: "address.lon",
  description: "description",
  pollAnswers: "what.pollAnswers",
  injured: "what.casualties.injured",
  ambulanceRefused: "what.casualties.ambulanceRefused",
  blocked: "what.casualties.blocked",
  chs: "emergency.chs",
  chp: "emergency.chp",
  outcome: "outcome",
} as const;

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Новая вкладка из события typeAdded (finalType обязателен на сервере). */
function newIncident(payload: Record<string, unknown>): DraftIncident {
  return {
    what: {
      pollAnswers: "",
      signs: [],
      flags: [],
      finalType: asText(payload.finalType),
      classifierCode: asText(payload.classifierCode),
      casualties: { injured: false, ambulanceRefused: false, blocked: false },
    },
    notifications: [],
  };
}

/** typeRemoved.index — номер вкладки в общем списке: 0 — первая (плоская, её не удаляют), дополнительные — с 1. */
function removeIncident(incidents: readonly DraftIncident[], index: unknown): DraftIncident[] {
  if (typeof index !== "number" || !Number.isInteger(index) || index < 1) return [...incidents];
  return incidents.filter((_, position) => position !== index - 1);
}

/** Ровно одна главная, пока связи есть: если главная сброшена, ею становится первая. */
function withPrimary(links: CardDraftLink[]): CardDraftLink[] {
  if (links.length === 0 || links.some((link) => link.primary)) return links;
  return links.map((link, index) => ({ ...link, primary: index === 0 }));
}

/** Связи из событий linkAdded / linkRemoved / linkPrimary: первая привязанная карточка становится главной. */
export function applyLinkEvent(
  links: readonly CardDraftLink[],
  type: OperatorEvent["type"],
  cardIdValue: unknown,
): CardDraftLink[] {
  const cardId = asText(cardIdValue).trim();
  if (!cardId) return [...links];
  const linked = links.some((link) => link.cardId === cardId);
  if (type === "linkAdded") return linked ? [...links] : [...links, { cardId, primary: links.length === 0 }];
  if (type === "linkRemoved") return withPrimary(links.filter((link) => link.cardId !== cardId));
  // linkPrimary: главная переезжает на выбранную карточку; несвязанную карточку главной не делаем.
  return linked ? links.map((link) => ({ ...link, primary: link.cardId === cardId })) : [...links];
}

/**
 * Форма из событий попытки (перезагрузка страницы): последнее значение каждого поля fieldChanged, последние признаки
 * signSelected, вкладки typeAdded/typeRemoved и связи linkAdded/linkRemoved/linkPrimary. Список оповещения не
 * восстанавливается — его заново рассчитывает сервер. Старые попытки без новых событий дают значения по умолчанию.
 */
export function restoreForm(events: readonly OperatorEvent[], channel: CardChannel = "call"): DraftForm {
  const form: DraftForm = {
    ...EMPTY_FORM,
    address: emptyAddress(),
    signs: [],
    notifications: [],
    extraIncidents: [],
    links: [],
    channel,
  };
  for (const event of events) {
    if (event.type === "signSelected" && Array.isArray(event.payload.signs)) {
      form.signs = event.payload.signs.map(String);
      continue;
    }
    if (event.type === "typeAdded") {
      form.extraIncidents = [...form.extraIncidents, newIncident(event.payload)];
      continue;
    }
    if (event.type === "typeRemoved") {
      form.extraIncidents = removeIncident(form.extraIncidents, event.payload.index);
      continue;
    }
    if (event.type === "linkAdded" || event.type === "linkRemoved" || event.type === "linkPrimary") {
      form.links = applyLinkEvent(form.links, event.type, event.payload.cardId);
      continue;
    }
    if (event.type !== "fieldChanged") continue;
    const value = event.payload.value;
    switch (event.payload.field) {
      case FIELD.applicantName:
        form.applicantName = asText(value);
        break;
      case FIELD.applicantStatus:
        form.applicantStatus = asText(value);
        break;
      case FIELD.phoneProvided:
        form.phoneProvided = asText(value);
        break;
      case FIELD.phoneOnSite:
        form.phoneOnSite = asText(value);
        break;
      case FIELD.street:
        form.address.street = asText(value);
        break;
      case FIELD.house:
        form.address.house = asText(value);
        break;
      case FIELD.okrug:
        form.address.okrug = asText(value);
        break;
      case FIELD.raion:
        form.address.raion = asText(value);
        break;
      case FIELD.descriptive:
        form.address.descriptive = asText(value);
        break;
      case FIELD.addressSource:
        form.address.source = value === "directory" ? "directory" : "manual";
        break;
      case FIELD.country:
        form.address.country = asText(value);
        break;
      case FIELD.subject:
        form.address.subject = asText(value);
        break;
      case FIELD.locality:
        form.address.locality = asText(value);
        break;
      case FIELD.object:
        form.address.object = asText(value);
        break;
      case FIELD.korpus:
        form.address.korpus = asText(value);
        break;
      case FIELD.building:
        form.address.building = asText(value);
        break;
      case FIELD.flat:
        form.address.flat = asText(value);
        break;
      case FIELD.entrance:
        form.address.entrance = asText(value);
        break;
      case FIELD.floor:
        form.address.floor = asText(value);
        break;
      case FIELD.code:
        form.address.code = asText(value);
        break;
      case FIELD.lat:
        form.address.lat = asNumber(value);
        break;
      case FIELD.lon:
        form.address.lon = asNumber(value);
        break;
      case FIELD.description:
        form.description = asText(value);
        break;
      case FIELD.pollAnswers:
        form.pollAnswers = asText(value);
        break;
      case FIELD.injured:
        form.injured = value === true;
        break;
      case FIELD.ambulanceRefused:
        form.ambulanceRefused = value === true;
        break;
      case FIELD.blocked:
        form.blocked = value === true;
        break;
      case FIELD.chs:
        form.chs = value === true;
        break;
      case FIELD.chp:
        form.chp = value === true;
        break;
      case FIELD.outcome:
        form.outcome = value === "noContact" || value === "dropped" ? value : "filled";
        break;
      default:
        break;
    }
  }
  form.address.formal = composeFormal(form.address);
  return form;
}

export type FormErrors = { address?: string; description?: string; general?: string };

/** Сообщение сервера 400 → поле, у которого его нужно показать (данные при этом сохраняются). */
export function mapSubmitError(message: string): FormErrors {
  if (/адресн/i.test(message)) return { address: message };
  if (/описани|опросн/i.test(message)) return { description: message };
  return { general: message };
}
