"use client";

import { useId, useState } from "react";

import { FLOW_BLOCKS, FLOW_CARD_FIELDS, stepLabel, stepNumbers } from "@/entities/scenario-flow";
import type {
  FlowDictionaries,
  FlowGraph,
  PreviewEvent,
  PreviewResult,
  PreviewState,
} from "@/entities/scenario-flow";
import { PfIcon, PlatformButton } from "@/shared/ui/platform";

import styles from "./FlowPreviewPanel.module.css";

type FlowPreviewPanelProps = {
  graph: FlowGraph;
  dict: FlowDictionaries;
  state: PreviewState;
  result: PreviewResult | null;
  onEvent: (event: Omit<PreviewEvent, "at">) => void;
  onWait: (seconds: number) => void;
  onFinish: () => void;
  onRestart: () => void;
  onStop: () => void;
};

const FEED_TITLES: Record<string, string> = {
  call: "Вызов",
  callerReply: "Заявитель",
  briefing: "Вводная",
  hint: "Подсказка",
  variant: "Случайный вариант",
};

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function eventText(event: PreviewEvent, dict: FlowDictionaries): string {
  switch (event.kind) {
    case "field":
      return `${FLOW_CARD_FIELDS.find((field) => field.value === event.field)?.label ?? event.field}: «${event.value}»`;
    case "status":
      return `Статус «${dict.ddsStatuses.find((status) => status.value === event.value)?.label ?? event.value}»`;
    case "call":
      return `Звонок в службу ${event.value}`;
    case "service":
      return `Оповещена ${dict.services.find((service) => service.value === event.value)?.label ?? event.value}`;
    case "transfer":
      return "Перевод в ЦУС другого региона";
    case "sign":
      return `Признак «${event.value}»`;
    case "text":
      return `Комментарий: «${event.value}»`;
  }
}

/**
 * «Запустить тест» (FR-020): автор отмечает действия студента, движок ведёт схему по тем же правилам, что у студента.
 * Время — учебные часы прогона: двигаются кнопками «Подождать». Результат в статистику не попадает.
 */
