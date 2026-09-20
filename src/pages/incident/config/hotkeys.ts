/*
 * Горячие клавиши карточки (spec/04-pages/02-arm-card.md §15, источник п. 3.17) — подписи дословно по таблицам.
 * В ДДС-режиме тренажёра активны общие и режим просмотра; режим создания — только в подсказках по зажатому Alt.
 */
export type HotkeyRow = { keys: string; action: string };
export type HotkeyGroup = { title: string; isActive: boolean; rows: HotkeyRow[] };

export const HOTKEY_GROUPS: HotkeyGroup[] = [
  {
    title: "Общие",
    isActive: true,
    rows: [
      { keys: "Alt (зажатие)", action: "Отображение подсказок по комбинациям клавиш" },
      { keys: "Insert", action: "Создать новую карточку (в тренажёре: режим преподавателя)" },
      { keys: "Esc", action: "Закрыть карточку / всплывающее окно" },
      { keys: "Tab / Shift+Tab", action: "Переход вперёд/назад между полями и кнопками" },
    ],
  },
  {
    title: "Режим просмотра",
    isActive: true,
    rows: [
      { keys: "Shift+F1", action: "Пункт меню «Просмотр»" },
      { keys: "Shift+F2", action: "Пункт меню «Дополнить»" },
      { keys: "Alt+S", action: "«Отработана» / «Завершить» (по статусу КП)" },
      { keys: "Alt+Y", action: "«Проверена» (в статусе Проверена)" },
      { keys: "Alt+N", action: "«Вернуть на доработку» (в статусе Проверена)" },
    ],
  },
  {
    title: "Переход к блокам карточки (режим создания — неактивны)",
    isActive: false,
    rows: [
      { keys: "Alt+F1 / Alt+F2 / Alt+F3", action: "К блокам телефонных номеров" },
      { keys: "Alt+K", action: "К блоку «Канал связи»" },
      { keys: "Alt+Q", action: "К блоку заявителя" },
      { keys: "Alt+A", action: "К блоку «Адрес»" },
      { keys: "Alt+P", action: "К блоку пострадавших" },
      { keys: "Alt+N", action: "К блоку «Нет контакта / Срыв звонка»" },
      { keys: "Alt+T", action: "К блоку «Что случилось»" },
      { keys: "Alt+R", action: "К блоку значимого типа происшествия" },
      { keys: "Alt+O", action: "К блоку описания / отработок" },
      { keys: "Alt+Z", action: "К блоку управления службами" },
      { keys: "Alt+1..n", action: "К блокам добавленных опросных карт" },
    ],
  },
  {
    title: "Мгновенные действия (режим создания — неактивны)",
    isActive: false,
    rows: [
      { keys: "Alt+S", action: "Сохранение карточки" },
      { keys: "Alt+W", action: "Создание связи" },
      { keys: "Alt+B", action: "Создание напоминания" },
      { keys: "Alt+V", action: "Указание происшествия как важного" },
      { keys: "Alt+M", action: "Создание сообщения об ошибке" },
    ],
  },
];
