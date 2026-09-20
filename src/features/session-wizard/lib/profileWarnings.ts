import type { ProfileRow, ProfileWarning, WizardStudent } from "../model/types";

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU");
}

/**
 * Предупреждение о непересечении категорий занятия с профилем курсанта (spec/04-pages/11, 12):
 * курсанту с профилем выдаются только профильные карточки — без пересечения он останется без выдач.
 * Привязка приходит из мок-слоя (GET /profile-mapping), в мастере не дублируется.
 */
export function getProfileWarnings(
  students: readonly WizardStudent[],
  categories: readonly string[],
  profiles: readonly ProfileRow[],
): ProfileWarning[] {
  if (categories.length === 0) return [];
  const selected = new Set(categories.map(normalize));
  return students.flatMap((student) => {
    const profile = profiles.find((row) => normalize(row.profile) === normalize(student.service ?? ""));
    if (!profile) return [];
    if (profile.incidentGroups.some((group) => selected.has(normalize(group)))) return [];
    return [
      {
        studentId: student.id,
        text: `${student.fullName} (${profile.profile}): выбранные категории не пересекаются с профилем — карточки выдаваться не будут`,
      },
    ];
  });
}
