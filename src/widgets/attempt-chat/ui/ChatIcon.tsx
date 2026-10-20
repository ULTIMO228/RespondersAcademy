/* Иконки шторки, которых нет в PfIcon: тот же стиль (stroke 1.75, currentColor, без внешних наборов). */
const PATHS = {
  close: "M6 6l12 12M18 6L6 18",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  chat: "M4 5h16v11H9l-5 4z",
} as const;

type ChatIconProps = { name: keyof typeof PATHS; size?: number };

export function ChatIcon({ name, size = 20 }: ChatIconProps) {
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
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
