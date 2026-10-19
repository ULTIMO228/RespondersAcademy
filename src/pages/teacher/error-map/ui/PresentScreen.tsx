"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { ApiError, ServerRequiredError } from "@/shared/api";
import type { ErrorMapResponse } from "@/shared/api";
import { EmptyState, LinkButton, ResourceView, Skeleton, useResource } from "@/shared/ui/platform";
import {
  parseErrorMapQuery,
  parseStep,
  PresentHeadlineSlide,
  PresentMode,
  PresentStageSlide,
  presentStageIds,
  presentTotal,
  STEP_PARAM,
} from "@/widgets/error-map";
import type { ErrorMapFilters } from "@/widgets/error-map";

import { errorMapApi } from "../api/errorMapApi";
import type { ErrorMapApi } from "../api/errorMapApi";
import { groupMapHref, journalHref, presentHref, VIEW_PARAM } from "../lib/links";
import type { PresentView } from "../lib/links";

type PresentScreenProps = {
  /** Группа из адреса `/teacher/error-map/[groupId]/present`. */
  groupId: string;
  api?: ErrorMapApi;
};

const FORBIDDEN_MESSAGE = "Нет доступа к карте этой группы: она не закреплена за вами";
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
 * `/teacher/error-map/[groupId]/present` — режим «Показать на экране»: шаг 1 — вывод и лента этапов, далее по
 * одному шагу на каждый проблемный этап с разбором. Query: `period`, `mode`, `step` (с 1) и `view=journal`, если
 * показ открыт из журнала: «Выйти из показа» вернёт на тот экран с теми же фильтрами.
 */
export function PresentScreen(props: PresentScreenProps) {
  return (
    <Suspense fallback={<Skeleton />}>
      <PresentContent {...props} />
    </Suspense>
  );
}

function PresentContent({ groupId, api = errorMapApi }: PresentScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsed = parseErrorMapQuery(searchParams ?? new URLSearchParams());
  const filters: ErrorMapFilters = { ...parsed, groupId };
  const view: PresentView = searchParams?.get(VIEW_PARAM) === "journal" ? "journal" : "map";
  const { mode, period } = filters;

  const map = useResource(
    (signal) => api.map(groupId, { mode, period }, signal).catch((error) => Promise.reject(explain(error))),
    [api, groupId, mode, period],
  );
  const exitHref = view === "journal" ? journalHref(filters) : groupMapHref(filters);

  return (
    <ResourceView state={map.state} onRetry={map.reload} errorTitle="Не удалось загрузить карту для показа">
      {(data: ErrorMapResponse) =>
        data.attempts === 0 ? (
          <EmptyState
            title="Пока нет данных за этот период"
            text="Выберите другой период или режим на карте и откройте показ снова."
            action={<LinkButton href={exitHref}>Выйти из показа</LinkButton>}
          />
        ) : (
          <PresentBody
            api={api}
            data={data}
            filters={filters}
            step={parseStep(searchParams?.get(STEP_PARAM), presentTotal(data.headline))}
            onStep={(next) => router.replace(presentHref(filters, { step: next, view }))}
            onExit={() => router.push(exitHref)}
          />
        )
      }
    </ResourceView>
  );
}

type PresentBodyProps = {
  api: ErrorMapApi;
  data: ErrorMapResponse;
  filters: ErrorMapFilters;
  step: number;
  onStep: (next: number) => void;
  onExit: () => void;
};

function PresentBody({ api, data, filters, step, onStep, onExit }: PresentBodyProps) {
  const { groupId, mode, period } = filters;
  const stageId = step > 1 ? (presentStageIds(data.headline)[step - 2] ?? null) : null;
  const detail = useResource(
    (signal) => (stageId ? api.stage(groupId, stageId, { mode, period }, signal) : Promise.resolve(null)),
    [api, groupId, stageId, mode, period],
  );
  return (
    <PresentMode step={step} total={presentTotal(data.headline)} onStep={onStep} onExit={onExit}>
      {stageId === null ? (
        <PresentHeadlineSlide headline={data.headline} stages={data.stages} levels={data.levels} />
      ) : (
        <ResourceView state={detail.state} onRetry={detail.reload}>
          {(stageDetail) => (stageDetail ? <PresentStageSlide detail={stageDetail} /> : null)}
        </ResourceView>
      )}
    </PresentMode>
  );
}
