/* Пиктограммы нижней панели «Службы:» (ДДС_image6–20): конверт, карандаш, шеврон, чат, закрытие. */
const PANEL_ICON_PATHS = {
  envelope: "M3 5h18v14H3V5zm2 2v.4l7 4.6 7-4.6V7H5zm14 2.8-7 4.6-7-4.6V17h14V9.8z",
  pencil:
    "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  expand: "M7 10l5-5 5 5-1.4 1.4L12 7.8l-3.6 3.6zm0 4 1.4-1.4 3.6 3.6 3.6-3.6L17 14l-5 5z",
  collapse: "M7 5.4 8.4 4 12 7.6 15.6 4 17 5.4l-5 5zm0 13.2 5-5 5 5-1.4 1.4-3.6-3.6L8.4 20z",
  chat: "M4 3h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8l-5 4V4a1 1 0 0 1 1-1zm7 3v6h2V6h-2zm0 8v2h2v-2h-2z",
  close:
    "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
} as const;

export type PanelIconName = keyof typeof PANEL_ICON_PATHS;

const DEFAULT_SIZE = 16;

export function PanelIcon({ name, size = DEFAULT_SIZE }: { name: PanelIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PANEL_ICON_PATHS[name]} fill="currentColor" />
    </svg>
  );
}
