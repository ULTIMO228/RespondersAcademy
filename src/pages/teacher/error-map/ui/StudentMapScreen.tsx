"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { ApiError, errorMapPdfUrl, errorMapXlsxUrl, ServerRequiredError } from "@/shared/api";
import type { ErrorMapGroup, ErrorMapResponse } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import {
  EmptyState,
  LinkButton,
  PageHeader,
  ResourceView,
  Skeleton,
  useResource,
} from "@/shared/ui/platform";
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
} from "@/widgets/error-map";
import type { ErrorMapFilters } from "@/widgets/error-map";

import { studentMapApi } from "../api/errorMapApi";
import type { StudentMapApi } from "../api/errorMapApi";
import { FROM_PARAM, groupMapHref, STAGE_PARAM } from "../lib/links";

import styles from "./ErrorMapPage.module.css";

type StudentMapScreenProps = {
  /** Обучающийся из адреса `/teacher/error-map/students/[studentId]`. */
  studentId: string;
  api?: StudentMapApi;
};

const FORBIDDEN_MESSAGE = "Нет доступа к карте этого обучающегося: он не учится ни в одной из ваших групп";
const NOT_FOUND_MESSAGE = "Обучающийся не найден";

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
 * `/teacher/error-map/students/[studentId]` — карта обучающегося со сравнением с группой. Query: `group`, `period`,
 * `mode` (как на карте группы), `stage` — выбранный этап обучающегося, `from` — этап карты группы, на который
 * вернёт «К карте группы».
 */
export function StudentMapScreen(props: StudentMapScreenProps) {
  return (
    <Suspense fallback={<Skeleton />}>
      <StudentMapContent {...props} />
    </Suspense>
  );
}

function StudentMapContent({ studentId, api = studentMapApi }: StudentMapScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = parseErrorMapQuery(searchParams ?? new URLSearchParams());
  const selectedStageId = searchParams?.get(STAGE_PARAM) ?? null;
  const fromStageId = searchParams?.get(FROM_PARAM) ?? null;
  const { mode, period } = filters;

  const map = useResource(
    (signal) =>
      api.student(studentId, { mode, period }, signal).catch((error) => Promise.reject(explain(error))),
    [api, studentId, mode, period],
  );
  // Имя группы — украшение страницы: если список групп не загрузился, остаётся общая подпись.
  const groups = useResource<ErrorMapGroup[]>((signal) => api.groups(signal).catch(() => []), [api]);

  const navigate = (next: ErrorMapFilters, stageId: string | null, from: string | null) => {
    const query = new URLSearchParams(serializeErrorMapQuery(next));
    if (stageId) query.set(STAGE_PARAM, stageId);
    if (from) query.set(FROM_PARAM, from);
    router.replace(`${ROUTES.teacherErrorMapStudent(studentId)}?${query}`);
  };
  const groupList = groups.state.status === "ready" ? groups.state.data : [];

  return (
    <section className={styles.page} aria-labelledby="teacher-error-map-student-title">
      <PageHeader
        title="Карта ошибок обучающегося"
        description="Где в работе обучающийся теряет баллы в сравнении с группой"
        actions={<LinkButton href={groupMapHref(filters, fromStageId)}>← К карте группы</LinkButton>}
      />
      <ErrorMapToolbar>
        <span />
        <ErrorMapActions
          pdfHref={errorMapPdfUrl({ scope: "student", studentId, mode, period })}
          xlsxHref={errorMapXlsxUrl({ scope: "student", studentId, mode, period })}
        />
      </ErrorMapToolbar>
      <ResourceView
        state={map.state}
        onRetry={map.reload}
        errorTitle="Не удалось загрузить карту обучающегося"
      >
        {(data: ErrorMapResponse) => {
          const groupId = filters.groupId || data.scope.groupId;
          const groupTitle = groupList.find((item) => item.groupId === groupId)?.title;
          const withGroup = { ...filters, groupId };
          return (
            <>
              <p>
                Обучающийся: <strong>{data.scope.title}</strong>
                {groupTitle ? <> · Группа: {groupTitle}</> : null}
              </p>
              <Filters
                groups={[]}
                showGroup={false}
                value={withGroup}
                onChange={(next) => {
                  const sameMode = next.mode === mode;
                  navigate(next, sameMode ? selectedStageId : null, sameMode ? fromStageId : null);
                }}
              />
              {data.attempts === 0 ? (
                <EmptyState title="Пока нет данных за этот период" text="Выберите другой период или режим." />
              ) : (
                <StudentMapBody
                  api={api}
                  studentId={studentId}
                  data={data}
                  filters={withGroup}
                  selectedStageId={selectedStageId}
                  onClose={() => navigate(withGroup, null, fromStageId)}
                  onSelectStage={(stageId) => navigate(withGroup, stageId, fromStageId)}
                />
              )}
            </>
          );
        }}
      </ResourceView>
    </section>
  );
}

type StudentMapBodyProps = {
  api: StudentMapApi;
  studentId: string;
  data: ErrorMapResponse;
  filters: ErrorMapFilters;
  selectedStageId: string | null;
  onClose: () => void;
  onSelectStage: (stageId: string) => void;
};

/** Вывод, лента этапов со сравнением и разбор выбранного этапа обучающегося. */
function StudentMapBody({
  api,
  studentId,
  data,
  filters,
  selectedStageId,
  onClose,
  onSelectStage,
}: StudentMapBodyProps) {
  const { mode, period } = filters;
  // Этап вне схемы карты (устаревший адрес, чужой режим) не запрашиваем: сервер ответил бы 404.
  const stageId =
    selectedStageId && data.stages.some((item) => item.id === selectedStageId) ? selectedStageId : null;
  const detail = useResource(
    (signal) =>
      stageId
        ? api
            .studentStage(studentId, stageId, { mode, period }, signal)
            .catch((error) => Promise.reject(explain(error)))
        : Promise.resolve(null),
    [api, studentId, stageId, mode, period],
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
                  explainTarget={{ groupId: filters.groupId, studentId, mode, period, stageId }}
                  assignAction={
                    <AssignButton stageTitle={stageDetail.stage.title} mode={mode} studentIds={[studentId]} />
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
