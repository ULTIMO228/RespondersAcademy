"use client";

import { useRouter } from "next/navigation";

import {
  buildProfileRows,
  buildScenarioRow,
  buildScenarioRows,
  buildTemplateOptions,
  MaterialsBlock,
  ProfileCategories,
  ScenarioCatalog,
} from "@/features/scenario-builder";
import type { TrainingCardView } from "@/features/scenario-builder";
import { ROUTES } from "@/shared/config";
import { Panel } from "@/shared/ui";

import type { ScenariosApi } from "../api/scenariosApi";
import { buildDraftScenario, DEFAULT_GENERATE_GROUP } from "../config/defaults";
import { useScenariosPage } from "../model/useScenariosPage";

import styles from "./TeacherScenariosPage.module.css";

type TeacherScenariosScreenProps = {
  /** Преподаватель сессии: автор создания, генерации, удаления и сохранения привязки. */
  teacherId: string;
  /** Выжимка по 96 учебным карточкам (группы ЕКП и итоговые типы) — считает серверный компонент. */
  cardIndex: TrainingCardView[];
  /** Подмена клиента данных (тесты). */
  api?: ScenariosApi;
};

/** Экран `/teacher/scenarios` на живых данных мок-слоя (список, материалы, профильные категории). */
export function TeacherScenariosScreen({ teacherId, cardIndex, api }: TeacherScenariosScreenProps) {
  const router = useRouter();
  const page = useScenariosPage({ teacherId, api });
  if (page.state.status !== "ready") {
    return (
      <Panel title="Сценарии и эталоны" headerTone="dark">
        <p className={styles.scenarios__note} role={page.state.status === "error" ? "alert" : "status"}>
          {page.state.status === "loading" ? "Загрузка сценариев…" : page.state.message}
        </p>
      </Panel>
    );
  }
  const { scenarios, totalCount, reference, materials, profileMapping } = page.state.data;
  return (
    <>
      <ScenarioCatalog
        rows={buildScenarioRows(scenarios, cardIndex)}
        totalCount={totalCount}
        incidentGroups={reference.incidentGroups}
        templates={buildTemplateOptions(cardIndex)}
        defaultGenerateGroup={DEFAULT_GENERATE_GROUP}
        filter={page.filter}
        onFilterChange={page.setFilter}
        onCreate={async (title, cardId) => {
          const card = cardIndex.find((candidate) => candidate.id === cardId);
          const created = await page.createScenario(buildDraftScenario(title, cardId, card?.ticketNo ?? 0));
          router.push(ROUTES.teacherScenario(created.id));
        }}
        onGenerate={async (category) => {
          const generated = await page.generateScenarios(category);
          return generated.map((scenario) => buildScenarioRow(scenario, cardIndex));
        }}
        onDelete={(row) => page.removeScenario(row.id)}
      />
      <div className={styles.scenarios__columns}>
        <MaterialsBlock
          materials={materials}
          onUpload={page.uploadMaterial}
          onCheckGrammar={page.checkGrammar}
        />
        <ProfileCategories
          rows={buildProfileRows(profileMapping, reference.services)}
          incidentGroups={reference.incidentGroups}
          onSave={page.saveProfileMapping}
        />
      </div>
    </>
  );
}
