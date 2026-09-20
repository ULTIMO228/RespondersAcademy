import { IncidentCardView } from "@/widgets/incident-card";
import { ServicePanel } from "@/widgets/service-panel";
import type { TrainingCardView } from "@/features/scenario-builder";
import { findBaseFixture } from "@/features/scenario-builder";
import { Panel } from "@/shared/ui";

import type { ScenarioEditorContext } from "../lib/buildEditorData";

import styles from "./TeacherScenarioEditorPage.module.css";

type CardBasePreviewProps = {
  scenarioCards: TrainingCardView[];
  context: ScenarioEditorContext;
};

/** 2. Карточка-основа: тот же рендер карточки и панели служб, что у курсанта (ре-use виджетов), read-only. */
export function CardBasePreview({ scenarioCards, context }: CardBasePreviewProps) {
  const base = findBaseFixture(scenarioCards, context.fixtures);
  if (!base) {
    return (
      <Panel title="2. Карточка-основа" headerTone="dark">
        <p className={styles.editor__note}>
          Для карточек сценария нет UI-фикстуры ПОВ-112 — предпросмотр доступен для сценариев занятий мока
          (например, s-032).
        </p>
      </Panel>
    );
  }
  const { card, fixture } = base;
  return (
    <Panel
      title={`2. Карточка-основа: Происшествие ${fixture.number}`}
      headerTone="dark"
      actions={<span className={styles.editor__caption}>учебная ситуация {card.id} · только просмотр</span>}
    >
      <fieldset className={styles.editor__card} disabled aria-label="Предпросмотр карточки-основы">
        <div className={styles.editor__screen} data-theme="light">
          <IncidentCardView
            card={fixture}
            classifierEntries={context.classifierByCode[fixture.what.classifierCode ?? ""] ?? []}
            linkedCards={[]}
            readOnly
          />
          <div className={styles.editor__services}>
            <ServicePanel
              card={fixture}
              services={context.services}
              serviceStatuses={context.serviceStatuses}
              ddsStatuses={context.ddsStatuses}
              readOnly
            />
          </div>
        </div>
      </fieldset>
    </Panel>
  );
}
