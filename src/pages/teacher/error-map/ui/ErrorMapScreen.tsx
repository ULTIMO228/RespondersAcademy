"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { errorMapPdfUrl } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { EmptyState, PageHeader, ResourceView, Skeleton, useResource } from "@/shared/ui/platform";
import type { ErrorMapGroup, ErrorMapResponse } from "@/shared/api";
import { AssignButton } from "@/features/error-map-assign";
import {
  ErrorMapActions,
  ErrorMapToolbar,
  Filters,
  Headline,
  parseErrorMapQuery,
  serializeErrorMapQuery,
  StageDetail,
  StageStrip,
  ViewSwitch,
} from "@/widgets/error-map";
import type { ErrorMapFilters } from "@/widgets/error-map";

import { errorMapApi } from "../api/errorMapApi";
import type { ErrorMapApi } from "../api/errorMapApi";
import { groupMapHref, journalHref, presentHref, studentMapHref, STAGE_PARAM } from "../lib/links";

type ErrorMapScreenProps = {
  /** Группа из адреса `/teacher/error-map/[groupId]`; без неё берётся `?group=` или первая доступная. */
  groupId?: string;
  api?: ErrorMapApi;
};

/** `/teacher/error-map` — карта ошибок группы: вывод сверху, под ним лента этапов. Фильтры и выбранный этап живут в query. */
export function ErrorMapScreen(props: ErrorMapScreenProps) {
  return (
    <Suspense fallback={<Skeleton />}>
      <ErrorMapContent {...props} />
    </Suspense>
  );
}

function ErrorMapContent({ groupId: routeGroupId, api = errorMapApi }: ErrorMapScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsed = parseErrorMapQuery(searchParams ?? new URLSearchParams());
  const filters: ErrorMapFilters = { ...parsed, groupId: parsed.groupId || routeGroupId || "" };
  const selectedStageId = searchParams?.get(STAGE_PARAM) ?? null;
  const groups = useResource((signal) => api.groups(signal), [api]);

  const navigate = (next: ErrorMapFilters, stageId?: string | null) => {
    const query = new URLSearchParams(serializeErrorMapQuery(next));
    if (stageId) query.set(STAGE_PARAM, stageId);
    router.replace(`${ROUTES.teacherErrorMap}?${query}`);
  };

  return (
    <section aria-labelledby="teacher-error-map-title">
      <PageHeader
        title="Карта ошибок"
        description="Где в работе оператора группа теряет баллы: этапы от приёма вызова до завершения"
      />
      <ResourceView state={groups.state} onRetry={groups.reload}>
        {(list: ErrorMapGroup[]) =>
          list.length === 0 ? (
            <EmptyState
              title="Нет закреплённых групп"
              text="Карта строится по группам, закреплённым за преподавателем. Обратитесь к администратору, чтобы вам назначили группу."
            />
          ) : (
            <GroupMap
              api={api}
              groups={list}
              filters={{ ...filters, groupId: filters.groupId || list[0].groupId }}
              selectedStageId={selectedStageId}
              onFilters={(next, keepStage) => navigate(next, keepStage ? selectedStageId : null)}
              onClose={() => navigate({ ...filters, groupId: filters.groupId || list[0].groupId })}
              onSelectStage={(stageId) =>
                navigate({ ...filters, groupId: filters.groupId || list[0].groupId }, stageId)
              }
            />
          )
        }
      </ResourceView>
    </section>
  );
}

type GroupMapProps = {
  api: ErrorMapApi;
  groups: ErrorMapGroup[];
  filters: ErrorMapFilters;
  selectedStageId: string | null;
  /** Смена фильтров: выбранный этап сохраняется, только пока режим прежний (у режимов разные схемы этапов). */
  onFilters: (next: ErrorMapFilters, keepStage: boolean) => void;
  onClose: () => void;
  onSelectStage: (stageId: string) => void;
};

function GroupMap({
  api,
  groups,
  filters,
  selectedStageId,
  onFilters,
  onClose,
  onSelectStage,
}: GroupMapProps) {
  const { groupId, mode, period } = filters;
  const map = useResource(
    (signal) => api.map(groupId, { mode, period }, signal),
    [api, groupId, mode, period],
  );
  return (
    <>
      <ErrorMapToolbar>
        <ViewSwitch active="map" mapHref={groupMapHref(filters)} journalHref={journalHref(filters)} />
        <ErrorMapActions
          presentHref={presentHref(filters)}
          pdfHref={errorMapPdfUrl({ scope: "group", groupId, mode, period })}
        />
      </ErrorMapToolbar>
      <Filters groups={groups} value={filters} onChange={(next) => onFilters(next, next.mode === mode)} />
      <ResourceView state={map.state} onRetry={map.reload}>
        {(data) =>
          data.attempts === 0 ? (
            <EmptyState title="Пока нет данных за этот период" text="Выберите другой период или режим." />
          ) : (
            <MapBody
              api={api}
              data={data}
              filters={filters}
              selectedStageId={selectedStageId}
              onClose={onClose}
              onSelectStage={onSelectStage}
            />
          )
        }
      </ResourceView>
    </>
  );
}

type MapBodyProps = {
  api: ErrorMapApi;
  data: ErrorMapResponse;
  filters: ErrorMapFilters;
  selectedStageId: string | null;
  onClose: () => void;
  onSelectStage: (stageId: string) => void;
};

/** Вывод, лента этапов и под ней разбор выбранного этапа (FR-008…FR-010). */
function MapBody({ api, data, filters, selectedStageId, onClose, onSelectStage }: MapBodyProps) {
  const { groupId, mode, period } = filters;
  // Этап вне схемы текущей карты (устаревший адрес, чужой режим) не запрашиваем: сервер ответил бы 404.
  const stageId =
    selectedStageId && data.stages.some((item) => item.id === selectedStageId) ? selectedStageId : null;
  const detail = useResource(
    (signal) => (stageId ? api.stage(groupId, stageId, { mode, period }, signal) : Promise.resolve(null)),
    [api, groupId, stageId, mode, period],
  );
  const linked =
    stageId && detail.state.status === "ready" && detail.state.data
      ? [...new Set(detail.state.data.chain.map((link) => link.to))]
      : [];
  return (
    <>
      <Headline headline={data.headline} />
      <StageStrip
        stages={data.stages}
        levels={data.levels}
        selectedStageId={stageId}
        highlightedStageIds={linked}
        onSelect={onSelectStage}
      />
      {stageId ? (
        <div aria-live="polite">
          <ResourceView state={detail.state} onRetry={detail.reload}>
            {(stageDetail) =>
              stageDetail ? (
                <StageDetail
                  detail={stageDetail}
                  stages={data.stages}
                  onClose={onClose}
                  onSelectStage={onSelectStage}
                  studentHref={(studentId) => studentMapHref(studentId, filters, stageId)}
                  explainTarget={{ groupId, mode, period, stageId }}
                  assignAction={
                    <AssignButton
                      stageTitle={stageDetail.stage.title}
                      mode={mode}
                      studentIds={[
                        ...new Set(
                          stageDetail.typicalErrors.flatMap((error) => error.students.map((item) => item.id)),
                        ),
                      ]}
                    />
                  }
                />
              ) : null
            }
          </ResourceView>
        </div>
      ) : null}
    </>
  );
}
