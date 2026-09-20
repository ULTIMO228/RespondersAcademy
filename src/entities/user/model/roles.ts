import type { UserRole } from "@/shared/api";

export const ROLE_TITLES: Record<UserRole, string> = {
  student: "Обучающийся",
  teacher: "Преподаватель",
  admin: "Администратор",
};

/** «Иванов С. П.» — формат подписи оператора в АРМ-112. */
export function formatShortName(fullName: string): string {
  const [lastName, firstName = "", middleName = ""] = fullName.split(" ");
  const initials = [firstName, middleName]
    .filter(Boolean)
    .map((part) => `${part.charAt(0)}.`)
    .join(" ");
  return initials ? `${lastName} ${initials}` : lastName;
}
