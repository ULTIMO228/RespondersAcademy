import type { ScenarioSource, ValidationStatus, ValidationStatusView } from "../model/types";

/** Статусы валидации Scenario.validation.status (spec/05 §6) — русские подписи. */
export const VALIDATION_STATUS_VIEW: Record<ValidationStatus, ValidationStatusView> = {
  draft: { title: "черновик", tone: "closed" },
  pending: { title: "на проверке", tone: "created" },
  approved: { title: "утверждён", tone: "accepted" },
  rejected: { title: "отклонён", tone: "new" },
};

export const VALIDATION_STATUSES: ValidationStatus[] = ["draft", "pending", "approved", "rejected"];

export const SOURCE_TITLES: Record<ScenarioSource, string> = {
  template: "шаблон",
  generated: "генерация ИИ",
};

export const SCENARIO_SOURCES: ScenarioSource[] = ["template", "generated"];

export const DIFFICULTY_LEVELS = [1, 2, 3, 4, 5] as const;

export const APPROVED_STATUS: ValidationStatus = "approved";

export function getValidationView(status: string): ValidationStatusView {
  return VALIDATION_STATUS_VIEW[status as ValidationStatus] ?? { title: status, tone: "closed" };
}

export function getSourceTitle(source: string): string {
  return SOURCE_TITLES[source as ScenarioSource] ?? source;
}
