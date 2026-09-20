"use client";

import { useMemo, useState } from "react";

import type { IncidentListItem, IncidentRowActions } from "@/entities/incident";
import { formatShortName } from "@/entities/user";
import type { PublicUser } from "@/shared/api";

import { buildMapContext } from "../lib/mapContext";
import { useAssignedModules } from "./useAssignedModules";
import { useJournalHotkeys } from "./useJournalHotkeys";
import { useJournalList } from "./useJournalList";
import { useJournalQuery } from "./useJournalQuery";
import { useJournalRows } from "./useJournalRows";
import { useNotice } from "./useNotice";
import { useNow } from "./useNow";
import { useReducedMotion } from "./useReducedMotion";
import { useReference } from "./useReference";
import { useReminders } from "./useReminders";
import { formatArmLabel, useRowActions } from "./useRowActions";
import { useSearchOptions } from "./useSearchOptions";
import { useSessionRows } from "./useSessionRows";

export const INSERT_HINT =
  "Создание новой карточки (Insert) доступно преподавателю — у обучающегося неактивно";

/** Данные ленты: часы, справочники, запрос и выдача журнала, строки занятия (новые сверху), модули. */
export function useJournalData(student: PublicUser, initialNowMs?: number) {
  const nowMs = useNow(initialNowMs);
  const { reference } = useReference();
  const context = useMemo(
    () => (reference ? buildMapContext(reference, student.service) : null),
    [reference, student.service],
  );
  const query = useJournalQuery();
  const [isAutoUpdate, setIsAutoUpdate] = useState(true);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const list = useJournalList(query.request, context, isAutoUpdate);
  const session = useSessionRows({ student, context, nowMs, isAutoUpdate });
  const sessionRows = query.request.view === "all" ? session.rows : [];
  return {
    nowMs,
    query,
    list,
    session,
    items: [...sessionRows, ...list.items] as IncidentListItem[],
    isAutoUpdate,
    setIsAutoUpdate,
    isAdvancedOpen,
    setIsAdvancedOpen,
    searchOptions: useSearchOptions(reference, isAdvancedOpen),
    modules: useAssignedModules(student),
    operator: {
      operatorLabel: `оп. ${student.armNumber} , ${formatShortName(student.fullName)}`,
      armLabel: formatArmLabel(student.armNumber),
    },
  };
}

export type JournalData = ReturnType<typeof useJournalData>;

/** Действия со строками, окна (предпросмотр, напоминания), уведомления и горячие клавиши списка. */
export function useJournalInteractions(student: PublicUser, data: JournalData) {
  const isMotionReduced = useReducedMotion();
  const rows = useJournalRows(data.items);
  const notice = useNotice();
  const rowActions = useRowActions(student, data.items, notice.show);
  const reminders = useReminders(data.nowMs);
  const isModalOpen = Boolean(rows.previewItem || rowActions.reminderItem);

  useJournalHotkeys({
    onEscape: () => {
      if (isModalOpen) return;
      if (notice.notice) notice.hide();
      else data.setIsAdvancedOpen(false);
    },
    onInsert: () => notice.show(INSERT_HINT),
  });

  const actions: IncidentRowActions = {
    ...rows.actions,
    onToggleImportant: rowActions.toggleImportant,
    onOpen: data.session.recordOpen,
    onReminder: rowActions.openReminder,
  };
  return {
    rows,
    notice,
    rowActions,
    reminders,
    actions,
    reminderIds: new Set(reminders.reminders.map((reminder) => reminder.cardId)),
    dueReminder: isModalOpen ? null : reminders.due,
    isMotionReduced,
  };
}

export type JournalInteractions = ReturnType<typeof useJournalInteractions>;
