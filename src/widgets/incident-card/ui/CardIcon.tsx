/*
 * Пиктограммы карточки, которых нет в каноническом наборе icons/ (ArmIcon): трубка, чат, ЧС/ЧП,
 * карандаш, карта. Плоские inline-SVG в стиле боевого интерфейса (ДДС_image6, p23_Image108).
 */
const ICON_PATHS = {
  hangup:
    "M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85a1 1 0 0 1-1.41-.02L.29 13.07a1 1 0 0 1 0-1.41C3.34 8.77 7.46 7 12 7s8.66 1.77 11.71 4.66a1 1 0 0 1 0 1.41l-2.48 2.48a1 1 0 0 1-1.41.02 11.3 11.3 0 0 0-2.67-1.85 1 1 0 0 1-.56-.9v-3.1A15.9 15.9 0 0 0 12 9z",
  phone:
    "M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z",
  chat: "M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM8 11H6V9h2v2zm5 0h-2V9h2v2zm5 0h-2V9h2v2z",
  lightning: "M7 2v11h3v9l7-12h-4l4-8z",
  warning: "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z",
  pencil:
    "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  map: "M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9a.5.5 0 0 0-.36.48V20.5a.5.5 0 0 0 .66.47L9 18.9l6 2.1 5.64-1.9a.5.5 0 0 0 .36-.48V3.5a.5.5 0 0 0-.5-.5zM12 15.5s-3-3.2-3-5.2a3 3 0 0 1 6 0c0 2-3 5.2-3 5.2zm0-6.2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  mapOff:
    "M12 2a7 7 0 0 0-5.84 3.14l9.8 9.8C17.4 12.9 19 10.6 19 9a7 7 0 0 0-7-7zM3.27 2 2 3.27l3.2 3.2C5.07 7.28 5 8.13 5 9c0 5.25 7 13 7 13s1.67-1.84 3.38-4.35L20.73 23 22 21.73 3.27 2z",
  check: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  close:
    "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
} as const;

export type CardIconName = keyof typeof ICON_PATHS;

type CardIconProps = {
  name: CardIconName;
  size?: number;
  className?: string;
};

const DEFAULT_ICON_SIZE = 20;

export function CardIcon({ name, size = DEFAULT_ICON_SIZE, className }: CardIconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICON_PATHS[name]} fill="currentColor" />
    </svg>
  );
}
