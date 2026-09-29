"use client";

import { useState } from "react";

import { SETTINGS_LIMITS, validateSettingsPatch } from "@/shared/api";
import type { SystemSettings } from "@/shared/api";
import {
  Alert,
  Card,
  Field,
  PageHeader,
  PlatformButton,
  ResourceView,
  useResource,
} from "@/shared/ui/platform";

import { adminSecurityApi } from "../api/securityApi";
import type { AdminSecurityApi } from "../api/securityApi";

import styles from "./AdminSecurity.module.css";

type Security = SystemSettings["security"];

/** Ошибки полей в тех же ключах, что у сервера (`security.minPasswordLength`). */
export function validateSecurity(minPasswordLength: string, lockAfterAttempts: string) {
  const parse = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN);
  return validateSettingsPatch({
    security: { minPasswordLength: parse(minPasswordLength), lockAfterAttempts: parse(lockAfterAttempts) },
  });
}

function SecurityForm({ initial, api }: { initial: Security; api: AdminSecurityApi }) {
  const [saved, setSaved] = useState(initial);
  const [minPasswordLength, setMinPasswordLength] = useState(String(initial.minPasswordLength));
  const [lockAfterAttempts, setLockAfterAttempts] = useState(String(initial.lockAfterAttempts));
  const [confirming, setConfirming] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const errors = validateSecurity(minPasswordLength, lockAfterAttempts);
  const fieldError = (field: string) => errors.find((item) => item.field === field)?.message;
  const isDirty =
    Number(minPasswordLength) !== saved.minPasswordLength ||
    Number(lockAfterAttempts) !== saved.lockAfterAttempts;

  const apply = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await api.patchSettings({
        security: {
          minPasswordLength: Number(minPasswordLength),
          lockAfterAttempts: Number(lockAfterAttempts),
        },
      });
      setSaved(result.security);
      setConfirming(false);
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Не удалось сохранить настройки");
    }
    setSaving(false);
  };

  return (
    <Card title="Политика паролей и блокировок">
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          setDone(false);
          if (errors.length === 0 && isDirty) setConfirming(true);
        }}
      >
        <div className={styles.grid}>
          <Field
            label="Минимальная длина пароля"
            inputMode="numeric"
            hint={`от ${SETTINGS_LIMITS.passwordMinLength} до ${SETTINGS_LIMITS.passwordMaxLength} символов; действует при следующей смене пароля и создании учётных записей`}
            value={minPasswordLength}
            error={fieldError("security.minPasswordLength")}
            onChange={(event) => {
              setMinPasswordLength(event.target.value);
              setDone(false);
            }}
          />
          <Field
            label="Блокировка после неудачных попыток входа"
            inputMode="numeric"
            hint={`от ${SETTINGS_LIMITS.lockAttemptsMin} до ${SETTINGS_LIMITS.lockAttemptsMax}; действует со следующего входа`}
            value={lockAfterAttempts}
            error={fieldError("security.lockAfterAttempts")}
            onChange={(event) => {
              setLockAfterAttempts(event.target.value);
              setDone(false);
            }}
          />
        </div>
        {done ? <Alert tone="success">Политика сохранена и записана в журнал аудита.</Alert> : null}
        {error ? (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        ) : null}
        {confirming ? (
          <Alert tone="warning" role="alert">
            <div className={styles.confirm}>
              <span>
                Изменить политику доступа: пароль от {minPasswordLength} символов, блокировка после{" "}
                {lockAfterAttempts} неудачных попыток. Изменение затронет всех пользователей.
              </span>
              <PlatformButton variant="primary" onClick={() => void apply()} disabled={isSaving}>
                {isSaving ? "Сохранение…" : "Подтвердить"}
              </PlatformButton>
              <PlatformButton variant="ghost" onClick={() => setConfirming(false)} disabled={isSaving}>
                Отмена
              </PlatformButton>
            </div>
          </Alert>
        ) : (
          <div>
            <PlatformButton type="submit" variant="primary" disabled={!isDirty || errors.length > 0}>
              Сохранить
            </PlatformButton>
          </div>
        )}
      </form>
    </Card>
  );
}

type AdminSecurityScreenProps = { api?: AdminSecurityApi };

/** `/admin/security` — длина пароля и число попыток до блокировки. Срок сессии и 2FA здесь не настраиваются. */
export function AdminSecurityScreen({ api = adminSecurityApi }: AdminSecurityScreenProps) {
  const { state, reload } = useResource((signal) => api.getSettings(signal), [api]);
  return (
    <section aria-labelledby="admin-security-title">
      <PageHeader title="Безопасность" description="Политики доступа для всех пользователей тренажёра" />
      <ResourceView state={state} onRetry={reload} errorTitle="Не удалось загрузить настройки">
        {(settings) => <SecurityForm initial={settings.security} api={api} />}
      </ResourceView>
    </section>
  );
}
