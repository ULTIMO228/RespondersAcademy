/* Тренажёрные нормативы (статичные строки волны 0; тикающая логика — волна 2). */
export const DEFAULT_TIMER_VALUE = "3:00";
export const DEFAULT_REACTION_VALUE = "0:18";

/* Мок-записи разговоров по АОН карточки (spec п. 13): длительности в мс. */
export const MOCK_RECORDING_DURATIONS_MS = [84_000, 37_000] as const;

export const PHONE_MASK_TEMPLATE = "+7 (___) ___-__-__";
export const EMPTY_APPLICANT_LABEL = "ФИО заявителя";
/* Пометки пустых блоков карточки из ВИС (памятка стр. 14): блоки не скрываются молча. */
export const VIS_EMPTY_APPLICANT_LABEL = "Заявитель: нет данных (карточка из ВИС)";
export const VIS_EMPTY_KLASS = "нет данных (карточка из ВИС)";

/* Локальная карта-заглушка (public/mock-map-tile.svg) и границы проекции координат Москвы. */
export const MAP_TILE_SRC = "/mock-map-tile.svg";
export const MAP_BOUNDS = { latMin: 55.49, latMax: 55.96, lonMin: 37.29, lonMax: 37.97 } as const;
