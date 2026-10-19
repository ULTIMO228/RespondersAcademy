"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { ApiError, errorMapPdfUrl, ServerRequiredError } from "@/shared/api";
import type { ErrorMapGroup, ErrorMapJournalResponse } from "@/shared/api";
import { EmptyState, PageHeader, ResourceView, Skeleton, useResource } from "@/shared/ui/platform";
import {
  ErrorMapActions,
  ErrorMapToolbar,
  Filters,
  Journal,
  parseErrorMapQuery,
  ViewSwitch,
} from "@/widgets/error-map";
import type { ErrorMapFilters } from "@/widgets/error-map";

import { journalApi } from "../api/errorMapApi";
import type { JournalApi } from "../api/errorMapApi";
import { groupMapHref, journalHref, presentHref, studentMapHref } from "../lib/links";

type JournalScreenProps = {
  /** Группа из адреса `/teacher/error-map/[groupId]/journal`. */
  groupId: string;
  api?: JournalApi;
};

const FORBIDDEN_MESSAGE = "Нет доступа к журналу этой группы: она не закреплена за вами";
const NOT_FOUND_MESSAGE = "Группа не найдена";

/** Статусы 403 и 404 получают понятный текст страницы; остальные ошибки идут как есть. */
function explain(error: unknown): unknown {
  if (error instanceof ServerRequiredError) return error;
  if (error instanceof ApiError && error.status === 403)
    return new ApiError(403, "forbidden", FORBIDDEN_MESSAGE);
  if (error instanceof ApiError && error.status === 404)
    return new ApiError(404, "notFound", NOT_FOUND_MESSAGE);
  return error;
}

/**
 * `/teacher/error-map/[groupId]/journal` — журнал группы: строки — обучающиеся, столбцы — этапы схемы, в ячейке
 * уровень (значок + слово). Клик по ячейке открывает разбор этапа для обучающегося. Фильтры period и mode живут
 * в query, группа — в пути; переключатель «Карта / Журнал» сохраняет все три.
 */
export function JournalScreen(props: JournalScreenProps) {
  return (
    <Suspense fallback={<Skeleton />}>
      <JournalContent {...props} />
    </Suspense>
  );
}

function JournalContent({ groupId, api = journalApi }: JournalScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsed = parseErrorMapQuery(searchParams ?? new URLSearchParams());
  const filters: ErrorMapFilters = { ...parsed, groupId };
  const { mode, period } = filters;

  const groups = useResource<ErrorMapGroup[]>((signal) => api.groups(signal), [api]);
  const journal = useResource(
    (signal) =>
      api.journal(groupId, { mode, period }, signal).catch((error) => Promise.reject(explain(error))),
    [api, groupId, mode, period],
  );

  return (
    <section aria-labelledby="teacher-error-map-journal-title">
      <PageHeader
        title="Журнал группы"
        description="Кто на каком этапе приёма вызова ошибается: обучающиеся и этапы в одной таблице"
      />
      <ErrorMapToolbar>
        <ViewSwitch active="journal" mapHref={groupMapHref(filters)} journalHref={journalHref(filters)} />
        <ErrorMapActions
          presentHref={presentHref(filters, { view: "journal" })}
          pdfHref={errorMapPdfUrl({ scope: "journal", groupId, mode, period })}
        />
      </ErrorMapToolbar>
      <ResourceView state={groups.state} onRetry={groups.reload}>
        {(list: ErrorMapGroup[]) =>
          list.length === 0 ? (
            <EmptyState
              title="Нет закреплённых групп"
              text="Журнал строится по группам, закреплённым за преподавателем. Обратитесь к администратору, чтобы вам назначили группу."
            />
          ) : (
            <Filters groups={list} value={filters} onChange={(next) => router.replace(journalHref(next))} />
          )
        }
      </ResourceView>
      <ResourceView state={journal.state} onRetry={journal.reload} errorTitle="Не удалось загрузить журнал">
        {(data: ErrorMapJournalResponse) => {
          const groupList = groups.state.status === "ready" ? groups.state.data : [];
          const title = groupList.find((item) => item.groupId === data.groupId)?.title ?? data.groupId;
          return data.rows.every((row) => row.attempts === 0) ? (
            <EmptyState title="Пока нет данных за этот период" text="Выберите другой период или режим." />
          ) : (
            <Journal
              stages={data.stages}
              rows={data.rows}
              caption={`Журнал группы ${title}`}
              cellHref={(studentId, stageId) => studentMapHref(studentId, filters, stageId)}
            />
          );
        }}
      </ResourceView>
    </section>
  );
}
