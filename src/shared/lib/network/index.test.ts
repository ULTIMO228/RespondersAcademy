import { describe, expect, it, vi } from "vitest";

import { createConnectivity } from "./index";
import type { ConnectivityListener, ConnectivitySource } from "./index";

function createFakeSource(initial = true) {
  let online = initial;
  const listeners = new Set<ConnectivityListener>();
  const source: ConnectivitySource = {
    isOnline: () => online,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const emit = (next: boolean) => {
    online = next;
    listeners.forEach((listener) => listener());
  };
  return { source, emit, listeners };
}

describe("createConnectivity", () => {
  it("сетевой сбой клиента → offline, успешный запрос → online; подписчики уведомляются", () => {
    const { source } = createFakeSource();
    const connectivity = createConnectivity(source);
    const listener = vi.fn();
    connectivity.subscribe(listener);
    expect(connectivity.isOnline()).toBe(true);
    connectivity.markOffline();
    expect(connectivity.isOnline()).toBe(false);
    connectivity.markOffline();
    expect(listener).toHaveBeenCalledTimes(1);
    connectivity.markOnline();
    expect(connectivity.isOnline()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("события браузера offline/online меняют состояние; отписка снимает слушатель источника", () => {
    const { source, emit, listeners } = createFakeSource();
    const connectivity = createConnectivity(source);
    const unsubscribe = connectivity.subscribe(vi.fn());
    emit(false);
    expect(connectivity.isOnline()).toBe(false);
    connectivity.markOffline();
    emit(true);
    expect(connectivity.isOnline()).toBe(true);
    unsubscribe();
    expect(listeners.size).toBe(0);
  });
});
