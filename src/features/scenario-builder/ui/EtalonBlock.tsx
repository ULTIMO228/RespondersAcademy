import { AiBadge, Panel } from "@/shared/ui";

import type { LabeledValue } from "../model/types";
import { HighlightedText } from "./HighlightedText";

import styles from "./ScenarioEditor.module.css";

type EtalonBlockProps = {
  fields: LabeledValue[];
  actions: string[];
  text: string;
  keyPhrases: string[];
};

/** 3. Эталон: значения полей, ожидаемая последовательность действий, формулировка с ключевыми фразами. */
export function EtalonBlock({ fields, actions, text, keyPhrases }: EtalonBlockProps) {
  return (
    <Panel
      title="3. Эталон"
      headerTone="dark"
      actions={
        <span className={styles.editor__headerNote}>
          <AiBadge title="Эталон сформирован системой автоматически, утверждает преподаватель" /> сформирован
          системой
        </span>
      }
    >
      <h3 className={styles.editor__subtitle}>Эталонные значения полей</h3>
      <dl className={styles.editor__fields}>
        {fields.map((field) => (
          <div key={field.id} className={styles.editor__fieldRow}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
      <h3 className={styles.editor__subtitle}>Ожидаемая последовательность действий</h3>
      <ol className={styles.editor__actions}>
        {actions.map((action, index) => (
          <li key={`${action}-${index}`}>{action}</li>
        ))}
      </ol>
      <h3 className={styles.editor__subtitle}>Эталонная формулировка</h3>
      <p className={styles.editor__etalonText}>
        <HighlightedText text={text} phrases={keyPhrases} />
      </p>
      <p className={styles.editor__muted}>
        Ключевые фразы (подсвечены — правильные по мнению системы):{" "}
        {keyPhrases.map((phrase) => `«${phrase}»`).join(", ")}
      </p>
    </Panel>
  );
}
