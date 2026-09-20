/*
 * «Горячие клавиши АРМ-112» — дословно spec/04-pages/04-arm-progress.md
 * (сверено с spec/04-pages/02-arm-card.md §15 и п. 3.17 единого документа).
 */
/**
 * Активность в тренажёре (spec/04-pages/02-arm-card.md §15, T2.3-19): в ДДС-режиме действуют общие комбинации
 * и режим просмотра; режим создания и окно добавления связи — справочно (карточка открывается заведённой).
 */
export type HotkeyActivity = "active" | "reference";

/** note — уточнение для строки, чья активность отличается от раздела. */
export type HotkeyRow = { keys: string; action: string; note?: string };
export type HotkeySection = { id: string; title: string; activity: HotkeyActivity; rows: HotkeyRow[] };

export const HOTKEY_ACTIVITY_TITLES: Record<HotkeyActivity, string> = {
  active: "В тренажёре активны",
  reference: "Справочно: в тренажёре неактивны",
};

/** Строка режима просмотра, которой нет среди активных в карточке тренажёра (02-arm-card.md §15). */
const VIEW_REFERENCE_NOTE = "справочно — в тренажёре не действует";

export const HOTKEY_SECTIONS: HotkeySection[] = [
  {
    id: "common",
    title: "Общие",
    activity: "active",
    rows: [
      { keys: "Alt (зажатие)", action: "Отображение подсказок по комбинациям клавиш" },
      {
        keys: "Insert",
        action: "Создать новую карточку",
        note: "у обучающегося не действует — карточки выдаёт преподаватель",
      },
      { keys: "Esc", action: "Закрыть карточку / всплывающее окно" },
      { keys: "Tab / Shift+Tab", action: "Переход вперёд/назад между полями и кнопками" },
    ],
  },
  {
    id: "create-blocks",
    title: "Переход к блокам карточки (режим создания)",
    activity: "reference",
    rows: [
      { keys: "Alt+F1 / Alt+F2 / Alt+F3", action: "К блокам телефонных номеров" },
      { keys: "Alt+K", action: "К блоку «Канал связи»" },
      { keys: "Alt+Q", action: "К блоку заявителя" },
      { keys: "Alt+A", action: "К блоку «Адрес»" },
      { keys: "Alt+P", action: "К блоку пострадавших" },
      { keys: "Alt+N", action: "К блоку «Нет контакта / Срыв звонка»" },
      { keys: "Alt+T", action: "К блоку «Что случилось»" },
      { keys: "Alt+R", action: "К блоку значимого типа происшествия" },
      { keys: "Alt+O", action: "К блоку описания" },
      { keys: "Alt+Z", action: "К блоку управления службами" },
      { keys: "Alt+1…n", action: "К блокам добавленных опросных карт (напр. Alt+1)" },
      { keys: "Alt+Ctrl+1…n", action: "К определённым вопросам в опросных картах" },
    ],
  },
  {
    id: "create-actions",
    title: "Мгновенные действия (режим создания)",
    activity: "reference",
    rows: [
      { keys: "Alt+S", action: "Сохранение карточки" },
      { keys: "Alt+W", action: "Создание связи" },
      { keys: "Alt+B", action: "Создание напоминания" },
      { keys: "Alt+V", action: "Указание происшествия как важного" },
      { keys: "Alt+M", action: "Создание сообщения об ошибке" },
    ],
  },
  {
    id: "view",
    title: "Режим просмотра",
    activity: "active",
    rows: [
      { keys: "Alt+O", action: "К блоку отработок", note: VIEW_REFERENCE_NOTE },
      { keys: "Shift+F1", action: "Пункт меню «Просмотр»" },
      { keys: "Shift+F2", action: "Пункт меню «Дополнить»" },
      { keys: "Alt+S", action: "«Отработана» / «Завершить» (по статусу карточки)" },
      { keys: "Alt+W", action: "Создание связи", note: VIEW_REFERENCE_NOTE },
      { keys: "Alt+B", action: "Создание напоминания", note: VIEW_REFERENCE_NOTE },
      { keys: "Alt+V", action: "«Важное происшествие»", note: VIEW_REFERENCE_NOTE },
      { keys: "Alt+Y", action: "«Проверена» (в статусе Проверена)" },
      { keys: "Alt+N", action: "«Вернуть на доработку» (в статусе Проверена)" },
    ],
  },
  {
    id: "link-window",
    title: "Окно добавления связи",
    activity: "reference",
    rows: [
      { keys: "Alt+1", action: "К блоку поиска происшествия" },
      { keys: "Alt+2", action: "К блоку списка происшествий" },
      { keys: "Alt+3", action: "К кнопке возврата" },
    ],
  },
];
