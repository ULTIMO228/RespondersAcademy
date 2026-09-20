"use client";

import { useState } from "react";

import type { SystemSettings, SystemSettingsPatch } from "@/shared/api";
import { SETTINGS_LIMITS } from "@/shared/api";
import { Button, Input, Modal, Panel, Toggle } from "@/shared/ui";

import type { SaveResult } from "../../model/useAdminSystem";
import { liveErrors, useSettingsForm } from "../../model/useSettingsForm";
import { SectionStatus } from "./SectionStatus";

import styles from "./SettingsSection.module.css";

type SecuritySettingsProps = {
  security: SystemSettings["security"];
  save: (patch: SystemSettingsPatch) => Promise<SaveResult>;
};

const CONFIRM_WIDTH = 520;

/**
 * «Безопасность и политики доступа» (T4.2-17): сохранение — под отдельным подтверждением прав
 * (21-admin-system.md «Ограничения»), событие уходит в журнал аудита вместе с PATCH.
 */
export function SecuritySettings({ security, save }: SecuritySettingsProps) {
  const [require2fa, setRequire2fa] = useState(security.require2fa);
  const [minPasswordLength, setMinPasswordLength] = useState(String(security.minPasswordLength));
  const [lockAfterAttempts, setLockAfterAttempts] = useState(String(security.lockAfterAttempts));
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const form = useSettingsForm(save);
  const patch: SystemSettingsPatch = {
    security: {
      require2fa,
      minPasswordLength: Number(minPasswordLength),
      lockAfterAttempts: Number(lockAfterAttempts),
    },
  };
  const errors = { ...liveErrors(patch), ...form.errors };
  const apply = async () => {
    setConfirmOpen(false);
    await form.submit(patch);
  };
  return (
    <Panel title="Безопасность и политики доступа" headerTone="dark">
      <div className={styles.section}>
        <Toggle label="Требовать 2FA при входе" checked={require2fa} onChange={setRequire2fa} />
        <p className={styles.section__note}>
          Настройка действует на форму входа: при выключенном тумблере «/login» не запрашивает код из
          сообщения.
        </p>
        <div className={styles.section__grid}>
          <Input
            label="Минимальная длина пароля"
            type="number"
            min={SETTINGS_LIMITS.passwordMinLength}
            max={SETTINGS_LIMITS.passwordMaxLength}
            value={minPasswordLength}
            onChange={(event) => setMinPasswordLength(event.target.value)}
            hint={`от ${SETTINGS_LIMITS.passwordMinLength} до ${SETTINGS_LIMITS.passwordMaxLength} символов`}
            error={errors["security.minPasswordLength"]}
          />
          <Input
            label="Блокировка после N неудачных попыток"
            type="number"
            min={SETTINGS_LIMITS.lockAttemptsMin}
            max={SETTINGS_LIMITS.lockAttemptsMax}
            value={lockAfterAttempts}
            onChange={(event) => setLockAfterAttempts(event.target.value)}
            hint={`от ${SETTINGS_LIMITS.lockAttemptsMin} до ${SETTINGS_LIMITS.lockAttemptsMax}`}
            error={errors["security.lockAfterAttempts"]}
          />
        </div>
        <div className={styles.section__actions}>
          <Button variant="primary" disabled={form.status === "saving"} onClick={() => setConfirmOpen(true)}>
            Сохранить настройки безопасности
          </Button>
          <SectionStatus form={form} />
        </div>
        <p className={styles.section__note}>
          Изменение базовых настроек безопасности — под отдельным подтверждением прав. Тумблер 2FA управляет
          запросом кода на экране входа.
        </p>
      </div>
      {isConfirmOpen ? (
        <Modal
          title="Подтверждение прав"
          onClose={() => setConfirmOpen(false)}
          width={CONFIRM_WIDTH}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                Отмена
              </Button>
              <Button variant="danger" onClick={apply}>
                Подтвердить
              </Button>
            </>
          }
        >
          <p>
            Изменение базовых настроек безопасности ({require2fa ? "2FA обязательна" : "2FA отключена"}, длина
            пароля {minPasswordLength}, блокировка после {lockAfterAttempts} попыток) будет записано в журнал
            аудита.
          </p>
        </Modal>
      ) : null}
    </Panel>
  );
}
