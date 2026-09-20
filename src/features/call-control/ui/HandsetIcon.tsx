type HandsetIconProps = {
  size?: number;
  /** Положенная трубка — «Отключение» / «Завершить» (как в шапке карточки ДДС_image6). */
  isHungUp?: boolean;
  className?: string;
};

const DEFAULT_SIZE = 18;
const HANDSET_PATH =
  "M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z";
const HUNG_UP_TRANSFORM = "rotate(135 12 12)";

/** Пиктограмма телефонной трубки ПОВ-112 (в наборе icons/ её нет — маленький inline-SVG). */
export function HandsetIcon({ size = DEFAULT_SIZE, isHungUp = false, className }: HandsetIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={HANDSET_PATH} fill="currentColor" transform={isHungUp ? HUNG_UP_TRANSFORM : undefined} />
    </svg>
  );
}
