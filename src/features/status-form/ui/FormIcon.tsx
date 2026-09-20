/* Пиктограммы ✓ / ✕ строки смены статуса (ДДС_image8–20). */
export function FormIcon({ name }: { name: "check" | "close" }) {
  if (name === "check") {
    return (
      <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
        <path d="M1 6l4.5 4.5L15 1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
