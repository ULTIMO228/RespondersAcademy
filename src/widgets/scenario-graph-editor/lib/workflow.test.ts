import { describe, expect, it } from "vitest";

import { fromGraph, localChecks } from "./model";
import { approvalLabel, templateGraph, workflowActions } from "./workflow";

describe("workflowActions", () => {
  it("черновик с изменениями: можно сохранить, отправлять нельзя", () => {
    const actions = workflowActions("draft", [], true);
    expect(actions).toMatchObject({ canSave: true, canSubmit: false, readOnly: false });
  });

  it("сохранённый черновик можно отправить; на проверке и принятая версия заблокированы для сохранения", () => {
    expect(workflowActions("draft", [], false)).toMatchObject({ canSave: false, canSubmit: true });
    expect(workflowActions("pending_review", [], true)).toMatchObject({ canSave: false, readOnly: true });
    expect(workflowActions("pending_review", [], true).saveHint).toContain("на проверке");
    expect(workflowActions("approved", [], true).saveHint).toContain("опубликована");
  });

  it("решения эксперта требуют прав: с правом доступны, без права — только подсказка", () => {
    expect(workflowActions("pending_review", ["scenario.review"], false).canReview).toBe(true);
    // уже принятую версию второй раз не принимают
    expect(workflowActions("pending_review", ["scenario.review"], false, "u-003").canReview).toBe(false);
    expect(workflowActions("pending_review", ["scenario.review"], false, "u-003").saveHint).toContain(
      "ожидает публикации",
    );
    const noRights = workflowActions("pending_review", ["scenario.publish"], false);
    expect(noRights.canReview).toBe(false);
    expect(noRights.reviewHint).toContain("scenario.review");
    // публикуют версию, которую эксперт уже принял (pending_review + reviewedBy); опубликованную — нет
    expect(workflowActions("pending_review", ["scenario.publish"], false, "u-003").canPublish).toBe(true);
    expect(workflowActions("pending_review", ["scenario.review"], false, "u-003").canPublish).toBe(false);
    expect(workflowActions("pending_review", ["scenario.publish"], false).canPublish).toBe(false);
    expect(workflowActions("approved", ["scenario.publish"], false, "u-003").canPublish).toBe(false);
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

describe("подписи статуса версии (approved в API — это опубликована)", () => {
  it("approved показывается как «Опубликована», а не как «ожидает публикации»", () => {
    expect(approvalLabel({ approval: "approved" })).toBe("Опубликована");
    expect(approvalLabel({ approval: "draft" })).toBe("Черновик");
    expect(approvalLabel({ approval: "rejected" })).toBe("Отклонена экспертом");
  });

  it("на проверке: без решения эксперта — «На проверке у эксперта», после принятия — «ожидает публикации»", () => {
    expect(approvalLabel({ approval: "pending_review" })).toBe("На проверке у эксперта");
    expect(approvalLabel({ approval: "pending_review", reviewedBy: "u-003" })).toBe(
      "Проверена экспертом, ожидает публикации",
    );
  });
});
