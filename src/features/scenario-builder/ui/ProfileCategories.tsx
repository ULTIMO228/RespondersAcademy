"use client";

import { useState } from "react";

import { Button, Chip, Panel } from "@/shared/ui";

import type { ProfileRowView } from "../model/types";

import styles from "./ProfileCategories.module.css";

type ProfileCategoriesProps = {
  rows: ProfileRowView[];
  incidentGroups: string[];
  /** «Сохранить привязку» → PUT /api/mock/profile-mapping (пишется в журнал аудита). */
  onSave: (rows: { id: string; incidentGroups: string[] }[]) => Promise<void>;
};

/** Привязка службы/группы курсантов к профильным группам ЕКП (ролевая модель, сценарий А шаг 5). */
export function ProfileCategories({ rows, incidentGroups, onSave }: ProfileCategoriesProps) {
  const [selection, setSelection] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, row.incidentGroups])),
  );
  const [status, setStatus] = useState<{ kind: "saved" | "error"; text: string } | null>(null);
  const [isBusy, setBusy] = useState(false);
  const toggleGroup = (rowId: string, group: string) => {
    setStatus(null);
    setSelection((current) => {
      const groups = current[rowId] ?? [];
      const next = groups.includes(group) ? groups.filter((item) => item !== group) : [...groups, group];
      return { ...current, [rowId]: next };
    });
  };
  async function handleSave() {
    setBusy(true);
    try {
      await onSave(rows.map((row) => ({ id: row.id, incidentGroups: selection[row.id] ?? [] })));
      setStatus({
        kind: "saved",
        text: "Привязка сохранена в мок-слое; действие записано в журнал аудита.",
      });
    } catch (cause) {
      setStatus({
        kind: "error",
        text: cause instanceof Error ? cause.message : "Не удалось сохранить привязку",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title="Профильные категории обучающихся"
      headerTone="dark"
      actions={
        <Button variant="primary" size="sm" onClick={handleSave} disabled={isBusy}>
          {isBusy ? "Сохраняем…" : "Сохранить привязку"}
        </Button>
      }
    >
      {status ? (
        <p
          className={styles.profile__saved}
          role={status.kind === "error" ? "alert" : "status"}
          data-tone={status.kind}
        >
          {status.text}
        </p>
      ) : null}
      <div className={styles.profile__wrap}>
        <table className={styles.profile}>
          <thead>
            <tr>
              <th scope="col">Служба / группа курсантов</th>
              <th scope="col">Профильные группы происшествий ЕКП</th>
              <th scope="col">Службы-получатели</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className={styles.profile__empty}>
                  Профильных категорий нет
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id} data-profile-id={row.id}>
                <th scope="row" className={styles.profile__name}>
                  {row.profile}
                  <span className={styles.profile__meta}>
                    {row.groupName ? `гр. ${row.groupName} · ` : ""}курсантов: {row.studentCount}
                  </span>
                </th>
                <td>
                  <div className={styles.profile__chips}>
                    {(selection[row.id] ?? []).map((group) => (
                      <Chip
                        key={group}
                        selected
                        className={styles.profile__chip}
                        onClick={() => toggleGroup(row.id, group)}
                        title="Снять группу"
                      >
                        {group}
                      </Chip>
                    ))}
                    <select
                      className={styles.profile__add}
                      aria-label={`Добавить группу ЕКП: ${row.profile}`}
                      value=""
                      onChange={(event) => toggleGroup(row.id, event.target.value)}
                    >
                      <option value="">+ добавить группу</option>
                      {incidentGroups
                        .filter((group) => !(selection[row.id] ?? []).includes(group))
                        .map((group) => (
                          <option key={group} value={group}>
                            {group}
                          </option>
                        ))}
                    </select>
                  </div>
                </td>
                <td className={styles.profile__services}>{row.serviceNames.join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
