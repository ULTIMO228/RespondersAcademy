/*
 * Форма карточки режима 112 → CardDraft (submit) и восстановление формы из событий попытки после перезагрузки.
 * Имена полей событий fieldChanged совпадают с теми, что понимает сервер (services/operator112_service.draft_from_events):
 * what.casualties.injured / what.casualties.blocked → флаги «Пострадавшие» / «НД» для условных служб оповещения.
 */
import { composeFormal } from "@/features/operator112-address";
import type { CardDraft, CardDraftAddress, NotificationListItem, OperatorEvent } from "@/shared/api";

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
  /** Список оповещения из последнего пересчёта сервера (обязательные + добавленные вручную). */
  notifications: NotificationListItem[];
};

export const EMPTY_FORM: DraftForm = {
  applicantName: "",
  applicantStatus: "",
  phoneProvided: "",
  phoneOnSite: "",
  address: { formal: "", street: "", house: "", okrug: "", raion: "", descriptive: "", source: "manual" },
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
};

/** Карточка к передаче. АОН заявителя — из попытки: обучающийся его не вводит. */
export function toCardDraft(form: DraftForm, aon: string): CardDraft {
  return {
    applicant: { name: form.applicantName.trim(), status: form.applicantStatus.trim() },
    phones: { aon, provided: form.phoneProvided.trim(), onSite: form.phoneOnSite.trim() },
    address: form.address,
    what: {
      pollAnswers: form.pollAnswers.trim(),
      signs: form.signs,
      flags: [],
      finalType: form.finalType,
      classifierCode: form.classifierCode,
      casualties: { injured: form.injured, ambulanceRefused: form.ambulanceRefused, blocked: form.blocked },
    },
    description: form.description.trim(),
    emergency: { chs: form.chs, chp: form.chp },
    notificationList: form.notifications.map((item) => ({
      serviceId: item.serviceId,
      addedBy: item.addedBy,
    })),
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
  description: "description",
  pollAnswers: "what.pollAnswers",
  injured: "what.casualties.injured",
  ambulanceRefused: "what.casualties.ambulanceRefused",
  blocked: "what.casualties.blocked",
  chs: "emergency.chs",
  chp: "emergency.chp",
} as const;

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Форма из событий попытки (перезагрузка страницы): последнее значение каждого поля fieldChanged и последние признаки
 * signSelected. Список оповещения не восстанавливается — его заново рассчитывает сервер.
 */
export function restoreForm(events: readonly OperatorEvent[]): DraftForm {
  const form: DraftForm = { ...EMPTY_FORM, address: { ...EMPTY_FORM.address } };
  for (const event of events) {
    if (event.type === "signSelected" && Array.isArray(event.payload.signs)) {
      form.signs = event.payload.signs.map(String);
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
