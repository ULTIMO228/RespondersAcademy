import type { ClassifierTreeGroup } from "../model/types";

import styles from "./ScenarioEditor.module.css";

type ClassifierTreeProps = {
  groups: ClassifierTreeGroup[];
};

/** Тип происшествия — выбор из дерева ЕКП (classifier.json), статично: выбранные записи отмечены. */
export function ClassifierTree({ groups }: ClassifierTreeProps) {
  return (
    <div className={styles["editor__field--wide"]}>
      <span className={styles.editor__label}>Тип происшествия (дерево ЕКП)</span>
      <ul className={styles.editor__tree}>
        {groups.map((group, index) => (
          <li key={group.group}>
            <details open={index === 0}>
              <summary className={styles.editor__treeGroup}>
                {group.group} <span className={styles.editor__muted}>({group.totalCount})</span>
              </summary>
              <ul>
                {group.nodes.map((node) => (
                  <li
                    key={node.code}
                    className={[
                      styles.editor__treeNode,
                      node.isSelected ? styles["editor__treeNode--on"] : "",
                    ].join(" ")}
                    data-selected={node.isSelected}
                  >
                    <span className={styles.editor__code}>{node.code}</span>
                    <span>{node.path}</span>
                    <b>→ {node.finalType}</b>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
