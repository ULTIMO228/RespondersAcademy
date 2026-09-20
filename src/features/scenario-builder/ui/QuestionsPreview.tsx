import { AiBadge, Panel } from "@/shared/ui";

import type { PreviewQuestion } from "../model/types";
import { HighlightedText } from "./HighlightedText";

import styles from "./ScenarioEditor.module.css";

type QuestionsPreviewProps = {
  questions: PreviewQuestion[];
};

/** 4. Предпросмотр вопросов и ответов — как их увидит система при оценке попытки. */
export function QuestionsPreview({ questions }: QuestionsPreviewProps) {
  return (
    <Panel
      title="4. Предпросмотр вопросов и ответов"
      headerTone="dark"
      actions={<AiBadge title="Вопросы и эталонные ответы для оценки сформированы системой" />}
    >
      <ol className={styles.editor__questions}>
        {questions.map((item) => (
          <li key={item.id} className={styles.editor__question}>
            <p className={styles.editor__questionText}>{item.question}</p>
            <p className={styles.editor__answer}>
              <span className={styles.editor__muted}>Ожидаемый ответ: </span>
              <HighlightedText text={item.answer} phrases={item.phrases} />
            </p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
