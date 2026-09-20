import { highlightPhrases } from "../lib/highlightPhrases";

import styles from "./ScenarioEditor.module.css";

type HighlightedTextProps = {
  text: string;
  phrases: string[];
};

/** Текст с подсветкой ключевых фраз — «правильные по мнению системы» (сценарий А, шаг 6). */
export function HighlightedText({ text, phrases }: HighlightedTextProps) {
  return (
    <>
      {highlightPhrases(text, phrases).map((segment, index) =>
        segment.isMatch ? (
          <mark key={index} className={styles.editor__phrase} data-key-phrase>
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
