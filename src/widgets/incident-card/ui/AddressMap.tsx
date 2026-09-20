"use client";

import type { MouseEvent } from "react";

import { MAP_TILE_SRC } from "../config/constants";
import { buildSmsPolygon } from "../lib/mapPoint";
import type { MapPoint } from "../lib/mapPoint";

import styles from "./AddressMap.module.css";

type AddressMapProps = {
  point: MapPoint | null;
  /** Режим «Указать на карте»: клик по карте ставит отметку. */
  isPicking: boolean;
  onPick: (point: MapPoint) => void;
  /** Полигон местоположения входящей СМС (п. 14). */
  showPolygon?: boolean;
};

const PERCENT = 100;

/** Локальная карта-заглушка со статичным тайлом, точкой и полигоном (без внешних сервисов). */
export function AddressMap({ point, isPicking, onPick, showPolygon = false }: AddressMapProps) {
  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (!isPicking) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onPick({
      xPercent: ((event.clientX - rect.left) / rect.width) * PERCENT,
      yPercent: ((event.clientY - rect.top) / rect.height) * PERCENT,
    });
  }

  return (
    <div
      className={[styles.map, isPicking ? styles["map--picking"] : ""].join(" ")}
      onClick={handleClick}
      role="img"
      aria-label={
        point ? "Локальная карта: отметка места происшествия" : "Локальная карта: координаты не заданы"
      }
    >
      <img className={styles.map__tile} src={MAP_TILE_SRC} alt="" draggable={false} />
      {point && showPolygon ? (
        <svg
          className={styles.map__polygon}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          data-testid="map-polygon"
        >
          <polygon points={buildSmsPolygon(point)} />
        </svg>
      ) : null}
      {point ? (
        <span
          className={styles.map__point}
          style={{ left: `${point.xPercent}%`, top: `${point.yPercent}%` }}
          data-testid="map-point"
        />
      ) : (
        <span className={styles.map__empty}>Координаты не заданы</span>
      )}
    </div>
  );
}
