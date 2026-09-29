import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError, ServerRequiredError } from "@/shared/api";

import {
  Alert,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  NormChart,
  PageHeader,
  Pagination,
  PlatformButton,
  ProgressBar,
  ResourceView,
  SegmentedControl,
  ServerRequiredState,
  Skeleton,
  StatGroup,
  StatTile,
  Stepper,
  TabNav,
  Tag,
  useResource,
} from "./index";

describe("PageHeader, Card, StatTile", () => {
  it("заголовок h1, пояснение и действия", () => {
    render(
      <PageHeader
        title="Задания"
        description="Назначено преподавателем"
        actions={<button type="button">Обновить</button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Задания" })).toBeInTheDocument();
    expect(screen.getByText("Назначено преподавателем")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Обновить" })).toBeInTheDocument();
  });

  it("карточка с заголовком — регион с именем; действия в шапке", () => {
    render(
      <Card title="Мои показатели" actions={<a href="/student/analytics">Вся аналитика</a>}>
        содержимое
      </Card>,
    );
    const region = screen.getByRole("region", { name: "Мои показатели" });
    expect(within(region).getByRole("heading", { level: 2 })).toHaveTextContent("Мои показатели");
    expect(within(region).getByRole("link", { name: "Вся аналитика" })).toBeInTheDocument();
  });

  it("показатель: подпись, значение и заметка о нормативе в одном списке определений", () => {
    render(
      <StatGroup>
        <StatTile label="Реакция" value="24 с" note="норматив 30 с" tone="good" />
        <StatTile label="Отработка" value="3:20" note="выше норматива 3 мин" tone="bad" />
      </StatGroup>,
    );
    expect(screen.getByText("Реакция")).toBeInTheDocument();
    expect(screen.getByText("выше норматива 3 мин")).toBeInTheDocument();
  });
});

describe("Alert, Tag, ProgressBar", () => {
  it("Alert — status по умолчанию, alert по запросу", () => {
    const { rerender } = render(<Alert>Сохранено</Alert>);
    expect(screen.getByRole("status")).toHaveTextContent("Сохранено");
    rerender(
      <Alert tone="danger" role="alert">
        Ошибка
      </Alert>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Ошибка");
  });

  it("Tag несёт смысл текстом, а не только цветом", () => {
    render(<Tag tone="danger">Не сдан</Tag>);
    expect(screen.getByText("Не сдан")).toBeInTheDocument();
  });

  it("ProgressBar ограничивает значение 0–100 и подписан", () => {
    render(<ProgressBar value={140} label="Выполнено 2 из 5" />);
    const bar = screen.getByRole("progressbar", { name: "Выполнено 2 из 5" });
    expect(bar).toHaveAttribute("aria-valuenow", "100");
  });
});

describe("Field", () => {
  it("подпись связана с полем, ошибка объявляется и привязана через aria-describedby", () => {
    render(
      <Field
        label="Текущий пароль"
        type="password"
        error="Текущий пароль указан неверно"
        hint="Не менее 8 символов"
      />,
    );
    const input = screen.getByLabelText("Текущий пароль");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Текущий пароль указан неверно");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(" ").length).toBe(2);
  });

  it("без ошибки атрибутов ошибки нет", () => {
    render(<Field label="Логин" />);
    expect(screen.getByLabelText("Логин")).not.toHaveAttribute("aria-invalid");
  });
});

describe("PlatformButton", () => {
  it("по умолчанию type=button (не отправляет форму) и реагирует на клик", () => {
    const onClick = vi.fn();
    render(
      <PlatformButton variant="primary" onClick={onClick}>
        Войти
      </PlatformButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Войти" })).toHaveAttribute("type", "button");
  });
});

describe("состояния", () => {
  it("Skeleton — статус загрузки, занят", () => {
    render(<Skeleton />);
    expect(screen.getByRole("status", { name: "Загрузка…" })).toHaveAttribute("aria-busy", "true");
  });

  it("EmptyState объясняет и предлагает действие", () => {
    render(
      <EmptyState
        title="Пока нет результатов"
        text="Пройдите первое задание"
        action={<a href="/student/assignments">К заданиям</a>}
      />,
    );
    expect(screen.getByText("Пока нет результатов")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "К заданиям" })).toBeInTheDocument();
  });

  it("ErrorState — alert с «Повторить»", () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Сервер ответил ошибкой" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Сервер ответил ошибкой");
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("ServerRequiredState использует единую формулировку A16", () => {
    render(<ServerRequiredState />);
    expect(screen.getByText("Раздел требует подключения к серверу тренажёра")).toBeInTheDocument();
  });
});

describe("useResource + ResourceView", () => {
  it("loading → ready", async () => {
    const { result } = renderHook(() => useResource(async () => 42));
    expect(result.current.state.status).toBe("loading");
    await waitFor(() => expect(result.current.state).toEqual({ status: "ready", data: 42 }));
  });

  it("ServerRequiredError → serverRequired; прочая ошибка → error с сообщением; reload перезапрашивает", async () => {
    const load = vi
      .fn<(signal: AbortSignal) => Promise<string>>()
      .mockRejectedValueOnce(new ServerRequiredError())
      .mockRejectedValueOnce(new ApiError(500, "internal", "Ошибка сервера"))
      .mockResolvedValue("ok");
    const { result } = renderHook(() => useResource(load));
    await waitFor(() => expect(result.current.state.status).toBe("serverRequired"));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.state).toEqual({ status: "error", message: "Ошибка сервера" }));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.state).toEqual({ status: "ready", data: "ok" }));
  });

  it("смена deps перезапрашивает; устаревший ответ не затирает новый", async () => {
    let resolveFirst: (value: string) => void = () => undefined;
    const load = vi.fn((_signal: AbortSignal, key: string) =>
      key === "a" ? new Promise<string>((resolve) => (resolveFirst = resolve)) : Promise.resolve("b-data"),
    );
    const { result, rerender } = renderHook(({ key }) => useResource((signal) => load(signal, key), [key]), {
      initialProps: { key: "a" },
    });
    rerender({ key: "b" });
    await waitFor(() => expect(result.current.state).toEqual({ status: "ready", data: "b-data" }));
    await act(async () => resolveFirst("a-data"));
    expect(result.current.state).toEqual({ status: "ready", data: "b-data" });
  });

  it("ResourceView рисует нужное состояние", () => {
    const retry = vi.fn();
    const { rerender } = render(<ResourceView state={{ status: "loading" }}>{() => "данные"}</ResourceView>);
    expect(screen.getByRole("status")).toBeInTheDocument();
    rerender(
      <ResourceView state={{ status: "error", message: "сбой" }} onRetry={retry}>
        {() => "данные"}
      </ResourceView>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("сбой");
    rerender(
      <ResourceView state={{ status: "ready", data: 7 }}>{(value) => `данные ${value}`}</ResourceView>,
    );
    expect(screen.getByText("данные 7")).toBeInTheDocument();
  });
});

