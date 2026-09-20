import type { SystemSettings } from "@/shared/api";
import { Input, Panel } from "@/shared/ui";

import styles from "./SettingsSection.module.css";

type DatabaseSettingsProps = { database: SystemSettings["database"] };

/** «База данных» (T4.2-16) — только чтение: эндпоинт настроек поле `database` не принимает. */
export function DatabaseSettings({ database }: DatabaseSettingsProps) {
  return (
    <Panel title="База данных" headerTone="dark" actions={<span>только чтение</span>}>
      <div className={styles.section}>
        <div className={styles.section__grid}>
          <Input label="Хост" value={database.host} readOnly disabled className={styles.section__readonly} />
          <Input
            label="Имя БД"
            value={database.name}
            readOnly
            disabled
            className={styles.section__readonly}
          />
        </div>
        <p className={styles.section__note}>Изменение только через конфигурацию сервера.</p>
      </div>
    </Panel>
  );
}
