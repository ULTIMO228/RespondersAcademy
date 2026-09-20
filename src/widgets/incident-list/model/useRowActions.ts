"use client";

import { useState } from "react";

import type { IncidentListItem } from "@/entities/incident";
import type { PublicUser } from "@/shared/api";

import { useImportantMarks } from "./useImportantMarks";

const ARM_NUMBER_WIDTH = 3;

export function formatArmLabel(armNumber: number): string {
  return `АРМ ${String(armNumber).padStart(ARM_NUMBER_WIDTH, "0")}`;
}

/** Текст мок-уведомления главным специалистам (источник п. 3.13): номер АРМ и ФИО оператора из сессии. */
export function buildImportantNotice(item: IncidentListItem, student: PublicUser, isMarked: boolean): string {
  if (!isMarked) return `Пометка «важное происшествие» снята: происшествие № ${item.number}`;
  return (
    `Уведомление главным специалистам: происшествие № ${item.number} отмечено как важное — ` +
    `${formatArmLabel(student.armNumber)}, оператор ${student.fullName}`
  );
}

/** Молния «важное» + уведомление; будильник — выбор карточки для формы напоминания. */
export function useRowActions(
  student: PublicUser,
  items: IncidentListItem[],
  showNotice: (text: string) => void,
) {
  const important = useImportantMarks();
  const [reminderCardId, setReminderCardId] = useState<string | null>(null);

  function toggleImportant(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return;
    showNotice(buildImportantNotice(item, student, important.toggle(id)));
  }

  return {
    importantIds: important.ids,
    toggleImportant,
    reminderItem: items.find((item) => item.id === reminderCardId) ?? null,
    openReminder: setReminderCardId,
    closeReminder: () => setReminderCardId(null),
  };
}
