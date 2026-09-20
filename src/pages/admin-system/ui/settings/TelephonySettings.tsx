"use client";

import { useState } from "react";

import type { SystemSettings, SystemSettingsPatch } from "@/shared/api";
import { Button, Input, Panel, Toggle } from "@/shared/ui";

import type { SaveResult } from "../../model/useAdminSystem";
import { liveErrors, useSettingsForm } from "../../model/useSettingsForm";
import { SectionStatus } from "./SectionStatus";

import styles from "./SettingsSection.module.css";

type TelephonySettingsProps = {
  telephony: SystemSettings["telephony"];
  save: (patch: SystemSettingsPatch) => Promise<SaveResult>;
};

/** «Виртуальная IP-телефония» (T4.2-15): форма-заглушка, сохраняет в мок через PATCH. */
export function TelephonySettings({ telephony, save }: TelephonySettingsProps) {
  const [sipServer, setSipServer] = useState(telephony.sipServer);
  const [realm, setRealm] = useState(telephony.realm);
  const [enabled, setEnabled] = useState(telephony.enabled);
  const form = useSettingsForm(save);
  const patch: SystemSettingsPatch = { telephony: { sipServer, realm, enabled } };
  const errors = { ...liveErrors(patch), ...form.errors };
  return (
    <Panel title="Виртуальная IP-телефония" headerTone="dark">
      <div className={styles.section}>
        <div className={styles.section__grid}>
          <Input
            label="SIP-сервер"
            value={sipServer}
            onChange={(event) => setSipServer(event.target.value)}
            error={errors["telephony.sipServer"]}
          />
          <Input
            label="Realm"
            value={realm}
            onChange={(event) => setRealm(event.target.value)}
            error={errors["telephony.realm"]}
          />
        </div>
        <div className={styles.section__actions}>
          <Toggle label="Телефония включена" checked={enabled} onChange={setEnabled} />
          <Button variant="primary" disabled={form.status === "saving"} onClick={() => form.submit(patch)}>
            Сохранить
          </Button>
          <SectionStatus form={form} />
        </div>
        <p className={styles.section__note}>
          Тестовый фронт: параметры телефонии сохраняются в мок и читаются обратно; реального SIP-контура нет.
        </p>
      </div>
    </Panel>
  );
}
