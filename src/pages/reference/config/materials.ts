/* Методические материалы справочной базы (заглушки PDF/DOCX — ТЗ §12; spec/000-фронт/04-pages/04-arm-progress.md). */
export type MaterialFormat = "PDF" | "DOCX" | "MP3" | "Справка";

export type HelpMaterial = {
  id: string;
  title: string;
  format: MaterialFormat;
  description: string;
  /** Для встроенной страницы справки — якорь на этой странице. */
  anchor?: string;
};

export const HOTKEYS_ANCHOR = "hotkeys";

export const HELP_MATERIALS: HelpMaterial[] = [
  {
    id: "memo",
    title: "Памятка работы на АРМ-112",
    format: "PDF",
    description:
      "Порядок работы диспетчера ДДС: статусы карточки, смена статуса службы, записи разговоров, SMS.",
  },
  {
    id: "card-guide",
    title: "Инструкция по заведению карточки",
    format: "DOCX",
    description:
      "Заполнение блоков карточки происшествия: заявитель, адрес, «Что случилось?», опросные карты, службы.",
  },
  {
    id: "classifier",
    title: "Классификатор происшествий v.046_11 (ДТУ от 15.11.2024) — выдержки",
    format: "PDF",
    description: "Типы происшествий, признаки и оповещаемые службы (главная служба, режимы оповещения).",
  },
  {
    id: "hotkeys",
    title: "Горячие клавиши АРМ-112",
    format: "Справка",
    description: "Встроенная страница справки: полные таблицы комбинаций клавиш (п. 3.17).",
    anchor: HOTKEYS_ANCHOR,
  },
];
