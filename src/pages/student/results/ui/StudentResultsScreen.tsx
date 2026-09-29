"use client";

import Link from "next/link";
import { useState } from "react";

import type { AssignmentFormat, HistoryItem, LobbyMode } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { formatDate } from "@/shared/lib";
import {
  Card,
  DataTable,
  EmptyState,
  LinkButton,
  PageHeader,
  Pagination,
  ResourceView,
  SelectField,
  Tag,
  useResource,
} from "@/shared/ui/platform";
import type { DataColumn } from "@/shared/ui/platform";

import { studentResultsApi } from "../api/resultsApi";
import type { StudentResultsApi } from "../api/resultsApi";
import styles from "./StudentResults.module.css";

const PER_PAGE = 10;
const MODE_TITLES: Record<LobbyMode, string> = { operator112: "Режим 112", dds: "Режим ДДС" };

const COLUMNS: DataColumn<HistoryItem>[] = [
  { key: "date", title: "Дата", render: (item) => formatDate(item.at) },
  { key: "title", title: "Задание", render: (item) => item.title },
  { key: "mode", title: "Режим", render: (item) => MODE_TITLES[item.mode] },
  { key: "format", title: "Формат", render: (item) => (item.format === "exam" ? "Экзамен" : "Тренировка") },
  { key: "score", title: "Балл", numeric: true, render: (item) => item.score },
  {
    key: "result",
    title: "Итог",
    render: (item) =>
      item.format === "exam" && typeof item.passed === "boolean" ? (
        <Tag tone={item.passed ? "success" : "danger"}>{item.passed ? "Сдан" : "Не сдан"}</Tag>
      ) : (
        <Tag>Без вердикта</Tag>
      ),
  },
  {
    key: "review",
    title: <span className="visually-hidden">Разбор</span>,
    render: (item) => (
      <Link href={ROUTES.studentResult(item.attemptId, item.mode)} aria-label={`Разбор: ${item.title}`}>
        Разбор
      </Link>
    ),
  },
];

type StudentResultsScreenProps = { api?: StudentResultsApi };

/** «Результаты» (T043): история попыток обучающегося с фильтрами режим/формат и постраничным просмотром. */
export function StudentResultsScreen({ api = studentResultsApi }: StudentResultsScreenProps) {
  const [mode, setMode] = useState<LobbyMode | "">("");
  const [format, setFormat] = useState<AssignmentFormat | "">("");
  const [page, setPage] = useState(1);
  const history = useResource(
    (signal) =>
      api.history({ mode: mode || undefined, format: format || undefined, page, perPage: PER_PAGE }, signal),
    [api, mode, format, page],
  );
  const filtered = mode !== "" || format !== "";

  return (
    <>
      <PageHeader title="Результаты" description="История ваших попыток с разбором" />
      <div className={styles.filters}>
        <SelectField
          label="Режим"
          value={mode}
          onChange={(event) => {
            setMode(event.target.value as LobbyMode | "");
            setPage(1);
          }}
        >
          <option value="">Все режимы</option>
          <option value="operator112">Режим 112</option>
          <option value="dds">Режим ДДС</option>
        </SelectField>
        <SelectField
          label="Формат"
          value={format}
          onChange={(event) => {
            setFormat(event.target.value as AssignmentFormat | "");
            setPage(1);
          }}
        >
          <option value="">Все форматы</option>
          <option value="training">Тренировка</option>
          <option value="exam">Экзамен</option>
        </SelectField>
      </div>
      <Card>
        <ResourceView
          state={history.state}
          onRetry={history.reload}
          errorTitle="Не удалось загрузить результаты"
          skeletonLines={5}
        >
          {(data) =>
            data.items.length === 0 ? (
              <EmptyState
                title={filtered ? "По выбранным фильтрам ничего нет" : "Пока нет результатов"}
                text={
                  filtered
                    ? "Снимите фильтры или выберите другой режим."
                    : "Пройдите первое задание — здесь появятся баллы и разбор."
                }
                action={
                  filtered ? undefined : (
                    <LinkButton href={ROUTES.studentAssignments} variant="primary">
                      К заданиям
                    </LinkButton>
                  )
                }
              />
            ) : (
              <>
                <DataTable
                  caption="История попыток"
                  columns={COLUMNS}
                  rows={data.items}
                  getRowKey={(item) => item.attemptId}
                />
                <Pagination page={data.page} perPage={data.perPage} total={data.total} onChange={setPage} />
              </>
            )
          }
        </ResourceView>
      </Card>
    </>
  );
}
