"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { AIScenarioListItem, AssignmentScenarioVersion, Ticket } from "@/shared/api";
import {
  Alert,
  EmptyState,
  ErrorState,
  Field,
  SegmentedControl,
  SelectField,
  ServerRequiredState,
  Skeleton,
  Tag,
  useResource,
} from "@/shared/ui/platform";

import type { AssignmentCreateApi } from "../api/assignmentCreateApi";
import type { StepErrors, TicketSource, WizardDraft } from "../model/types";
import { CheckRow } from "./CheckRow";
import { StudentCardBank } from "./StudentCardBank";

import styles from "./AssignmentWizard.module.css";

type StepTicketsProps = {
  api: AssignmentCreateApi;
  draft: WizardDraft;
  errors: StepErrors;
  onChange: (patch: Partial<WizardDraft>) => void;
};

type StepTicketsViewProps = StepTicketsProps & {
  /** Название этапа из карты ошибок: только подсказка, билеты мастер по нему не подбирает (решение D3). */
  focusStage?: string;
};

const DIFFICULTIES = [1, 2, 3, 4, 5];

const toggleItem = <T,>(items: T[], item: T, checked: boolean): T[] =>
  checked ? [...items, item] : items.filter((value) => value !== item);

export function StepTickets({ api, draft, errors, onChange, focusStage }: StepTicketsViewProps) {
  const sourceOptions: { value: TicketSource; label: string }[] = [
    { value: "cards", label: "Перечень билетов" },
    { value: "rule", label: "Случайный набор" },
  ];
  return (
    <div className={styles.step}>
      {focusStage ? <Alert tone="info">{`Подберите билеты на тему «${focusStage}»`}</Alert> : null}
      <SegmentedControl
        label="Источник билетов"
        options={sourceOptions}
        value={draft.ticketSource}
        onChange={(value) => onChange({ ticketSource: value })}
      />
      {draft.ticketSource === "cards" ? (
        <>
          <CardList api={api} draft={draft} errors={errors} onChange={onChange} />
          <GraphScenarios api={api} draft={draft} onChange={onChange} />
        </>
      ) : (
        <RandomRule api={api} draft={draft} errors={errors} onChange={onChange} />
      )}
    </div>
  );
}

function TicketsLoader({
  api,
  children,
}: {
  api: AssignmentCreateApi;
  children: (tickets: Ticket[]) => ReactNode;
}) {
  const { state, reload } = useResource(() => api.listTickets(), [api]);
  if (state.status === "loading") return <Skeleton label="Загрузка билетов…" lines={4} />;
  if (state.status === "serverRequired") return <ServerRequiredState onRetry={reload} />;
  if (state.status === "error") return <ErrorState message={state.message} onRetry={reload} />;
  return <>{children(state.data.filter((ticket) => ticket.approved))}</>;
}

function CardList({ api, draft, errors, onChange }: StepTicketsProps) {
  return (
    <>
      <TicketsLoader api={api}>
        {(tickets) => <CardPicker tickets={tickets} draft={draft} errors={errors} onChange={onChange} />}
      </TicketsLoader>
      {/* Спека 011: ДДС получает и карточки обучающихся-112 — только через отбор преподавателем. */}
      {draft.trainingMode === "dds" ? (
        <StudentCardBank api={api} draft={draft} errors={errors} onChange={onChange} />
      ) : null}
    </>
  );
}

function CardPicker({
  tickets,
  draft,
  errors,
  onChange,
}: { tickets: Ticket[] } & Omit<StepTicketsProps, "api">) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const groups = useMemo(
    () => [...new Set(tickets.map((ticket) => ticket.group))].sort((a, b) => a.localeCompare(b, "ru")),
    [tickets],
  );
  const visible = tickets.filter(
    (ticket) =>
      (!group || ticket.group === group) &&
      (!query ||
        `${ticket.id} ${ticket.summary} ${ticket.address}`.toLowerCase().includes(query.toLowerCase())),
  );
  if (tickets.length === 0) {
    return (
      <EmptyState
        title="Нет утверждённых билетов"
        text="В задание можно включать только утверждённые билеты."
      />
    );
  }
  return (
    <>
      {errors.cardIds ? (
        <Alert tone="danger" role="alert">
          {errors.cardIds}
        </Alert>
      ) : null}
      <div className={styles.filters}>
        <Field label="Поиск" value={query} onChange={(event) => setQuery(event.target.value)} />
        <SelectField
          label="Группа происшествий"
          value={group}
          onChange={(event) => setGroup(event.target.value)}
        >
          <option value="">Все группы</option>
          {groups.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </SelectField>
      </div>
      <p className={styles.step__note}>
        Выбрано: {tickets.filter((ticket) => draft.cardIds.includes(ticket.id)).length} из {tickets.length}
      </p>
      <div className={styles.list} role="group" aria-label="Билеты">
        {visible.map((ticket) => (
          <CheckRow
            key={ticket.id}
            checked={draft.cardIds.includes(ticket.id)}
            onChange={(checked) => onChange({ cardIds: toggleItem(draft.cardIds, ticket.id, checked) })}
          >
            <strong>{ticket.id}</strong> · {ticket.group}
            <Tag>сложность {ticket.difficulty}</Tag>
            <span className={styles.check__meta}> {ticket.summary}</span>
          </CheckRow>
        ))}
        {visible.length === 0 ? <p className={styles.step__note}>По фильтру билетов нет.</p> : null}
      </div>
    </>
  );
}

