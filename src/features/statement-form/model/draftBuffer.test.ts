import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryStorage } from "@/shared/lib";

import { DRAFT_DEBOUNCE_MS } from "../config/constants";
import { draftStorageKey, parseDraft, serializeDraft } from "./draftBuffer";
import { useStatementDraft } from "./useStatementDraft";

describe("буфер черновика (T2.3-09)", () => {
  it("ключ привязан к курсанту и карточке; сериализация обратима; мусор не восстанавливается", () => {
    expect(draftStorageKey("c-063", "u-005")).toBe("arm112:draft:u-005:c-063");
    const draft = { fields: { dispatcherAction: "Сообщение принято" }, savedAt: 1 };
    expect(parseDraft(serializeDraft(draft))).toEqual(draft);
    expect(parseDraft("{битый json")).toBeNull();
    expect(parseDraft(JSON.stringify({ version: 99, fields: {} }))).toBeNull();
    expect(parseDraft(JSON.stringify({ version: 1, fields: { a: 1 } }))).toBeNull();
  });
});

describe("useStatementDraft", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("автосохранение по паузе ввода и восстановление после «перезагрузки»", () => {
    const storage = createMemoryStorage();
    const onCommit = vi.fn();
    const key = draftStorageKey("c-094", "u-005");
    const first = renderHook(() => useStatementDraft({ storage, storageKey: key, onCommit }));
    act(() => first.result.current.setField("dispatcherAction", "Бригада направлена"));
    expect(first.result.current.saveState).toBe("pending");
    expect(storage.get(key)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    });
    expect(first.result.current.saveState).toBe("saved");
    expect(onCommit).toHaveBeenCalledWith({ dispatcherAction: "Бригада направлена" });
    first.unmount();
    const second = renderHook(() =>
      useStatementDraft({
        storage,
        storageKey: key,
        initialFields: { dispatcherAction: "", outfitNumber: "" },
      }),
    );
    expect(second.result.current.fields).toEqual({
      dispatcherAction: "Бригада направлена",
      outfitNumber: "",
    });
  });

  it("unmount досылает несохранённый ввод в буфер", () => {
    const storage = createMemoryStorage();
    const view = renderHook(() => useStatementDraft({ storage, storageKey: "k" }));
    act(() => view.result.current.setField("dispatcherAction", "Текст"));
    view.unmount();
    expect(parseDraft(storage.get("k"))?.fields).toEqual({ dispatcherAction: "Текст" });
  });
});
