"use client";

import { useState } from "react";
import type { ChangeEvent } from "react";

import type { ErrorMapSettings } from "@/shared/api";
import { Button, Input, Modal, Panel } from "@/shared/ui";
import { ResourceView, useResource } from "@/shared/ui/platform";

import { errorMapSettingsApi } from "../../api/errorMapSettingsApi";
import type { ErrorMapSettingsApi } from "../../api/errorMapSettingsApi";
import { toFormValues, toSettings, validateErrorMapSettingsForm } from "../../model/errorMapSettingsForm";
import type { ErrorMapSettingsFormField, ErrorMapSettingsFormValues } from "../../model/errorMapSettingsForm";
import { SectionStatus } from "./SectionStatus";

import styles from "./SettingsSection.module.css";

type ErrorMapSettingsSectionProps = {
  /** Подмена клиента в тестах; по умолчанию — /api/v1/error-map/settings. */
  api?: ErrorMapSettingsApi;
};

type SaveState = { status: "idle" | "saving" | "saved" | "error"; message?: string };

const IDLE: SaveState = { status: "idle" };
const CONFIRM_WIDTH = 520;
const SAVE_FALLBACK = "Не удалось сохранить пороги карты ошибок. Повторите попытку";

/**
 * Секция «Карта ошибок» на вкладке «Настройки» (спека 003, T028, FR-004): пороги светофора и минимумы попыток.
 * Значения — черновик, согласуются с экспертом по обучению. Сохранение — после подтверждения; запись в аудит на сервере.
 */
export function ErrorMapSettingsSection({ api = errorMapSettingsApi }: ErrorMapSettingsSectionProps) {
  const { state, reload } = useResource((signal) => api.getSettings(signal), [api]);
  return (
    <Panel title="Карта ошибок" headerTone="dark">
      <ResourceView state={state} onRetry={reload} errorTitle="Не удалось загрузить пороги карты ошибок">
        {(settings) => <ErrorMapSettingsForm initial={settings} api={api} />}
      </ResourceView>
    </Panel>
  );
}

type ErrorMapSettingsFormProps = {
  initial: ErrorMapSettings;
  api: ErrorMapSettingsApi;
};

function ErrorMapSettingsForm({ initial, api }: ErrorMapSettingsFormProps) {
  const [values, setValues] = useState<ErrorMapSettingsFormValues>(() => toFormValues(initial));
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [save, setSave] = useState<SaveState>(IDLE);
  const errors = validateErrorMapSettingsForm(values);
  const isValid = Object.keys(errors).length === 0;

  const update = (field: ErrorMapSettingsFormField) => (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [field]: value }));
    setSave(IDLE);
  };

  const apply = async () => {
    setConfirmOpen(false);
    setSave({ status: "saving" });
    try {
      await api.saveSettings(toSettings(values));
      setSave({ status: "saved" });
    } catch (error) {
      setSave({
        status: "error",
        message: error instanceof Error && error.message ? error.message : SAVE_FALLBACK,
      });
    }
  };

  return (
    <div className={styles.section}>
      <div className={styles.section__grid}>
        <Input
          label="Порог „иногда“ с"
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step="any"
          hint="в процентах: больше 0 и меньше порога «часто»"
          value={values.sometimesFrom}
          onChange={update("sometimesFrom")}
          error={errors.sometimesFrom}
        />
        <Input
          label="Порог „часто“ с"
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step="any"
          hint="в процентах: больше порога «иногда» и меньше 100"
          value={values.oftenFrom}
          onChange={update("oftenFrom")}
          error={errors.oftenFrom}
        />
        <Input
          label="Минимум попыток у группы"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          hint="целое число, не меньше 1"
          value={values.minAttemptsGroup}
          onChange={update("minAttemptsGroup")}
          error={errors.minAttemptsGroup}
        />
        <Input
          label="Минимум попыток у обучающегося"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          hint="целое число, не меньше 1"
          value={values.minAttemptsStudent}
          onChange={update("minAttemptsStudent")}
          error={errors.minAttemptsStudent}
        />
        <Input
          label="Зона „как у группы“, п.п."
          type="number"
          inputMode="numeric"
          min={0}
          max={50}
          step={1}
          hint="процентные пункты, от 0 до 50"
          value={values.sameBandPoints}
          onChange={update("sameBandPoints")}
          error={errors.sameBandPoints}
        />
      </div>
      <div className={styles.section__actions}>
        <Button
          variant="primary"
          disabled={!isValid || save.status === "saving"}
          onClick={() => setConfirmOpen(true)}
        >
          Сохранить
        </Button>
        <SectionStatus form={save} savedText="Сохранено. Изменение записано в журнал аудита." />
      </div>
      <p className={styles.section__note}>
        Значения — черновик, согласуются с экспертом по обучению. Каждое изменение попадает в журнал аудита.
      </p>
      {isConfirmOpen ? (
        <Modal
          title="Подтверждение порогов карты ошибок"
          onClose={() => setConfirmOpen(false)}
          width={CONFIRM_WIDTH}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                Отмена
              </Button>
              <Button variant="primary" onClick={apply}>
                Подтвердить
              </Button>
            </>
          }
        >
          <p>
            «Иногда» с {values.sometimesFrom} %, «часто» с {values.oftenFrom} %; минимум попыток — группа{" "}
            {values.minAttemptsGroup}, обучающийся {values.minAttemptsStudent}; зона «как у группы» —{" "}
            {values.sameBandPoints} п. п. Изменение запишется в журнал аудита и пересчитает уровни на картах.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
