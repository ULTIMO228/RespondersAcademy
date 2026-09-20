"use client";

import { useMemo, useState } from "react";

import type { PublicUser } from "@/shared/api";

import { defaultJournalDeps, JournalDepsContext } from "../model/deps";
import type { JournalDeps } from "../model/deps";
import { useJournalData, useJournalInteractions } from "../model/useJournalScreen";
import type { JournalData, JournalInteractions } from "../model/useJournalScreen";
import { AdvancedSearch } from "./AdvancedSearch";
import { AssignedModules } from "./AssignedModules";
import { CardPreviewModal } from "./CardPreviewModal";
import { IncidentListHeader } from "./IncidentListHeader";
import { IncidentTable } from "./IncidentTable";
import { JournalNotice } from "./JournalNotice";
import { JournalPagination } from "./JournalPagination";
import { JournalToolbar } from "./JournalToolbar";
import { OperatorPanel } from "./OperatorPanel";
import { ReminderAlert } from "./ReminderAlert";
import { ReminderDialog } from "./ReminderDialog";
import styles from "./IncidentJournal.module.css";

type IncidentJournalProps = {
  /** Обучающийся — пользователь сессии (ФИО и АРМ в шапке, занятия, профиль ленты). */
  student: PublicUser;
  /** Время сервера на момент рендера: живые часы стартуют с него (совпадение SSR и гидратации). */
  initialNowMs?: number;
  /** Подмена зависимостей (клиент мок-слоя, часы, хранилище, звук) — тесты. */
  deps?: Partial<JournalDeps>;
};

type ViewProps = { data: JournalData; ui: JournalInteractions };

const AUTO_UPDATE_OFF = "Автообновление отключено — список может быть неактуален";
const OFFLINE_NOTICE = "Нет соединения с сервером — показан последний загруженный список";

function JournalTop({ data }: Pick<ViewProps, "data">) {
  const { query } = data;
  return (
    <JournalToolbar
      isAdvancedOpen={data.isAdvancedOpen}
      onToggleAdvanced={() => data.setIsAdvancedOpen(!data.isAdvancedOpen)}
      onSearch={query.applySearch}
      onReset={query.resetSearch}
      aside={<OperatorPanel operator={data.operator} nowMs={data.nowMs} />}
    >
      {data.isAdvancedOpen ? (
        <AdvancedSearch
          options={data.searchOptions}
          values={query.values}
          onChange={query.setValue}
          onSubmit={() => {
            query.applySearch();
            data.setIsAdvancedOpen(false);
          }}
          onReset={query.resetSearch}
        />
      ) : null}
    </JournalToolbar>
  );
}

function JournalList({ data, ui }: ViewProps) {
  const { list, query } = data;
  return (
    <div className={styles.journal__table}>
      <IncidentTable
        items={data.items}
        isExpanded={ui.rows.isExpanded}
        isLinksOpen={ui.rows.isLinksOpen}
        importantIds={ui.rowActions.importantIds}
        reminderIds={ui.reminderIds}
        actions={ui.actions}
        isMotionReduced={ui.isMotionReduced}
        status={list.status}
        message={list.message}
        onRetry={list.reload}
      />
      <JournalPagination
        page={list.page}
        onPageChange={query.setPageIndex}
        onPageSizeChange={query.setPageSize}
      />
    </div>
  );
}

function JournalWindows({ data, ui }: ViewProps) {
  const { rows, rowActions, reminders, dueReminder } = ui;
  return (
    <>
      {rows.previewItem ? (
        <CardPreviewModal item={rows.previewItem} onClose={rows.closePreview} onOpen={ui.actions.onOpen} />
      ) : null}
      {rowActions.reminderItem ? (
        <ReminderDialog
          item={rowActions.reminderItem}
          nowMs={data.nowMs}
          onSubmit={reminders.create}
          onClose={rowActions.closeReminder}
        />
      ) : null}
      {dueReminder ? (
        <ReminderAlert
          key={dueReminder.id}
          reminder={dueReminder}
          nowMs={data.nowMs}
          onDismiss={() => reminders.snooze(dueReminder.id)}
          onGoToCard={() => reminders.remove(dueReminder.id)}
          onRemove={() => reminders.remove(dueReminder.id)}
          onReassign={(remindAt) => reminders.reassign(dueReminder.id, remindAt)}
        />
      ) : null}
    </>
  );
}

function JournalView({ student, initialNowMs }: Omit<IncidentJournalProps, "deps">) {
  const data = useJournalData(student, initialNowMs);
  const ui = useJournalInteractions(student, data);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { session, list, query, modules } = data;
  return (
    <main className={styles.journal}>
      <JournalTop data={data} />
      <section className={styles.journal__list} aria-labelledby="incident-list-title">
        <IncidentListHeader
          session={session.badge}
          newCount={session.newCount}
          isCollapsed={isCollapsed}
          onToggleCollapsed={() => setIsCollapsed((current) => !current)}
          filter={query.filter}
          onFilterChange={query.setFilter}
          isAutoUpdate={data.isAutoUpdate}
          onAutoUpdateChange={data.setIsAutoUpdate}
        />
        {data.isAutoUpdate ? null : <JournalNotice text={AUTO_UPDATE_OFF} />}
        {list.status === "offline" ? <JournalNotice text={OFFLINE_NOTICE} tone="alert" /> : null}
        {ui.notice.notice ? <JournalNotice text={ui.notice.notice} onClose={ui.notice.hide} /> : null}
        {isCollapsed ? null : <JournalList data={data} ui={ui} />}
        <AssignedModules
          modules={modules.modules}
          status={modules.status}
          activeModuleId={session.activeScenarioId}
          startState={session.startState}
          onStart={session.startModule}
        />
      </section>
      <JournalWindows data={data} ui={ui} />
    </main>
  );
}

/** Главный экран АРМ «Поиск происшествий»: панель поиска, лента, пагинация, занятие, окна (тёмная тема). */
export function IncidentJournal({ deps, ...props }: IncidentJournalProps) {
  const value = useMemo(() => ({ ...defaultJournalDeps, ...deps }), [deps]);
  return (
    <JournalDepsContext value={value}>
      <JournalView {...props} />
    </JournalDepsContext>
  );
}
