/*
 * Фильтры расширенного поиска карточек главного экрана АРМ — spec/000-фронт/04-pages/01-arm-main.md → «Расширенный поиск»
 * (памятка стр. 35–40). Имена полей = термины спеки (вход маппинга query → filters в GET /api/mock/cards, T1.2-04).
 * Семантика: AND между полями, OR внутри множественного поля; пустое/незаданное поле не применяется.
 */
import type { CardStatus } from "./reference";

export type CardSearchFilters = {
  /** Тип происшествия — подстрока итогового типа / класса КП. */
  incidentType?: string;
  /**
   * Признаки происшествия (дерево опросной карты), OR. Поиск только по 1–2-му уровню дерева:
   * по 3-му уровню ПОВ-112 не ищет — ограничение памятки сохраняется честно.
   */
  signs?: string[];
  /** АРМ (номера рабочих мест из «Опер. N, АРМ M, …»), OR. */
  arms?: string[];
  /** Адрес формализованный — подстрока. */
  address?: string;
  /** По округу (список «через запятую»), OR. */
  okrugs?: string[];
  /** По району — одно значение, точное совпадение. */
  raion?: string;
  /** По описательному адресу — подстрока. */
  descriptiveAddress?: string;
  /** По региону — компонент формализованного адреса перед «(округ, район)»: «Россия, Москва, …» → «Москва». */
  region?: string;
  /** По службе — id ServiceRef из notificationList, OR. */
  services?: string[];
  /** По описанию — подстрока. */
  description?: string;
  /** Заявитель: подстрока ФИО или цифры АОН. */
  applicant?: string;
  /** По каналу связи (reference.channels), OR. */
  channels?: string[];
  /** По источнику происшествия (ВИС, reference.sources), OR. */
  sources?: string[];
  /** По оператору, работавшему с КП из ВИС — подстрока. */
  operator?: string;
  /** Номер карточки — подстрока номера. */
  cardNumber?: string;
  /** Статус карточки, OR. */
  cardStatuses?: CardStatus[];
  /** Период заведения карточки: createdAt ≥ createdFrom (ISO, включительно). */
  createdFrom?: string;
  /** Период заведения карточки: createdAt ≤ createdTo (ISO, включительно). */
  createdTo?: string;
};
