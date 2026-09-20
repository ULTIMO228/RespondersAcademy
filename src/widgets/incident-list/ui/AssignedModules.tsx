import type { StartState } from "../model/useActiveSession";
import type { AssignedModule, LoadStatus } from "../model/types";
import styles from "./AssignedModules.module.css";

type AssignedModulesProps = {
  modules: AssignedModule[];
  status?: LoadStatus;
  /** Сценарий идущего занятия курсанта. */
  activeModuleId?: string | null;
  startState?: StartState;
  onStart?: (module: AssignedModule) => void;
};

const MAX_DIFFICULTY = 5;
const IDLE: StartState = { status: "idle", message: "" };

function ModulesStatus({ status, startState }: { status: LoadStatus; startState: StartState }) {
  if (startState.status === "starting") return <p className={styles.modules__status}>Запуск занятия…</p>;
  if (startState.status === "error") {
    return (
      <p className={[styles.modules__status, styles["modules__status--error"]].join(" ")} role="alert">
        {startState.message}
      </p>
    );
  }
  if (status === "error" || status === "offline") {
    return (
      <p className={[styles.modules__status, styles["modules__status--error"]].join(" ")} role="alert">
        Не удалось загрузить назначенные модули
      </p>
    );
  }
  return null;
}

/**
 * Тренажёрный блок «Мои назначенные модули» (ТЗ §8) в сетке и палитре ленты: клик по модулю — старт занятия
 * (лента карточек + бейдж занятия в шапке списка).
 */
export function AssignedModules(props: AssignedModulesProps) {
  const { modules, status = "ready", activeModuleId = null, startState = IDLE, onStart } = props;
  const isStarting = startState.status === "starting";
  return (
    <section className={styles.modules} aria-labelledby="assigned-modules-title">
      <h2 className={styles.modules__title} id="assigned-modules-title">
        Мои назначенные модули
      </h2>
      <div className={styles.modules__head} aria-hidden="true">
        <span>Модуль</span>
        <span>Категории</span>
        <span>Сложность</span>
        <span>Дедлайн</span>
      </div>
      <ModulesStatus status={status} startState={startState} />
      {status === "loading" ? <p className={styles.modules__empty}>Загрузка модулей…</p> : null}
      {status === "ready" && modules.length === 0 ? (
        <p className={styles.modules__empty}>Назначенных модулей нет</p>
      ) : null}
      {modules.length > 0 ? (
        <ul className={styles.modules__list}>
          {modules.map((module) => {
            const isActive = module.id === activeModuleId;
            return (
              <li key={module.id}>
                <button
                  type="button"
                  className={[styles.modules__row, isActive ? styles["modules__row--active"] : ""].join(" ")}
                  aria-pressed={isActive}
                  title={isActive ? "Идёт занятие по модулю" : "Начать занятие по модулю"}
                  disabled={isStarting}
                  onClick={() => onStart?.(module)}
                >
                  <strong className={styles.modules__name}>{module.title}</strong>
                  <span className={styles.modules__cell}>{module.categories.join(" · ")}</span>
                  <span className={styles.modules__cell}>
                    {module.difficulty} из {MAX_DIFFICULTY} · {module.levelTitle}
                  </span>
                  <span className={styles.modules__cell}>{module.deadline}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