describe("DataTable, Pagination", () => {
  const rows = [
    { id: "a", title: "Пожар", score: 92 },
    { id: "b", title: "ДТП", score: 64 },
  ];

  it("таблица с подписью, числовой столбец и пустое состояние", () => {
    const columns = [
      { key: "title", title: "Задание", render: (row: (typeof rows)[number]) => row.title },
      { key: "score", title: "Балл", numeric: true, render: (row: (typeof rows)[number]) => row.score },
    ];
    const { rerender } = render(
      <DataTable caption="Результаты" columns={columns} rows={rows} getRowKey={(row) => row.id} />,
    );
    const table = screen.getByRole("table", { name: "Результаты" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByRole("columnheader", { name: "Балл" })).toBeInTheDocument();
    rerender(
      <DataTable
        caption="Результаты"
        columns={columns}
        rows={[]}
        getRowKey={(row) => row.id}
        emptyText="Пока нет попыток"
      />,
    );
    expect(screen.getByText("Пока нет попыток")).toBeInTheDocument();
  });

  it("пагинация: диапазон, текущая страница, блокировка краёв", () => {
    const onChange = vi.fn();
    render(<Pagination page={1} perPage={10} total={24} onChange={onChange} />);
    expect(screen.getByText("Записи 1–10 из 24")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Предыдущая страница" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "1" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(onChange).toHaveBeenCalledWith(3);
  });
});

describe("навигация страницы", () => {
  it("TabNav: клик и стрелки переключают вкладки, неактивные вне порядка Tab", () => {
    const onChange = vi.fn();
    render(
      <TabNav
        label="Разделы справочника"
        activeId="articles"
        onChange={onChange}
        items={[
          { id: "articles", title: "Статьи" },
          { id: "numbers", title: "Служебные номера" },
        ]}
      />,
    );
    expect(screen.getByRole("tab", { name: "Статьи" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Служебные номера" })).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Статьи" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("numbers");
  });

  it("SegmentedControl: выбранный вариант отмечен aria-pressed", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Режим"
        value="all"
        onChange={onChange}
        options={[
          { value: "all", label: "Все" },
          { value: "dds", label: "ДДС" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Все" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "ДДС" }));
    expect(onChange).toHaveBeenCalledWith("dds");
  });

  it("Stepper: текущий шаг — aria-current=step, пройденные отмечены", () => {
    render(<Stepper steps={["Обучающиеся", "Режим", "Билеты"]} current={1} />);
    expect(screen.getByText("Режим").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("✓")).toBeInTheDocument();
  });
});

describe("NormChart", () => {
  it("график с линией норматива и таблицей-дублёром с теми же значениями", () => {
    render(
      <NormChart
        title="Динамика баллов"
        labels={["1", "2", "3"]}
        values={[61, 66, 58]}
        seriesName="Балл"
        norm={{ value: 70, label: "порог 70" }}
        tableOpen
      />,
    );
    expect(screen.getByRole("img", { name: "Динамика баллов" })).toBeInTheDocument();
    expect(document.querySelector('[data-norm="70"]')).not.toBeNull();
    const table = screen.getByRole("table", { name: "Динамика баллов" });
    expect(within(table).getByText("61")).toBeInTheDocument();
    expect(within(table).getAllByText("70")).toHaveLength(3);
  });

  it("столбцы: по одному на значение", () => {
    const { container } = render(
      <NormChart
        title="Реакция"
        kind="bar"
        tone="reaction"
        labels={["1", "2"]}
        values={[24, 33]}
        seriesName="Реакция"
        unit="с"
        norm={{ value: 30, label: "норматив 30 с" }}
      />,
    );
    expect(container.querySelectorAll("rect")).toHaveLength(2);
  });

  it("пустой ряд не падает", () => {
    render(<NormChart title="Пусто" labels={[]} values={[]} seriesName="Балл" />);
    expect(screen.getByRole("img", { name: "Пусто" })).toBeInTheDocument();
  });
});
