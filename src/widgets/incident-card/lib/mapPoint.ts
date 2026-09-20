import { MAP_BOUNDS } from "../config/constants";

export type MapPoint = { xPercent: number; yPercent: number };

const PERCENT = 100;
/* Полигон местоположения СМС-карточки (п. 14): радиус вокруг точки, % ширины/высоты карты. */
const SMS_POLYGON_RADIUS = 7;
const SMS_POLYGON_VERTICES = 6;

function clampPercent(value: number): number {
  return Math.min(PERCENT, Math.max(0, value));
}

/** Координаты фикстуры → позиция точки на карте-заглушке (линейная проекция в границах Москвы). */
export function projectGeoToMap(geo: { lat: number; lon: number } | null | undefined): MapPoint | null {
  if (!geo) return null;
  const { latMin, latMax, lonMin, lonMax } = MAP_BOUNDS;
  return {
    xPercent: clampPercent(((geo.lon - lonMin) / (lonMax - lonMin)) * PERCENT),
    yPercent: clampPercent(((latMax - geo.lat) / (latMax - latMin)) * PERCENT),
  };
}

/** Обратная проекция: клик по карте-заглушке → координаты. */
export function unprojectMapPoint(point: MapPoint): { lat: number; lon: number } {
  const { latMin, latMax, lonMin, lonMax } = MAP_BOUNDS;
  return {
    lat: latMax - (point.yPercent / PERCENT) * (latMax - latMin),
    lon: lonMin + (point.xPercent / PERCENT) * (lonMax - lonMin),
  };
}

/** Вершины полигона вокруг точки (SVG points в процентах вьюбокса 0..100). */
export function buildSmsPolygon(point: MapPoint): string {
  return Array.from({ length: SMS_POLYGON_VERTICES }, (_, index) => {
    const angle = (2 * Math.PI * index) / SMS_POLYGON_VERTICES;
    const x = clampPercent(point.xPercent + SMS_POLYGON_RADIUS * Math.cos(angle));
    const y = clampPercent(point.yPercent + SMS_POLYGON_RADIUS * Math.sin(angle));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}
