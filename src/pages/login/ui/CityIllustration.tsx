import styles from "./CityIllustration.module.css";

/**
 * Полная векторная сцена из city_stage_buildings.html.
 * SVG вынесен в public, чтобы браузер кэшировал тяжёлую иллюстрацию отдельно от React-разметки.
 */
export function CityIllustration() {
  return <div className={styles.city} aria-hidden="true" />;
}
