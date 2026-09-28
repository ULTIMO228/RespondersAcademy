import { ISSUE_ORDER_TITLES } from "../config/wizard";
import { getEligibleScenarios } from "../lib/eligibleScenarios";
import type { IssueOrder, WizardScenario } from "../model/types";
import { WizardStep } from "./WizardStep";

import styles from "./SessionWizard.module.css";

type StepScenariosProps = {
  scenarios: WizardScenario[];
  categories: string[];
  selectedIds: string[];
  order: IssueOrder;
  onToggle: (scenarioId: string) => void;
  onMove: (scenarioId: string, offset: number) => void;
  onOrderChange: (order: IssueOrder) => void;
};

const ORDERS: IssueOrder[] = ["adaptive", "manual"];

/** Шаг 4. Сценарии: только approved (spec/000-фронт/04-pages/11); порядок выдачи — ручной / adaptive (дефолт). */
export function StepScenarios(props: StepScenariosProps) {
  const { scenarios, categories, selectedIds, order, onToggle, onMove, onOrderChange } = props;
  const eligible = getEligibleScenarios(scenarios, categories);
  const position = (scenarioId: string) => selectedIds.indexOf(scenarioId);
  return (
    <WizardStep index={4} title="Сценарии" hint={`только утверждённые · подходит ${eligible.length}`}>
      <div className={styles.wizard__radios} role="radiogroup" aria-label="Порядок выдачи">
        {ORDERS.map((item) => (
          <label key={item} className={styles.wizard__radioInline}>
            <input
              type="radio"
              name="issueOrder"
              checked={order === item}
              onChange={() => onOrderChange(item)}
            />
            {ISSUE_ORDER_TITLES[item]}
            {item === "adaptive" ? <span className={styles.wizard__muted}> (по умолчанию)</span> : null}
          </label>
        ))}
      </div>
      {eligible.length === 0 ? (
        <p className={styles.wizard__muted}>
          Утверждённых сценариев выбранных категорий нет — измените категории событий
        </p>
      ) : (
        <table className={styles.wizard__table} aria-label="Подходящие сценарии">
          <thead>
            <tr>
              <th scope="col">Выбор</th>
              {order === "manual" ? <th scope="col">№</th> : null}
              <th scope="col">Сценарий</th>
              <th scope="col">Сложн.</th>
              <th scope="col">Категории</th>
            </tr>
          </thead>
          <tbody>
            {eligible.map((scenario) => (
              <tr key={scenario.id} data-scenario-id={scenario.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Выбрать: ${scenario.title}`}
                    checked={selectedIds.includes(scenario.id)}
                    onChange={() => onToggle(scenario.id)}
                  />
                </td>
                {order === "manual" ? (
                  <td>
                    {position(scenario.id) + 1 || "—"}
                    {position(scenario.id) >= 0 ? (
                      <>
                        <button
                          type="button"
                          className={styles.wizard__move}
                          aria-label={`Выдавать раньше: ${scenario.title}`}
                          disabled={position(scenario.id) === 0}
                          onClick={() => onMove(scenario.id, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className={styles.wizard__move}
                          aria-label={`Выдавать позже: ${scenario.title}`}
                          disabled={position(scenario.id) === selectedIds.length - 1}
                          onClick={() => onMove(scenario.id, 1)}
                        >
                          ↓
                        </button>
                      </>
                    ) : null}
                  </td>
                ) : null}
                <td>{scenario.title}</td>
                <td>{scenario.difficulty}</td>
                <td className={styles.wizard__muted}>{scenario.categories.join("; ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </WizardStep>
  );
}