function RandomRule({ api, draft, errors, onChange }: StepTicketsProps) {
  const groupsResource = useResource(() => api.listIncidentGroups(), [api]);
  const ticketsResource = useResource(() => api.listTickets(), [api]);
  const matching =
    ticketsResource.state.status === "ready"
      ? ticketsResource.state.data.filter(
          (ticket) =>
            ticket.approved &&
            (draft.ruleGroups.length === 0 || draft.ruleGroups.includes(ticket.group)) &&
            (draft.ruleDifficulty.length === 0 || draft.ruleDifficulty.includes(ticket.difficulty)),
        ).length
      : null;
  return (
    <>
      <fieldset className={styles.group}>
        <legend className={styles.group__title}>Группы происшествий (пусто — любые)</legend>
        {groupsResource.state.status === "loading" ? <Skeleton lines={2} label="Загрузка групп…" /> : null}
        {groupsResource.state.status === "serverRequired" ? (
          <ServerRequiredState onRetry={groupsResource.reload} />
        ) : null}
        {groupsResource.state.status === "error" ? (
          <ErrorState message={groupsResource.state.message} onRetry={groupsResource.reload} />
        ) : null}
        {groupsResource.state.status === "ready"
          ? groupsResource.state.data.map((group) => (
              <CheckRow
                key={group}
                checked={draft.ruleGroups.includes(group)}
                onChange={(checked) => onChange({ ruleGroups: toggleItem(draft.ruleGroups, group, checked) })}
              >
                {group}
              </CheckRow>
            ))
          : null}
      </fieldset>
      <fieldset className={styles.group}>
        <legend className={styles.group__title}>Сложность (пусто — любая)</legend>
        <div className={styles.inline}>
          {DIFFICULTIES.map((level) => (
            <CheckRow
              key={level}
              checked={draft.ruleDifficulty.includes(level)}
              onChange={(checked) =>
                onChange({ ruleDifficulty: toggleItem(draft.ruleDifficulty, level, checked) })
              }
            >
              {level}
            </CheckRow>
          ))}
        </div>
      </fieldset>
      <Field
        label="Количество билетов"
        inputMode="numeric"
        value={draft.ruleCount}
        error={errors.ruleCount}
        hint={matching === null ? undefined : `Утверждённых билетов по условиям: ${matching}`}
        onChange={(event) => onChange({ ruleCount: event.target.value })}
      />
    </>
  );
}

type GraphScenariosProps = {
  api: AssignmentCreateApi;
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
};

/**
 * Раздел «Сценарии с графом» (режимы operator112 и dds): опубликованные сценарии режима задания. Выбор версии
 * подтягивает её карточку; пара (сценарий, версия, карточка) уходит в scenarioVersions, карточка — в cardIds.
 */
function GraphScenarios({ api, draft, onChange }: GraphScenariosProps) {
  const mode = draft.trainingMode;
  const { state, reload } = useResource(
    async () =>
      // Назначается последняя ОПУБЛИКОВАННАЯ версия: черновик следующей версии её не скрывает.
      (await api.listGraphScenarios({})).filter(
        (item) => item.hasGraph && item.latestApprovedVersion !== null && item.mode === mode,
      ),
    [api, mode],
  );
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isSelected = (item: AIScenarioListItem) =>
    draft.scenarioVersions.some(
      (entry) => entry.scenarioId === item.scenarioId && entry.version === item.latestApprovedVersion,
    );

  const toggle = async (item: AIScenarioListItem, checked: boolean) => {
    setMessage(null);
    if (!checked) {
      const entry = draft.scenarioVersions.find(
        (value) => value.scenarioId === item.scenarioId && value.version === item.latestApprovedVersion,
      );
      if (!entry) return;
      onChange({
        scenarioVersions: draft.scenarioVersions.filter((value) => value !== entry),
        cardIds: draft.cardIds.filter((cardId) => cardId !== entry.cardId),
      });
      return;
    }
    setPending(item.scenarioId);
    try {
      const published = item.latestApprovedVersion;
      if (published === null) return;
      const loaded = await api.getGraphScenarioVersion(item.scenarioId, published);
      const cardId = loaded.cardSnapshot.id;
      const entry: AssignmentScenarioVersion = {
        scenarioId: item.scenarioId,
        version: published,
        cardId,
      };
      onChange({
        scenarioVersions: [...draft.scenarioVersions, entry],
        cardIds: draft.cardIds.includes(cardId) ? draft.cardIds : [...draft.cardIds, cardId],
      });
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : "Не удалось загрузить версию");
    } finally {
      setPending(null);
    }
  };

  return (
    <fieldset className={styles.group}>
      <legend className={styles.group__title}>Сценарии с графом</legend>
      {state.status === "loading" ? <Skeleton lines={2} label="Загрузка сценариев с графом…" /> : null}
      {state.status === "serverRequired" ? (
        <p className={styles.step__note}>Сценарии с графом доступны при работе с сервером тренажёра.</p>
      ) : null}
      {state.status === "error" ? <ErrorState message={state.message} onRetry={reload} /> : null}
      {state.status === "ready" && state.data.length === 0 ? (
        <p className={styles.step__note}>Опубликованных сценариев с графом для этого режима нет.</p>
      ) : null}
      {message ? (
        <Alert tone="danger" role="alert">
          {message}
        </Alert>
      ) : null}
      {state.status === "ready"
        ? state.data.map((item) => (
            <CheckRow
              key={item.scenarioId}
              checked={isSelected(item)}
              disabled={pending === item.scenarioId}
              onChange={(checked) => void toggle(item, checked)}
            >
              <strong>{item.title}</strong> · версия {item.latestApprovedVersion}
            </CheckRow>
          ))
        : null}
    </fieldset>
  );
}
