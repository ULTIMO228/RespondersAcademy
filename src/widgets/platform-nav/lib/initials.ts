/** «Иванов Сергей Петрович» → «ИС» (фамилия и имя). */
export function toInitials(fullName: string): string {
  const [surname, name] = fullName.trim().split(/\s+/);
  return `${surname?.[0] ?? ""}${name?.[0] ?? ""}`.toUpperCase() || "?";
}

/** «Иванов Сергей Петрович» → «Иванов С. П.» */
export function toShortName(fullName: string): string {
  const [surname, ...rest] = fullName.trim().split(/\s+/);
  return [surname, ...rest.map((part) => `${part[0]}.`)].join(" ");
}
