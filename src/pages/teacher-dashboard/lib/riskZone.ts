import type { PublicUser, StudentProfile } from "@/shared/api";

export type RiskEntry = { student: PublicUser; errors: number };

/** Сколько запросов профилей идёт одновременно: размер группы не должен превращаться в залп запросов. */
export const PROFILE_CONCURRENCY = 4;
export const RISK_ZONE_SIZE = 3;

/** Суммарное число типичных ошибок по обоим режимам. */
export function totalTypicalErrors(profile: StudentProfile): number {
  return (["dds", "operator112"] as const).reduce(
    (sum, mode) => sum + (profile.typicalErrors[mode] ?? []).reduce((acc, item) => acc + item.count, 0),
    0,
  );
}

/**
 * «Зона риска» (FR-070): три обучающихся группы с наибольшим суммарным числом типичных ошибок по обоим режимам; при
 * равенстве — по алфавиту ФИО. Обучающиеся без ошибок в зону не попадают.
 */
export function pickRiskZone(entries: RiskEntry[]): RiskEntry[] {
  return entries
    .filter((entry) => entry.errors > 0)
    .sort(
      (left, right) =>
        right.errors - left.errors || left.student.fullName.localeCompare(right.student.fullName, "ru"),
    )
    .slice(0, RISK_ZONE_SIZE);
}

/** Выполняет `task` над элементами не более чем `limit` одновременно; результаты — в порядке исходного списка. */
export async function mapLimit<TItem, TResult>(
  items: TItem[],
  limit: number,
  task: (item: TItem) => Promise<TResult>,
): Promise<PromiseSettledResult<TResult>[]> {
  const results: PromiseSettledResult<TResult>[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = { status: "fulfilled", value: await task(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
