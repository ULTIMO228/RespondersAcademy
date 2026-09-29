"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import type { DependencyList, ReactNode } from "react";

import { ServerRequiredError } from "@/shared/api";

import { ErrorState, ServerRequiredState, Skeleton } from "./states";

export type ResourceState<TData> =
  | { status: "loading" }
  | { status: "serverRequired" }
  | { status: "error"; message: string }
  | { status: "ready"; data: TData };

const FALLBACK_MESSAGE = "Сервер ответил ошибкой. Повторите попытку";

/**
 * Загрузка блока страницы: loading → ready | error | serverRequired. Ошибка одного блока не роняет страницу
 * (FR-069): каждый блок держит своё состояние. Запрос отменяется при смене `deps` и размонтировании.
 */
export function useResource<TData>(load: (signal: AbortSignal) => Promise<TData>, deps: DependencyList = []) {
  const [state, setState] = useState<ResourceState<TData>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const run = useEffectEvent(load);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    run(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ServerRequiredError) setState({ status: "serverRequired" });
        else
          setState({
            status: "error",
            message: error instanceof Error && error.message ? error.message : FALLBACK_MESSAGE,
          });
      },
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps передаёт вызывающий: они определяют, когда блок перезапрашивается
  }, [attempt, ...deps]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  return { state, reload };
}

type ResourceViewProps<TData> = {
  state: ResourceState<TData>;
  onRetry?: () => void;
  errorTitle?: string;
  skeletonLines?: number;
  children: (data: TData) => ReactNode;
};

/** Единое отображение состояния блока: скелетон, ошибка с «Повторить», «нужен сервер» или содержимое. */
export function ResourceView<TData>({
  state,
  onRetry,
  errorTitle,
  skeletonLines,
  children,
}: ResourceViewProps<TData>) {
  switch (state.status) {
    case "loading":
      return <Skeleton lines={skeletonLines} />;
    case "serverRequired":
      return <ServerRequiredState onRetry={onRetry} />;
    case "error":
      return <ErrorState title={errorTitle} message={state.message} onRetry={onRetry} />;
    case "ready":
      return <>{children(state.data)}</>;
  }
}
