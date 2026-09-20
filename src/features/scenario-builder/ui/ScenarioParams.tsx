"use client";

import { useState } from "react";

import { MODE_TITLES } from "@/entities/session";
import type { SessionMode } from "@/entities/session";
import type { Difficulty, ScenarioMode } from "@/shared/api";
import { Button, Chip, Input, Panel, Select } from "@/shared/ui";

import { DIFFICULTY_LEVELS } from "../config/dictionaries";
import type { ScenarioParamsView } from "../model/types";
import { ClassifierTree } from "./ClassifierTree";

import styles from "./ScenarioEditor.module.css";

export type ScenarioParamsPatch = {
  title: string;
  difficulty: Difficulty;
  mode: ScenarioMode;
  timeNorms: { primaryReactionSec: number; fullProcessingSec: number };
};

type ScenarioParamsProps = {
  params: ScenarioParamsView;
  /** Сохранение через мок-слой (PATCH /api/mock/scenarios/[id]). */
  onSave: (patch: ScenarioParamsPatch) => Promise<unknown>;
};

const MODES = Object.keys(MODE_TITLES) as SessionMode[];
const MIN_TIME_SEC = 1;

/** 1. Параметры сценария (ТЗ §8): название, категории, тип по ЕКП, локация, сложность, тайминги, режим. */
export function ScenarioParams({ params, onSave }: ScenarioParamsProps) {
  const [title, setTitle] = useState(params.title);
  const [difficulty, setDifficulty] = useState<Difficulty>(params.difficulty);
  const [okrug, setOkrug] = useState(params.okrug);
  const [mode, setMode] = useState<ScenarioMode>(params.mode as ScenarioMode);
  const [reactionSec, setReactionSec] = useState(String(params.reactionSec));
  const [processingSec, setProcessingSec] = useState(String(params.processingSec));
  const [isBusy, setBusy] = useState(false);
  const raions = params.districts.find((district) => district.okrug === okrug)?.raions ?? [];
  const reactionError =
    Number(reactionSec) >= MIN_TIME_SEC ? undefined : "Норматив реакции — больше 0 секунд";
  const processingError =
    Number(processingSec) >= MIN_TIME_SEC ? undefined : "Норматив отработки — больше 0 секунд";
  const isValid = !reactionError && !processingError && title.trim().length > 0;
  return (
    <Panel
      title="1. Параметры сценария"
      headerTone="dark"
      actions={
        <Button
          variant="primary"
          size="sm"
          disabled={isBusy || !isValid}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave({
                title: title.trim(),
                difficulty,
                mode,
                timeNorms: {
                  primaryReactionSec: Number(reactionSec),
                  fullProcessingSec: Number(processingSec),
                },
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          {isBusy ? "Сохраняем…" : "Сохранить параметры"}
        </Button>
      }
    >
      <div className={styles.editor__form}>
        <Input
          label="Название"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={styles["editor__field--wide"]}
        />
        <div className={styles["editor__field--wide"]}>
          <span className={styles.editor__label}>Категории (группы ЕКП)</span>
          <div className={styles.editor__chips}>
            {params.categories.map((category) => (
              <Chip key={category} selected className={styles.editor__chip}>
                {category}
              </Chip>
            ))}
          </div>
        </div>
        <ClassifierTree groups={params.classifierTree} />
        <Select
          label="Округ"
          value={okrug}
          onChange={(event) => setOkrug(event.target.value)}
          options={params.districts.map((district) => ({ value: district.okrug, label: district.okrug }))}
        />
        <Select
          label="Район"
          defaultValue={params.raion}
          key={okrug}
          options={raions.map((raion) => ({ value: raion, label: raion }))}
        />
        <div className={styles["editor__field--wide"]}>
          <span className={styles.editor__label}>Сложность (1–5)</span>
          <div className={styles.editor__chips} role="radiogroup" aria-label="Сложность">
            {DIFFICULTY_LEVELS.map((level) => (
              <Chip
                key={level}
                selected={level === difficulty}
                role="radio"
                aria-checked={level === difficulty}
                className={styles.editor__level}
                onClick={() => setDifficulty(level)}
              >
                {level}
              </Chip>
            ))}
          </div>
        </div>
        <Input
          label="Норматив первичной реакции, сек"
          type="number"
          min={MIN_TIME_SEC}
          value={reactionSec}
          error={reactionError}
          onChange={(event) => setReactionSec(event.target.value)}
          hint="по умолчанию 30 сек"
        />
        <Input
          label="Норматив полной отработки, сек"
          type="number"
          min={MIN_TIME_SEC}
          value={processingSec}
          error={processingError}
          onChange={(event) => setProcessingSec(event.target.value)}
          hint="по умолчанию 180 сек"
        />
        <Select
          label="Режим"
          value={mode}
          onChange={(event) => setMode(event.target.value as ScenarioMode)}
          options={MODES.map((item) => ({ value: item, label: `${item} — ${MODE_TITLES[item]}` }))}
        />
      </div>
    </Panel>
  );
}
