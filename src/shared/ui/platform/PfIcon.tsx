/* Локальные SVG-иконки платформы (stroke 1.75, без внешних наборов и CDN); симулятор использует ArmIcon. */
const PATHS = {
  home: "M3 11l9-8 9 8M5 10v10h14V10",
  tasks: "M6 3h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2zM8 8h8M8 12h8M8 16h5",
  results: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  analytics: "M3 17l6-6 4 4 8-9M15 6h6v6",
  book: "M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 21V5",
  sim: "M5 4h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM8 20h8M12 16v4",
  user: "M12 4a4 4 0 100 8 4 4 0 000-8zM4 21a8 8 0 0116 0",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4",
  info: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 8v5M12 16h.01",
  arrow: "M5 12h14M13 6l6 6-6 6",
  users: "M9 4.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM2 20a7 7 0 0114 0M17 4.5a3.5 3.5 0 010 7M18 14a7 7 0 013 6",
  calendar: "M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM3 10h18M8 3v4M16 3v4",
  pulse: "M3 12h4l3-8 4 16 3-8h4",
  doc: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  log: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h4",
  server:
    "M4 4h16a1.5 1.5 0 011.5 1.5v3A1.5 1.5 0 0120 10H4a1.5 1.5 0 01-1.5-1.5v-3A1.5 1.5 0 014 4zM4 14h16a1.5 1.5 0 011.5 1.5v3A1.5 1.5 0 0120 20H4a1.5 1.5 0 01-1.5-1.5v-3A1.5 1.5 0 014 14zM7 7h.01M7 17h.01",
  warning: "M12 3l10 18H2zM12 10v5M12 18h.01",
  inbox: "M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5",
  logout: "M9 4H5v16h4M16 8l4 4-4 4M20 12H9",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronRight: "M9 6l6 6-6 6",
} as const;

export type PfIconName = keyof typeof PATHS;

type PfIconProps = {
  name: PfIconName;
  size?: number;
  className?: string;
};

export function PfIcon({ name, size = 20, className }: PfIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
