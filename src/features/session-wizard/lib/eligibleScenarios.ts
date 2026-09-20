import { APPROVED_STATUS } from "../config/wizard";
import type { WizardScenario } from "../model/types";

/**
 * Подходящие сценарии шага 4: только утверждённые (не-approved в занятие не попадают, T3.1-15) и
 * пересекающиеся с выбранными категориями событий; без выбранных категорий — все утверждённые.
 */
export function getEligibleScenarios(
  scenarios: readonly WizardScenario[],
  categories: readonly string[],
): WizardScenario[] {
  return scenarios.filter(
    (scenario) =>
      scenario.status === APPROVED_STATUS &&
      (categories.length === 0 || scenario.categories.some((category) => categories.includes(category))),
  );
}
