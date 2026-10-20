/* Статусы версий и правила доступности действий процесса «черновик → проверка → публикация». Чистые функции. */
import type { AIWorkflowApproval, GraphNodeType, ScenarioGraph, ScenarioPermission } from "@/shared/api";

export const APPROVAL_LABEL: Record<AIWorkflowApproval, string> = {
  draft: "Черновик",
  validation_failed: "Не прошла проверку",
  pending_review: "На проверке у эксперта",
  approved: "Опубликована",
  rejected: "Отклонена экспертом",
};

/** В API `approved` — версия опубликована; решение эксперта до публикации хранится как `pending_review` + `reviewedBy`. */
export function approvalLabel(version: { approval: AIWorkflowApproval; reviewedBy?: string }): string {
  if (version.approval === "pending_review" && version.reviewedBy)
    return "Проверена экспертом, ожидает публикации";
  return APPROVAL_LABEL[version.approval];
}

const EDITABLE: AIWorkflowApproval[] = ["draft", "validation_failed", "rejected"];

export type WorkflowActions = {
  canSave: boolean;
  /** Почему сохранить нельзя (подсказка рядом с кнопкой). */
  saveHint: string | null;
  canSubmit: boolean;
  canReview: boolean;
  canPublish: boolean;
  /** Создать новую версию-черновик из опубликованной (derive); права автора/админа проверяет сервер. */
  canDerive: boolean;
  /** Подсказка, когда решение за экспертом, а права нет. */
  reviewHint: string | null;
  readOnly: boolean;
};

export function workflowActions(
  approval: AIWorkflowApproval | null,
  permissions: ScenarioPermission[],
  dirty: boolean,
  reviewedBy?: string,
): WorkflowActions {
  const editable = approval !== null && EDITABLE.includes(approval);
  const canSave = editable && dirty;
  let saveHint: string | null = null;
  const reviewed = approval === "pending_review" && Boolean(reviewedBy);
  if (reviewed) saveHint = "Версию проверил эксперт, она ожидает публикации — изменить её нельзя.";
  else if (approval === "pending_review")
    saveHint = "Версия на проверке — изменить её нельзя. Дождитесь решения эксперта.";
  else if (approval === "approved")
    saveHint = "Версия опубликована — изменить её нельзя. Создайте новую версию из неё.";
  else if (editable && !dirty) saveHint = "Нет несохранённых изменений.";
  const canReview = approval === "pending_review" && !reviewed && permissions.includes("scenario.review");
  const canPublish = reviewed && permissions.includes("scenario.publish");
  return {
    canSave,
    saveHint,
    canSubmit: approval === "draft" && !dirty,
    canReview,
    canPublish,
    canDerive: approval === "approved",
    reviewHint:
      approval === "pending_review" && !reviewed && !canReview
        ? "Принять или отклонить версию может эксперт с правом «scenario.review»."
        : reviewed && !canPublish
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
