/* Статусы версий и правила доступности действий процесса «черновик → проверка → публикация». Чистые функции. */
import type { AIWorkflowApproval, GraphNodeType, ScenarioGraph, ScenarioPermission } from "@/shared/api";

export const APPROVAL_LABEL: Record<AIWorkflowApproval, string> = {
  draft: "Черновик",
  validation_failed: "Не прошла проверку",
  pending_review: "На проверке у эксперта",
  approved: "Принята (ожидает публикации)",
  rejected: "Отклонена экспертом",
};

const EDITABLE: AIWorkflowApproval[] = ["draft", "validation_failed", "rejected"];

export type WorkflowActions = {
  canSave: boolean;
  /** Почему сохранить нельзя (подсказка рядом с кнопкой). */
  saveHint: string | null;
  canSubmit: boolean;
  canReview: boolean;
  canPublish: boolean;
  /** Подсказка, когда решение за экспертом, а права нет. */
  reviewHint: string | null;
  readOnly: boolean;
};

export function workflowActions(
  approval: AIWorkflowApproval | null,
  permissions: ScenarioPermission[],
  dirty: boolean,
): WorkflowActions {
  const editable = approval !== null && EDITABLE.includes(approval);
  const canSave = editable && dirty;
  let saveHint: string | null = null;
  if (approval === "pending_review")
    saveHint = "Версия на проверке — изменить её нельзя. Дождитесь решения эксперта.";
  else if (approval === "approved")
    saveHint = "Версия принята — изменить её нельзя. Опубликуйте её или создайте новую версию.";
  else if (editable && !dirty) saveHint = "Нет несохранённых изменений.";
  const canReview = approval === "pending_review" && permissions.includes("scenario.review");
  return {
    canSave,
    saveHint,
    canSubmit: approval === "draft" && !dirty,
    canReview,
    canPublish: approval === "approved" && permissions.includes("scenario.publish"),
    reviewHint:
      approval === "pending_review" && !canReview
        ? "Принять или отклонить версию может эксперт с правом «scenario.review»."
        : approval === "approved" && !permissions.includes("scenario.publish")
          ? "Опубликовать версию может эксперт с правом «scenario.publish»."
          : null,
    readOnly: !editable,
  };
}

/** Шаблонный граф для нового сценария: старт-шаг → завершение. */
export function templateGraph(): ScenarioGraph {
  return {
    schemaVersion: "scenario-graph/1",
    start: "step1",
    nodes: [
      {
        id: "step1",
        type: "action",
        title: "Приём вызова",
        action: "captureCaller",
        label: "Принять вызов",
        next: "end1",
      },
      { id: "end1", type: "end", title: "Завершение", outcome: "completed", score: 100, passed: true },
    ],
    layout: { step1: { x: 60, y: 60 }, end1: { x: 390, y: 60 } },
  };
}

export function newRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `graph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export const KIND_ICON: Record<GraphNodeType, string> = { action: "▶", condition: "◆", end: "■" };
