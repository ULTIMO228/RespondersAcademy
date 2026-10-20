import type { AiServedBy } from "@/shared/api";
import { AiSourceBadge, Panel } from "@/shared/ui";

import styles from "./ReportSession.module.css";

type GroupInsightsProps = {
  insights: string[];
  source?: AiServedBy;
};

/** 6. Групповые выводы и фактический источник текста. */
export function GroupInsights({ insights, source }: GroupInsightsProps) {
  return (
    <Panel title="6. Выводы по группе" headerTone="dark" actions={<AiSourceBadge source={source} />}>
      {insights.length === 0 ? (
        <p className={styles.report__empty}>Инсайтов по группе нет — недостаточно завершённых попыток</p>
      ) : null}
      <ul className={styles.report__insights}>
        {insights.map((insight) => (
          <li key={insight}>{insight}</li>
        ))}
      </ul>
    </Panel>
  );
}
