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
  chevronDown: "M6 9l6 6 6-6",
  /* Конструктор сценариев (фича 005): панель действий и блоки схемы. */
  flow: "M4.5 3h5A1.5 1.5 0 0111 4.5v3A1.5 1.5 0 019.5 9h-5A1.5 1.5 0 013 7.5v-3A1.5 1.5 0 014.5 3zM14.5 15h5a1.5 1.5 0 011.5 1.5v3a1.5 1.5 0 01-1.5 1.5h-5a1.5 1.5 0 01-1.5-1.5v-3a1.5 1.5 0 011.5-1.5zM7 9v3a3 3 0 003 3h3",
  list: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
  redo: "M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3",
  save: "M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7",
  validate: "M12 3a9 9 0 100 18 9 9 0 000-18zM8.5 12l2.5 2.5 4.5-5",
  play: "M8 5l11 7-11 7z",
  stop: "M6 6h12v12H6z",
  publish: "M12 16V4M7 9l5-5 5 5M5 20h14",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  align: "M4 6h16M8 12h8M6 18h12",
  keyboard: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  copy: "M8 8h12v12H8zM4 16V4h12",
  map: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15",
  flowStart: "M8 5l11 7-11 7z",
  flowEnd: "M5 21V4M5 4h11l-2 4 2 4H5",
  flowCall: "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z",
  flowReply: "M4 5h16v11H9l-5 4z",
  flowQuestion: "M12 3a9 9 0 100 18 9 9 0 000-18zM9.5 9a2.5 2.5 0 015 0c0 2-2.5 2-2.5 4M12 17h.01",
  flowAction: "M4 12l5 5L20 6",
  flowForbidden: "M12 3a9 9 0 100 18 9 9 0 000-18zM6 6l12 12",
  flowCondition: "M12 3l9 9-9 9-9-9z",
  flowRandom: "M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3",
  flowBriefing: "M4 10v4h3l6 4V6L7 10zM17 9a4 4 0 010 6",
  flowHint: "M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z",
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
