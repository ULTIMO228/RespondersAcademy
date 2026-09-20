import { HELP_MATERIALS } from "../config/materials";
import { HelpMaterials } from "./HelpMaterials";
import { HotkeysReference } from "./HotkeysReference";

import styles from "./HelpPage.module.css";

/** `/arm/help` — справочная база обучающегося (T0.2-17): материалы и горячие клавиши. Только чтение. */
export function HelpPage() {
  return (
    <div className={styles.help}>
      <h1 className="visually-hidden">Справочная база</h1>
      <HelpMaterials materials={HELP_MATERIALS} />
      <HotkeysReference />
    </div>
  );
}
