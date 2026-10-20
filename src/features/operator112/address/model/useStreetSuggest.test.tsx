import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Street } from "@/shared/api";

import { SUGGEST_DEBOUNCE_MS, useStreetSuggest } from "./useStreetSuggest";
import type { StreetSearch } from "./useStreetSuggest";

const GRINA: Street = { id: 7, name: "улица Грина", type: "улица" };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useStreetSuggest", () => {
  it("смена ссылки на функцию поиска при том же запросе не перезапускает запрос (регрессия production-сборки)", async () => {
    // Минификатор production-сборки встраивал значение по умолчанию в параметр, и search менялся на каждом рендере хука:
    // эффект перезапускался после setState({ status: "loading" }), запрос отменялся и уходил снова — бесконечно.
    const first = vi.fn<StreetSearch>().mockResolvedValue([GRINA]);
    const second = vi.fn<StreetSearch>().mockResolvedValue([GRINA]);
    function Probe({ search }: { search: StreetSearch }) {
      return <p data-testid="state">{useStreetSuggest("Грин", true, search).status}</p>;
    }
    const { rerender } = render(<Probe search={first} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS + 10);
    });
    expect(first).toHaveBeenCalledTimes(1);
    rerender(<Probe search={second} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUGGEST_DEBOUNCE_MS * 4);
    });
    expect(second).not.toHaveBeenCalled();
    expect(first).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("state")).toHaveTextContent("ready");
  });

  it("выключенный поиск и короткий запрос не обращаются к серверу", async () => {
    const inner = vi.fn<StreetSearch>().mockResolvedValue([]);
    function Probe({ query, enabled }: { query: string; enabled: boolean }) {
      return <p data-testid="state">{useStreetSuggest(query, enabled, inner).status}</p>;
    }
    const { rerender } = render(<Probe query="Гр" enabled />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    rerender(<Probe query="Грин" enabled={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(inner).not.toHaveBeenCalled();
    expect(screen.getByTestId("state")).toHaveTextContent("idle");
  });
});
