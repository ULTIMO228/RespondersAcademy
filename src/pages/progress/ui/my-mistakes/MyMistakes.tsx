import { MISTAKE_CATEGORY_TITLES, SeverityMark } from "@/entities/report";
import type { MistakeExample, MistakeGroup } from "@/entities/report";
import { Panel } from "@/shared/ui";

import styles from "../ProgressPage.module.css";

type MyMistakesProps = {
  groups: MistakeGroup[];
};

function MistakeExampleItem({ example }: { example: MistakeExample }) {
  return (
    <li className={styles.mistakes__example} data-severity={example.severity ?? undefined}>
      <span className={styles.mistakes__card}>№ {example.cardNumber}</span>
      {example.grammar ? (
        <span>
          «{example.grammar.fragment}»: <s>{example.grammar.wrong}</s> → <b>{example.grammar.expected}</b>
        </span>
      ) : (
        <span>
          <SeverityMark severity={example.severity} /> {example.message}
        </span>
      )}
    </li>
  );
}

/** «Мои ошибки»: Evaluation.errors + grammarErrors по всем попыткам, 5 типов спеки со счётчиками и примерами. */
export function MyMistakes({ groups }: MyMistakesProps) {
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  return (
    <Panel title="Мои ошибки" headerTone="dark">
      <table className={styles.history}>
        <caption className="visually-hidden">Мои ошибки по типам</caption>
        <thead>
          <tr>
            <th scope="col">Тип ошибки</th>
            <th scope="col" className={styles.history__num}>
              Количество
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.category} data-category={group.category}>
              <td>
                {MISTAKE_CATEGORY_TITLES[group.category]}
                {group.examples.length > 0 ? (
                  <ul
                    className={styles.mistakes__examples}
                    aria-label={`Примеры: ${MISTAKE_CATEGORY_TITLES[group.category]}`}
                  >
                    {group.examples.map((example) => (
                      <MistakeExampleItem key={example.key} example={example} />
                    ))}
                  </ul>
                ) : null}
              </td>
              <td className={styles.history__num}>{group.count}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Всего</th>
            <td className={styles.history__num}>{total}</td>
          </tr>
        </tfoot>
      </table>
    </Panel>
  );
}