export function FlowPreviewPanel({
  graph,
  dict,
  state,
  result,
  onEvent,
  onWait,
  onFinish,
  onRestart,
  onStop,
}: FlowPreviewPanelProps) {
  const ids = {
    field: useId(),
    value: useId(),
    service: useId(),
    status: useId(),
    sign: useId(),
    comment: useId(),
  };
  const [field, setField] = useState("address");
  const [value, setValue] = useState("");
  const [service, setService] = useState("");
  const [status, setStatus] = useState("");
  const [sign, setSign] = useState("");
  const [comment, setComment] = useState("");
  // Подтверждение у той формы, где действие отмечено: поле очищается, но видно, что записано (отзыв 2026-10-20).
  const [recorded, setRecorded] = useState<{ form: string; text: string } | null>(null);
  const record = (form: string, event: Omit<PreviewEvent, "at">) => {
    onEvent(event);
    setRecorded({ form, text: eventText({ ...event, at: state.clock }, dict) });
  };
  const confirmation = (form: string) =>
    recorded?.form === form ? (
      <p className={styles.recorded} role="status">
        ✓ Записано: {recorded.text}
      </p>
    ) : null;
  const numbers = stepNumbers(graph);
  const active = state.activeNodeId;
  const dds = graph.mode === "dds";
  const services = dds ? dict.phoneNumbers : dict.services;

  return (
    <aside className={styles.panel} aria-label="Пробный прогон">
      <div className={styles.head}>
        <h2 className={styles.title}>
          <PfIcon name="play" /> Пробный прогон
        </h2>
        <p className={styles.note}>Так сценарий увидит студент. Результат в статистику не попадает.</p>
        <div className={styles.meta}>
          <span>
            Время прогона: <b className={styles.clock}>{clock(state.clock)}</b>
          </span>
          {state.exam ? <span className={styles.chip}>экзамен: без подсказок</span> : null}
        </div>
        {active ? (
          <p className={styles.waiting} role="status">
            Сейчас ждёт: <b>{stepLabel(graph, active, numbers)}</b> (
            {FLOW_BLOCKS[graph.nodes.find((node) => node.id === active)?.type ?? "start"].title.toLowerCase()}
            )
          </p>
        ) : null}
      </div>

      <div className={styles.body}>
        <section aria-label="Что происходит">
          <h3 className={styles.section}>Что происходит</h3>
          <ol className={styles.feed} aria-live="polite">
            {state.feed.map((item, index) => (
              <li key={index} className={styles[`feed--${item.kind}`]}>
                <span className={styles.feed__time}>{clock(item.at)}</span>
                <span>
                  <b>{FEED_TITLES[item.kind]}:</b> {item.text}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-label="Мои действия">
          <h3 className={styles.section}>Мои действия</h3>
          {state.events.length ? (
            <ol className={styles.log}>
              {state.events.map((event, index) => (
                <li key={index}>
                  <span className={styles.feed__time}>{clock(event.at)}</span> {eventText(event, dict)}
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.empty}>Пока ничего не отмечено. Действия студента отмечаются ниже.</p>
          )}
        </section>

        {result ? (
          <section className={styles.result} aria-label="Итог прогона">
            <div className={styles.score} role="status">
              <span className={styles.score__value}>{result.score}</span>
              <span>
                из 100 · {result.earned.toLocaleString("ru-RU")} из {result.max} баллов
                <br />
                <b className={result.passed ? styles.passed : styles.failed}>
                  {result.passed ? "Сдано" : "Не сдано"}
                </b>
                {state.finishReason === "student" ? " · завершено досрочно" : ""}
              </span>
            </div>
            {result.errors.length ? (
              <ul className={styles.errors}>
                {result.errors.map((error, index) => (
                  <li key={index} className={styles[`error--${error.severity}`]}>
                    {error.message}
                    {error.pointsLost ? ` (−${error.pointsLost.toLocaleString("ru-RU")})` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Ошибок нет.</p>
            )}
            <div className={styles.actions}>
              <PlatformButton variant="primary" className={styles.button} onClick={onRestart}>
                Пройти ещё раз
              </PlatformButton>
              <PlatformButton className={styles.button} onClick={onStop}>
                Вернуться к редактированию
              </PlatformButton>
            </div>
          </section>
        ) : (
          <section aria-label="Действия студента" className={styles.controls}>
            <h3 className={styles.section}>Отметьте действие студента</h3>
            <div className={styles.form}>
              <label htmlFor={ids.field}>Указать значение поля</label>
              <select
                id={ids.field}
                className={styles.control}
                value={field}
                onChange={(event) => setField(event.target.value)}
              >
                {FLOW_CARD_FIELDS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <label htmlFor={ids.value} className="visually-hidden">
                Значение
              </label>
              <div className={styles.row}>
                <input
                  id={ids.value}
                  className={styles.control}
                  value={value}
                  placeholder="Например: ул. Грина, 11"
                  onChange={(event) => setValue(event.target.value)}
                />
                <PlatformButton
                  className={styles.button}
                  disabled={!value.trim()}
                  onClick={() => {
                    record("field", { kind: "field", field, value: value.trim() });
                    setValue("");
                  }}
                >
                  Записать
                </PlatformButton>
              </div>
              {confirmation("field")}
            </div>

            <div className={styles.form}>
              <label htmlFor={ids.service}>{dds ? "Вызвать службу по телефону" : "Оповестить службу"}</label>
              <div className={styles.row}>
                <select
                  id={ids.service}
                  className={styles.control}
                  value={service}
                  onChange={(event) => setService(event.target.value)}
                >
                  <option value="">Выберите службу…</option>
                  {services.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <PlatformButton
                  className={styles.button}
                  disabled={!service}
                  onClick={() => record("service", { kind: dds ? "call" : "service", value: service })}
                >
                  {dds ? "Позвонить" : "Оповестить"}
                </PlatformButton>
              </div>
              {confirmation("service")}
            </div>

            {dds ? (
              <div className={styles.form}>
                <label htmlFor={ids.status}>Поставить статус</label>
                <div className={styles.row}>
                  <select
                    id={ids.status}
                    className={styles.control}
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                  >
                    <option value="">Выберите статус…</option>
                    {dict.ddsStatuses.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <PlatformButton
                    className={styles.button}
                    disabled={!status}
                    onClick={() => record("status", { kind: "status", value: status })}
                  >
                    Поставить
                  </PlatformButton>
                </div>
                {confirmation("status")}
              </div>
            ) : (
              <div className={styles.form}>
                <label htmlFor={ids.sign}>Отметить признак</label>
                <div className={styles.row}>
                  <input
                    id={ids.sign}
                    className={styles.control}
                    list={`${ids.sign}-list`}
                    value={sign}
                    placeholder="Например: газификация"
                    onChange={(event) => setSign(event.target.value)}
                  />
                  <datalist id={`${ids.sign}-list`}>
                    {dict.signs.slice(0, 400).map((option) => (
                      <option key={option.value} value={option.value} />
                    ))}
                  </datalist>
                  <PlatformButton
                    className={styles.button}
                    disabled={!sign.trim()}
                    onClick={() => record("sign", { kind: "sign", value: sign.trim() })}
                  >
                    Отметить
                  </PlatformButton>
                </div>
                {confirmation("sign")}
              </div>
            )}

            <div className={styles.form}>
              <label htmlFor={ids.comment}>Написать комментарий</label>
              <div className={styles.row}>
                <input
                  id={ids.comment}
                  className={styles.control}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                />
                <PlatformButton
                  className={styles.button}
                  disabled={!comment.trim()}
                  onClick={() => {
                    record("comment", { kind: "text", field: "dispatcherAction", value: comment.trim() });
                    setComment("");
                  }}
                >
                  Записать
                </PlatformButton>
              </div>
              {confirmation("comment")}
            </div>

            <PlatformButton
              className={styles.button}
              onClick={() => record("transfer", { kind: "transfer", value: "region" })}
            >
              Перевести в ЦУС другого региона
            </PlatformButton>
            {confirmation("transfer")}

            <div className={styles.wait} role="group" aria-label="Подождать">
              <span>Подождать:</span>
              {[10, 30, 60].map((seconds) => (
                <PlatformButton key={seconds} className={styles.button} onClick={() => onWait(seconds)}>
                  +{seconds} с
                </PlatformButton>
              ))}
            </div>

            <div className={styles.actions}>
              <PlatformButton className={styles.button} onClick={onFinish}>
                Завершить прохождение
              </PlatformButton>
              <PlatformButton variant="ghost" className={styles.button} onClick={onStop}>
                Остановить тест
              </PlatformButton>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
