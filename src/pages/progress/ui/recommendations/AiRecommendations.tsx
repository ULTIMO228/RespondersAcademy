import type { ReactNode } from "react";

import { formatDate } from "@/shared/lib";
import { AiBadge, Panel } from "@/shared/ui";

import type { Recommendation } from "../../lib/selectStudentProgress";

import styles from "../ProgressPage.module.css";

type AiRecommendationsProps = {
  recommendations: Recommendation[];
  /** Блок сертификата под рекомендациями (как в прототипе). */
  children?: ReactNode;
};

/**
 * «Рекомендации системы»: обратная связь преподавателя (T3.4-10, подписана ФИО) и тексты ИИ
 * (aiComment своих отчётов) с бейджем «ИИ».
 */
export function AiRecommendations({ recommendations, children }: AiRecommendationsProps) {
  return (
    <Panel
      title="Рекомендации системы"
      actions={<AiBadge title="Рекомендации сформированы ИИ-модулем по анализу ошибок (мок)" />}
      headerTone="dark"
    >
      {recommendations.length === 0 ? (
        <p className={styles.progress__muted}>Рекомендаций пока нет</p>
      ) : (
        <ul className={styles.recommendations}>
          {recommendations.map((recommendation) => (
            <li key={recommendation.id} className={styles.recommendations__item}>
              <span className={styles.recommendations__meta}>
                {recommendation.author ? <b>Преподаватель {recommendation.author}</b> : <AiBadge />} Занятие{" "}
                {formatDate(recommendation.generatedAt)}
              </span>
              <p>{recommendation.text}</p>
            </li>
          ))}
        </ul>
      )}
      {children}
    </Panel>
  );
}
