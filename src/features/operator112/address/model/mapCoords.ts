/*
 * Пересчёт клика по локальной подложке «С112 — карта» в координаты и обратно. Подложка — схема public/mock-map-tile.svg,
 * не реальная карта: центр — Москва, охват условный (спека 009, FR-015).
 */
export const MAP_CENTER = { lat: 55.7558, lon: 37.6173 } as const;
const SPAN_LAT = 0.006;
const SPAN_LON = 0.012;
const PRECISION = 6;

export type MapPoint = { lat: number; lon: number };
export type MapFraction = { x: number; y: number };

export function pointFromFraction({ x, y }: MapFraction): MapPoint {
  return {
    lat: Number((MAP_CENTER.lat - (y - 0.5) * SPAN_LAT).toFixed(PRECISION)),
    lon: Number((MAP_CENTER.lon + (x - 0.5) * SPAN_LON).toFixed(PRECISION)),
  };
}

/** Позиция маркера в долях окна; вне охвата подложки — null (маркер не рисуется). */
export function fractionFromPoint({ lat, lon }: MapPoint): MapFraction | null {
  const x = (lon - MAP_CENTER.lon) / SPAN_LON + 0.5;
  const y = (MAP_CENTER.lat - lat) / SPAN_LAT + 0.5;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}

/** Разбор поля «Широта» / «Долгота»: запятая допустима, диапазон проверяется. */
export function parseCoordinate(text: string, limit: number): number | null {
  const value = Number.parseFloat(text.trim().replace(",", "."));
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}
