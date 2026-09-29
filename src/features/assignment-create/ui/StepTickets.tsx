"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { AIScenarioVersion, AssignmentScenarioVersion, Scenario, Ticket } from "@/shared/api";
import {
  Alert,
  EmptyState,
  ErrorState,
  Field,
  PlatformButton,
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

import styles from "./AssignmentWizard.module.css";

type StepTicketsProps = {
  api: AssignmentCreateApi;
  draft: WizardDraft;
  errors: StepErrors;
  onChange: (patch: Partial<WizardDraft>) => void;
};

const DIFFICULTIES = [1, 2, 3, 4, 5];

const toggleItem = <T,>(items: T[], item: T, checked: boolean): T[] =>
  checked ? [...items, item] : items.filter((value) => value !== item);

export function StepTickets({ api, draft, errors, onChange }: StepTicketsProps) {
  const isChain = draft.trainingMode === "chain";
  const sourceOptions: { value: TicketSource; label: string }[] = [
    { value: "cards", label: isChain ? "Версии сценариев" : "Перечень билетов" },
    ...(isChain ? [] : [{ value: "rule" as const, label: "Случайный набор" }]),
  ];
  return (
    <div className={styles.step}>
      <SegmentedControl
        label="Источник билетов"
        options={sourceOptions}
        value={isChain ? "cards" : draft.ticketSource}
        onChange={(value) => onChange({ ticketSource: value })}
      />
      {isChain ? (
        <ChainVersions api={api} draft={draft} errors={errors} onChange={onChange} />
      ) : draft.ticketSource === "cards" ? (
        <CardList api={api} draft={draft} errors={errors} onChange={onChange} />
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
    <TicketsLoader api={api}>
      {(tickets) => <CardPicker tickets={tickets} draft={draft} errors={errors} onChange={onChange} />}
    </TicketsLoader>
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
        Выбрано: {draft.cardIds.length} из {tickets.length}
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

function ChainVersions({ api, draft, errors, onChange }: StepTicketsProps) {
  const { state, reload } = useResource(() => api.listScenarios(), [api]);
  if (state.status === "loading") return <Skeleton label="Загрузка сценариев…" lines={3} />;
  if (state.status === "serverRequired") return <ServerRequiredState onRetry={reload} />;
  if (state.status === "error") return <ErrorState message={state.message} onRetry={reload} />;
  return (
    <>
      <Alert tone="info">
        Для цепочки нужна утверждённая версия сценария режима 112 у каждого билета: без неё запуск задания
        завершится отказом сервера.
      </Alert>
      {errors.cardIds ? (
        <Alert tone="danger" role="alert">
          {errors.cardIds}
        </Alert>
      ) : null}
      <div className={styles.list} role="group" aria-label="Сценарии">
        {state.data.map((scenario) => (
          <ScenarioVersions
            key={scenario.id}
            api={api}
            scenario={scenario}
            draft={draft}
            onChange={onChange}
          />
        ))}
        {state.data.length === 0 ? <EmptyState title="Сценариев нет" /> : null}
      </div>
    </>
  );
}

function ScenarioVersions({
  api,
  scenario,
  draft,
  onChange,
}: {
  api: AssignmentCreateApi;
  scenario: Scenario;
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
}) {
  const [versions, setVersions] = useState<AIScenarioVersion[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      setVersions(await api.listScenarioVersions(scenario.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить версии");
    }
    setLoading(false);
  };

  const approved = (versions ?? []).filter(
    (item) => item.approval === "approved" && item.mode === "operator112",
  );
  const toggle = (version: AIScenarioVersion, checked: boolean) => {
    const cardId = version.cardSnapshot.id;
    const entry: AssignmentScenarioVersion = {
      scenarioId: version.scenarioId,
      version: version.version,
      cardId,
    };
    const others = draft.scenarioVersions.filter((item) => item.cardId !== cardId);
    const next = checked ? [...others, entry] : others;
    onChange({ scenarioVersions: next, cardIds: next.map((item) => item.cardId) });
  };

  return (
    <div className={styles.scenario}>
      <div className={styles.scenario__head}>
        <span>
          <strong>{scenario.id}</strong> · {scenario.title}
        </span>
        {versions === null ? (
          <PlatformButton variant="ghost" onClick={() => void load()} disabled={loading}>
            Показать утверждённые версии
          </PlatformButton>
        ) : null}
      </div>
      {message ? (
        <Alert tone="danger" role="alert">
          {message}
        </Alert>
      ) : null}
      {versions !== null && approved.length === 0 ? (
        <p className={styles.step__note}>Утверждённых версий режима 112 нет.</p>
      ) : null}
      {approved.map((version) => (
        <CheckRow
          key={`${version.scenarioId}-${version.version}`}
          checked={draft.scenarioVersions.some(
            (item) => item.scenarioId === version.scenarioId && item.version === version.version,
          )}
          onChange={(checked) => toggle(version, checked)}
        >
          Версия {version.version} · билет {version.cardSnapshot.id}
        </CheckRow>
      ))}
    </div>
  );
}
