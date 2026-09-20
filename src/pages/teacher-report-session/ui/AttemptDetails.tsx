"use client";

import { useState } from "react";

import { SEVERITY_ORDER, SEVERITY_RULES, SEVERITY_TITLES } from "@/entities/report";
import type { MistakeSeverity } from "@/entities/report";
import { Chip, Panel } from "@/shared/ui";

import type { AttemptView } from "../model/types";
import { AttemptCard } from "./AttemptCard";

import styles from "./ReportSession.module.css";

type AttemptDetailsProps = {
  attempts: AttemptView[];
};

const ALL = "all";

/** 3. Детализация по каждой попытке с фильтром по критичности (critical/major/minor, T3.4-07). */
export function AttemptDetails({ attempts }: AttemptDetailsProps) {
  const [severity, setSeverity] = useState<MistakeSeverity | typeof ALL>(ALL);
  const allIssues = attempts.flatMap((attempt) => attempt.issues);
  const countBy = (value: MistakeSeverity) => allIssues.filter((issue) => issue.severity === value).length;
  return (
    <Panel title="3. Детализация по попыткам" headerTone="dark">
      <div className={styles.report__filter} role="group" aria-label="Фильтр по критичности">
        <Chip selected={severity === ALL} onClick={() => setSeverity(ALL)} className={styles.report__chip}>
          все ({allIssues.length})
        </Chip>
        {SEVERITY_ORDER.map((value) => (
          <Chip
            key={value}
            selected={severity === value}
            onClick={() => setSeverity(value)}
            className={styles.report__chip}
            data-severity-filter={value}
            title={SEVERITY_RULES[value]}
          >
            {SEVERITY_TITLES[value]} ({countBy(value)})
          </Chip>
        ))}
      </div>
      <dl className={styles.report__severityRules}>
        {SEVERITY_ORDER.map((value) => (
          <div key={value}>
            <dt>{SEVERITY_TITLES[value]}</dt>
            <dd>{SEVERITY_RULES[value]}</dd>
          </div>
        ))}
      </dl>
      {attempts.length === 0 ? (
        <p className={styles.report__muted} role="status">
          В занятии нет завершённых попыток — детализировать нечего.
        </p>
      ) : null}
      {attempts.map((attempt) => (
        <AttemptCard
          key={attempt.id}
          attempt={attempt}
          issues={
            severity === ALL ? attempt.issues : attempt.issues.filter((issue) => issue.severity === severity)
          }
        />
      ))}
    </Panel>
  );
}
