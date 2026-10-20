"use client";

import type { ClassifierEntry, NotificationListItem } from "@/shared/api";
import { Chip, Select } from "@/shared/ui";

import { listGroups, resolveEntry, visibleLevels } from "../model/tree";
import { useQuestionnaire } from "../model/useQuestionnaire";
import type { QuestionnaireApi, QuestionnaireValue } from "../model/useQuestionnaire";
import type { NotificationListResponse } from "@/shared/api";

import styles from "./Operator112Questionnaire.module.css";

type Operator112QuestionnaireProps = {
  attemptId: string;
  entries: readonly ClassifierEntry[];
  initialSigns?: readonly string[];
  /** Пока вызов не принят или карточка передана, выбор недоступен. */
  disabled?: boolean;
  refreshToken?: number;
  api?: QuestionnaireApi;
  onChange?: (value: QuestionnaireValue, list: NotificationListResponse | null) => void;
};

const MODE_TITLES: Record<string, string> = { mapped: "ВИС", card112: "карточка-112", manual: "вручную" };

function ServiceRow({ item, manual = false }: { item: NotificationListItem; manual?: boolean }) {
  return (
    <li className={styles.list__row} data-added-by={item.addedBy}>
      <span className={styles.list__title}>{item.title}</span>
      {item.mode && item.mode !== "manual" ? (
        <span className={styles.list__mode}>{MODE_TITLES[item.mode] ?? item.mode}</span>
      ) : null}
      {item.addedBy === "manual" || manual ? <span className={styles.list__badge}>вручную</span> : null}
      {item.condition ? <span className={styles.list__reason}>условие: {item.condition}</span> : null}
    </li>
  );
}

/**
 * Опросная карта режима 112 (памятка стр. 15): группа → признаки → итоговый тип; под ней — список оповещения,
 * рассчитанный сервером, с причиной включения (условие) и добавлением условных служб вручную.
 */
export function Operator112Questionnaire({
  attemptId,
  entries,
  initialSigns,
  disabled = false,
  refreshToken,
  api,
  onChange,
}: Operator112QuestionnaireProps) {
  const q = useQuestionnaire({ attemptId, entries, initialSigns, disabled, refreshToken, api, onChange });
  const groups = listGroups(entries);
  const levels = visibleLevels(entries, q.selection);
  const entry = resolveEntry(entries, q.selection);
  const listed =
    q.listState.status === "ready" ? new Set(q.listState.list.services.map((item) => item.serviceId)) : null;
  // Условная служба, уже добавленная вручную, из предложений исчезает (сервер продолжает отдавать её в conditional).
  const conditional =
    q.listState.status === "ready"
      ? q.listState.list.conditional.filter((item) => !listed?.has(item.serviceId))
      : [];

  return (
    <section className={styles.q} aria-label="Опросная карта" data-disabled={disabled}>
      <Select
        label="Происшествие"
        placeholder="Выберите группу происшествия"
        value={q.selection.group}
        disabled={disabled}
        options={groups.map((group) => ({ value: group, label: group }))}
        onChange={(event) => q.chooseGroup(event.target.value)}
      />
      {levels.map((level) => (
        <div key={level.level} className={styles.q__level} role="group" aria-label={level.title}>
          <span className={styles.q__question}>{level.title}</span>
          <div className={styles.q__options}>
            {level.options.map((option) => (
              <Chip
                key={option}
                selected={level.selected === option}
                disabled={disabled}
                onClick={() => q.chooseSign(level.level, option)}
              >
                {option}
              </Chip>
            ))}
          </div>
        </div>
      ))}
      <p className={styles.q__type}>
        Класс.:{" "}
        {entry ? <strong>{entry.finalType}</strong> : <span className={styles.q__empty}>не определён</span>}
      </p>
      {q.notice ? (
        <p className={styles.q__notice} role="alert">
          {q.notice}
        </p>
      ) : null}

      <div className={styles.list} aria-label="Список оповещения">
        <h3 className={styles.list__heading}>Список оповещения</h3>
        {q.listState.status === "empty" ? (
          <p className={styles.q__empty}>Выберите признаки — список оповещения рассчитает сервер</p>
        ) : null}
        {q.listState.status === "loading" ? (
          <p className={styles.q__empty} role="status">
            Расчёт списка оповещения…
          </p>
        ) : null}
        {q.listState.status === "error" ? (
          <p className={styles.q__notice} role="alert">
            {q.listState.message}{" "}
            <button type="button" className={styles.list__retry} onClick={() => void q.retry()}>
              Повторить
            </button>
          </p>
        ) : null}
        {q.listState.status === "ready" ? (
          <>
            {q.listState.list.services.length ? (
              <ul className={styles.list__items}>
                {q.listState.list.services.map((item) => (
                  <ServiceRow key={`${item.serviceId}-${item.condition ?? ""}`} item={item} />
                ))}
              </ul>
            ) : (
              <p className={styles.q__empty}>Обязательных служб нет</p>
            )}
            {conditional.length ? (
              <>
                <h4 className={styles.list__subheading}>Условные службы — добавить вручную</h4>
                <ul className={styles.list__items}>
                  {conditional.map((item) => (
                    <li key={`${item.serviceId}-${item.condition ?? ""}`} className={styles.list__row}>
                      <span className={styles.list__title}>{item.title}</span>
                      {item.condition ? (
                        <span className={styles.list__reason}>условие: {item.condition}</span>
                      ) : null}
                      <button
                        type="button"
                        className={styles.list__add}
                        disabled={disabled}
                        onClick={() => void q.addService(item.serviceId)}
                        aria-label={`Добавить службу ${item.title}`}
                      >
                        Добавить
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
