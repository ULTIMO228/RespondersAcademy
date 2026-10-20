"use client";

import { useId, useState } from "react";
import type { MouseEvent } from "react";

import { fractionFromPoint, parseCoordinate, pointFromFraction } from "../model/mapCoords";
import type { MapPoint } from "../model/mapCoords";

import styles from "./MapWindow.module.css";

type MapWindowProps = {
  lat?: number;
  lon?: number;
  /** «ОК»: применить координаты из полей и закрыть окно. */
  onApply: (point: MapPoint) => void;
  onClose: () => void;
};

const MAP_TILE = "/mock-map-tile.svg";

/** Окно «С112 — карта» (КАРТОЧКА_image5; спека 009, FR-015): широта/долгота, «Указать на карте», локальная подложка без сети. */
export function MapWindow({ lat, lon, onApply, onClose }: MapWindowProps) {
  const titleId = useId();
  const [latText, setLatText] = useState(lat === undefined ? "" : String(lat));
  const [lonText, setLonText] = useState(lon === undefined ? "" : String(lon));
  const [isPicking, setPicking] = useState(false);
  const [error, setError] = useState("");

  const latValue = parseCoordinate(latText, 90);
  const lonValue = parseCoordinate(lonText, 180);
  const marker =
    latValue !== null && lonValue !== null ? fractionFromPoint({ lat: latValue, lon: lonValue }) : null;

  const onMapClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!isPicking) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    const point = pointFromFraction({
      x: Math.min(Math.max((event.clientX - rect.left) / width, 0), 1),
      y: Math.min(Math.max((event.clientY - rect.top) / height, 0), 1),
    });
    setLatText(String(point.lat));
    setLonText(String(point.lon));
    setPicking(false);
    setError("");
  };

  const apply = () => {
    if (latValue === null || lonValue === null) {
      setError("Введите широту и долготу числами");
      return;
    }
    onApply({ lat: latValue, lon: lonValue });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.window} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={styles.window__head}>
          <h2 id={titleId} className={styles.window__title}>
            С112 - карта
          </h2>
          <button type="button" className={styles.window__close} aria-label="Закрыть карту" onClick={onClose}>
            ×
          </button>
        </div>
        <div className={styles.map} data-picking={isPicking} onClick={onMapClick} data-testid="map-surface">
          {/* Локальная подложка: внешних тайлов нет (конституция I). */}
          <img className={styles.map__tile} src={MAP_TILE} alt="" draggable={false} />
          {marker ? (
            <span
              className={styles.map__marker}
              data-testid="map-marker"
              style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
            />
          ) : null}
          <div className={styles.map__tools} onClick={(event) => event.stopPropagation()}>
            <input
              className={styles.map__input}
              placeholder="Широта"
              aria-label="Широта"
              inputMode="decimal"
              value={latText}
              onChange={(event) => setLatText(event.target.value)}
            />
            <input
              className={styles.map__input}
              placeholder="Долгота"
              aria-label="Долгота"
              inputMode="decimal"
              value={lonText}
              onChange={(event) => setLonText(event.target.value)}
            />
            <button type="button" className={styles.map__btn} onClick={apply}>
              ОК
            </button>
            <button
              type="button"
              className={styles.map__btn}
              aria-pressed={isPicking}
              onClick={() => setPicking((value) => !value)}
            >
              Указать на карте
            </button>
            <span className={styles.map__spacer} />
            <button type="button" className={styles.map__btn} disabled>
              50 м
            </button>
            <button type="button" className={styles.map__btn} disabled title="Камеры, техника, объекты">
              Слой
            </button>
          </div>
          {error ? (
            <p className={styles.map__error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
