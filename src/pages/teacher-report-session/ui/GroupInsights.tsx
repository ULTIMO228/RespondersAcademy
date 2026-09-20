import { AiBadge, Panel } from "@/shared/ui";

import styles from "./ReportSession.module.css";

type GroupInsightsProps = {
  insights: string[];
};

/** 6. Инсайты ИИ по группе (groupInsights, мок). */
export function GroupInsights({ insights }: GroupInsightsProps) {
  return (
    <Panel
      title="6. Инсайты ИИ по группе"
      headerTone="dark"
      actions={<AiBadge title="Инсайты сформированы ИИ-модулем (мок), преподаватель может скорректировать" />}
    >
      {insights.length === 0 ? (
        <p className={styles.report__empty}>Инсайтов по группе нет — недостаточно завершённых попыток</p>
      ) : null}
      <ul className={styles.report__insights}>
        {insights.map((insight) => (
          <li key={insight}>
            <AiBadge /> {insight}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
