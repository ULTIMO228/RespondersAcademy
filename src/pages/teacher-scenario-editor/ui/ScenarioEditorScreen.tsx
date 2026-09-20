"use client";

import Link from "next/link";

import {
  AI_ETALON_ASSESSMENT,
  EtalonBlock,
  getValidationView,
  QuestionsPreview,
  ScenarioParams,
  SuccessCriteria,
  ValidationPanel,
} from "@/features/scenario-builder";
import { ROUTES } from "@/shared/config";
import { AiBadge, Panel, StatusChip } from "@/shared/ui";

import type { ScenarioEditorApi } from "../api/editorApi";
import type { ScenarioEditorContext } from "../lib/buildEditorData";
import { buildEditorModel } from "../lib/buildEditorModel";
import { useScenarioEditor } from "../model/useScenarioEditor";
import { CardBasePreview } from "./CardBasePreview";

import styles from "./TeacherScenarioEditorPage.module.css";

type ScenarioEditorScreenProps = {
  scenarioId: string;
  teacherId: string;
  /** Короткое имя преподавателя сессии — подпись автора коррекции. */
  reviewerName: string;
  context: ScenarioEditorContext;
  api?: ScenarioEditorApi;
};

/** Экран `/teacher/scenarios/[id]`: живой сценарий мок-слоя + правки, коррекция и валидация. */
export function ScenarioEditorScreen({
  scenarioId,
  teacherId,
  reviewerName,
  context,
  api,
}: ScenarioEditorScreenProps) {
  const editor = useScenarioEditor({ scenarioId, teacherId, api });
  const backLink = (
    <Link href={ROUTES.teacherScenarios} className={styles.editor__back}>
      К списку сценариев
    </Link>
  );
  if (editor.state.status !== "ready") {
    return (
      <div className={styles.editor__empty}>
        <p role={editor.state.status === "error" ? "alert" : "status"}>
          {editor.state.status === "loading" ? "Загрузка сценария…" : editor.state.message}
        </p>
        {backLink}
      </div>
    );
  }
  const { scenario } = editor.state;
  const model = buildEditorModel(scenario, context);
  const status = getValidationView(scenario.validation.status);
  const [category] = model.params.categories;
  return (
    <div className={styles.editor}>
      <header className={styles.editor__header}>
        {backLink}
        <h1 className={styles.editor__title}>{scenario.title}</h1>
        <span className={styles.editor__meta}>
          {scenario.id} · билет {scenario.sourceTicketNo} ·{" "}
          {scenario.source === "generated" ? <AiBadge title="Сгенерирован ИИ-модулем (мок)" /> : "шаблон"}
          <StatusChip label={status.title} tone={status.tone} />
        </span>
        {scenario.validation.comment ? (
          <p className={styles.editor__comment}>Комментарий коррекции: {scenario.validation.comment}</p>
        ) : null}
      </header>
      <div className={styles.editor__columns}>
        <div className={styles.editor__column}>
          <ScenarioParams
            params={model.params}
            onSave={(patch) => editor.save(patch, "Параметры сценария сохранены")}
          />
          <CardBasePreview scenarioCards={model.scenarioCards} context={context} />
        </div>
        <div className={styles.editor__column}>
          <EtalonBlock
            fields={model.fields}
            actions={model.actions}
            text={model.text}
            keyPhrases={scenario.etalon.keyPhrases}
          />
          <QuestionsPreview questions={model.questions} />
          <ValidationPanel
            status={scenario.validation.status}
            comment={scenario.validation.comment}
            approvedFields={scenario.validation.approvedFields}
            reviewerName={reviewerName}
            etalonFields={model.validationFields}
            aiAssessment={AI_ETALON_ASSESSMENT}
            notice={editor.notice}
            onDecide={editor.decide}
            onRegenerate={() => editor.regenerate(category ?? scenario.title)}
          />
          <SuccessCriteria
            criteria={scenario.successCriteria}
            onSave={(successCriteria) => editor.save({ successCriteria }, "Критерии успешности сохранены")}
          />
        </div>
      </div>
      {editor.notice?.kind === "error" ? (
        <Panel title="Ошибка" headerTone="dark">
          <p role="alert">{editor.notice.text}</p>
        </Panel>
      ) : null}
    </div>
  );
}
