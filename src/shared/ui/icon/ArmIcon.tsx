import styles from "./ArmIcon.module.css";

/** Канонический набор из 20 восстановленных SVG АРМ-112 (icons/manifest.json). */
export type ArmIconName =
  | "search"
  | "advanced-chevron"
  | "section-collapse"
  | "notification"
  | "filter-chevron"
  | "top-monitor"
  | "top-settings"
  | "top-info"
  | "top-exit"
  | "sort-down"
  | "row-expand"
  | "row-bookmark"
  | "row-important"
  | "row-reminder"
  | "service-status"
  | "clipboard"
  | "page-dropdown"
  | "page-size-dropdown"
  | "pagination-prev"
  | "pagination-next";

type ArmIconProps = {
  name: ArmIconName;
  size?: number;
  width?: number;
  height?: number;
  label?: string;
  className?: string;
};

export function ArmIcon({ name, size, width, height, label, className }: ArmIconProps) {
  return (
    <img
      className={[styles.icon, className].filter(Boolean).join(" ")}
      src={`/icons/${name}.svg`}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      width={width ?? size}
      height={height ?? size}
      draggable={false}
    />
  );
}
