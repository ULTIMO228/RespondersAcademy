import { describe, expect, it } from "vitest";

import { fromGraph, localChecks } from "./model";
import { templateGraph, workflowActions } from "./workflow";

describe("workflowActions", () => {
  it("черновик с изменениями: можно сохранить, отправлять нельзя", () => {
    const actions = workflowActions("draft", [], true);
    expect(actions).toMatchObject({ canSave: true, canSubmit: false, readOnly: false });
  });

  it("сохранённый черновик можно отправить; на проверке и принятая версия заблокированы для сохранения", () => {
    expect(workflowActions("draft", [], false)).toMatchObject({ canSave: false, canSubmit: true });
    expect(workflowActions("pending_review", [], true)).toMatchObject({ canSave: false, readOnly: true });
    expect(workflowActions("pending_review", [], true).saveHint).toContain("на проверке");
    expect(workflowActions("approved", [], true).saveHint).toContain("принята");
  });

  it("решения эксперта требуют прав: с правом доступны, без права — только подсказка", () => {
    expect(workflowActions("pending_review", ["scenario.review"], false).canReview).toBe(true);
    const noRights = workflowActions("pending_review", ["scenario.publish"], false);
    expect(noRights.canReview).toBe(false);
    expect(noRights.reviewHint).toContain("scenario.review");
    expect(workflowActions("approved", ["scenario.publish"], false).canPublish).toBe(true);
    expect(workflowActions("approved", ["scenario.review"], false).canPublish).toBe(false);
    expect(workflowActions("draft", ["scenario.review", "scenario.publish"], false)).toMatchObject({
      canReview: false,
      canPublish: false,
    });
  });

  it("новая версия доступна только из принятой", () => {
    expect(workflowActions("approved", [], false).canDerive).toBe(true);
    for (const approval of ["draft", "pending_review", "rejected", "validation_failed"] as const)
      expect(workflowActions(approval, [], false).canDerive).toBe(false);
  });

  it("отклонённую и непрошедшую проверку версию можно править", () => {
    expect(workflowActions("rejected", [], true).canSave).toBe(true);
    expect(workflowActions("validation_failed", [], true).canSave).toBe(true);
  });

  it("шаблонный граф не содержит локальных ошибок", () => {
    expect(localChecks(fromGraph(templateGraph()))).toEqual([]);
  });
});
