import styles from "./CityIllustration.module.css";

/*
 * Стилизованная иллюстрация фона входа ПОВ-112 (ДДС_image1): небоскрёбы, светлые дома, вертолёт.
 * Координаты — в системе скриншота (1872×964), цвета — токены --color-login-* / --journal-login-*.
 */

type Block = { x: number; y: number; width: number; height: number; tone: string };

const FLOOR = 964;

const TOWERS: Block[] = [
  { x: 52, y: 310, width: 150, height: FLOOR - 310, tone: "city__building" },
  { x: 228, y: 0, width: 80, height: FLOOR, tone: "city__building-dark" },
  { x: 306, y: 0, width: 82, height: FLOOR, tone: "city__building-light" },
  { x: 360, y: 150, width: 90, height: FLOOR - 150, tone: "city__building-dark" },
  { x: 440, y: 150, width: 32, height: FLOOR - 150, tone: "city__building" },
  { x: 500, y: 262, width: 12, height: FLOOR - 262, tone: "city__building-dark" },
  { x: 510, y: 262, width: 112, height: FLOOR - 262, tone: "city__building-light" },
  { x: 652, y: 360, width: 14, height: FLOOR - 360, tone: "city__building-dark" },
  { x: 664, y: 360, width: 108, height: FLOOR - 360, tone: "city__building-light" },
  { x: 918, y: 316, width: 12, height: FLOOR - 316, tone: "city__building-dark" },
  { x: 990, y: 665, width: 14, height: FLOOR - 665, tone: "city__building-dark" },
  { x: 1002, y: 665, width: 86, height: FLOOR - 665, tone: "city__building-light" },
];

const HOUSES: Block[] = [
  { x: 100, y: 740, width: 236, height: FLOOR - 740, tone: "city__house-light" },
  { x: 334, y: 850, width: 70, height: FLOOR - 850, tone: "city__house" },
  { x: 380, y: 868, width: 420, height: FLOOR - 868, tone: "city__house-light" },
  { x: 1150, y: 795, width: 100, height: FLOOR - 795, tone: "city__house-light" },
  { x: 1245, y: 775, width: 275, height: FLOOR - 775, tone: "city__house" },
  { x: 1470, y: 860, width: 250, height: FLOOR - 860, tone: "city__house-light" },
  { x: 0, y: 944, width: 1872, height: FLOOR - 944, tone: "city__house-light" },
];

const WINDOW_BANDS: Block[] = [
  { x: 115, y: 780, width: 150, height: 14, tone: "city__window" },
  { x: 115, y: 812, width: 150, height: 14, tone: "city__window" },
  { x: 115, y: 844, width: 150, height: 14, tone: "city__window" },
  { x: 115, y: 876, width: 150, height: 14, tone: "city__window" },
  { x: 115, y: 908, width: 150, height: 14, tone: "city__window" },
  { x: 480, y: 896, width: 255, height: 8, tone: "city__window-light" },
  { x: 480, y: 918, width: 255, height: 8, tone: "city__window-light" },
  { x: 1185, y: 820, width: 56, height: 6, tone: "city__window-light" },
  { x: 1185, y: 846, width: 56, height: 6, tone: "city__window-light" },
  { x: 1185, y: 872, width: 56, height: 6, tone: "city__window-light" },
  { x: 1280, y: 810, width: 146, height: 12, tone: "city__window-light" },
  { x: 1280, y: 838, width: 146, height: 12, tone: "city__window-light" },
  { x: 1280, y: 866, width: 146, height: 12, tone: "city__window-light" },
  { x: 1280, y: 894, width: 146, height: 12, tone: "city__window-light" },
  { x: 1488, y: 906, width: 130, height: 12, tone: "city__window" },
];

const FLOOR_LINES = [420, 555, 690, 830];

function Helicopter() {
  return (
    <g transform="translate(638 142)">
      <rect x="0" y="0" width="136" height="3" className={styles["city__heli-dark"]} />
      <rect x="64" y="3" width="4" height="11" className={styles["city__heli-dark"]} />
      <path
        d="M20 34Q20 14 60 14H96Q110 16 112 30V44Q110 52 90 52H32Q20 50 20 40Z"
        className={styles["city__heli-body"]}
      />
      <path d="M110 28L150 16L153 21L112 40Z" className={styles["city__heli-body"]} />
      <path d="M146 12L158 28M158 12L146 28" className={styles["city__heli-rotor"]} />
      <path d="M22 44H112L108 51H30Z" className={styles["city__heli-stripe"]} />
      <path d="M20 34Q18 50 34 52L30 38Z" className={styles["city__heli-dark"]} />
      <rect x="40" y="20" width="32" height="14" rx="2" className={styles["city__heli-glass"]} />
      <path d="M36 54V62M92 54V62M26 62H104" className={styles["city__heli-rotor"]} />
    </g>
  );
}

function renderBlocks(blocks: Block[]) {
  return blocks.map((block) => (
    <rect
      key={`${block.x}-${block.y}-${block.width}`}
      x={block.x}
      y={block.y}
      width={block.width}
      height={block.height}
      className={styles[block.tone]}
    />
  ));
}

/** Фон экрана «112 ВХОД В СИСТЕМУ» — локальный inline-SVG без растровых обрезков. */
export function CityIllustration() {
  return (
    <svg
      className={styles.city}
      viewBox="0 0 1872 964"
      preserveAspectRatio="xMinYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0 70Q70 0 150 24V964H0Z" className={styles["city__building-light"]} />
      <rect x="54" y="60" width="40" height="904" className={styles.city__building} />
      {renderBlocks(TOWERS)}
      <path d="M782 964V318Q855 286 928 318V964Z" className={styles["city__building-light"]} />
      <path d="M782 964V318Q808 306 836 302V964Z" className={styles.city__building} />
      {FLOOR_LINES.map((lineY) => (
        <path
          key={lineY}
          d={`M510 ${lineY}H622M664 ${lineY + 60}H772`}
          className={styles["city__floor-line"]}
        />
      ))}
      <Helicopter />
      {renderBlocks(HOUSES)}
      {renderBlocks(WINDOW_BANDS)}
    </svg>
  );
}
