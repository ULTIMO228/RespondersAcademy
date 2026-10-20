import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError, ServerRequiredError } from "@/shared/api";
import type { AIScenarioVersion, ScenarioPermission } from "@/shared/api";

import type { ScenarioGraphEditorApi } from "../api/graphEditorApi";
import { sampleGraph } from "../lib/fixtures";
import { ScenarioGraphEditor } from "./ScenarioGraphEditor";

function makeVersion(overrides: Partial<AIScenarioVersion> = {}): AIScenarioVersion {
  return {
    schemaVersion: "ai-workflow/1",
    scenarioId: "s-ai-001",
    version: 1,
    mode: "operator112",
    sourceTicketId: "t-1",
    sourceSituationNo: 1,
    sourceKind: "ticket",
    sourceHash: "a".repeat(64),
    validation: "passed",
    validationErrors: [],
    approval: "draft",
    cardSnapshot: { id: "c-1", fields: {} },
    etalonVersion: "e1",
    ruleSourceIds: [],
    semanticFacts: [],
    classifierVersion: "v1",
    etalon: {
      expectedFields: {},
      expectedActions: [],
      semanticFacts: [],
      ruleSourceIds: [],
      classifierVersion: "v1",
    },
    fieldDecisions: [],
    graph: sampleGraph(),
    ...overrides,
  };
}

function makeApi(
  version: AIScenarioVersion | null,
  permissions: ScenarioPermission[] = [],
  overrides: Partial<ScenarioGraphEditorApi> = {},
): ScenarioGraphEditorApi {
  return {
    listAIScenarioVersions: vi.fn(async () => (version ? [version] : [])),
    getScenarioPermissions: vi.fn(async () => ({ permissions })),
    listScenarioSources: vi.fn(async () => [
      { sourceTicketId: "t-7", situationNo: 7, preview: "Упало дерево на проезжую часть" },
    ]),
    validateScenarioGraph: vi.fn(async () => ({ valid: true, errors: [] })),
    createGraphScenario: vi.fn(async () => makeVersion()),
    reviseGraphScenario: vi.fn(async (_id, body) =>
      makeVersion({ version: 2, parentVersion: 1, graph: body.graph }),
    ),
    submitGraphScenario: vi.fn(async (_id, body) =>
      makeVersion({ version: body.version, approval: "pending_review" }),
    ),
    reviewGraphScenario: vi.fn(async (_id, body) =>
      makeVersion({
        approval: body.decision === "accept" ? "approved" : "rejected",
        reviewComment: body.comment,
      }),
    ),
    publishGraphScenario: vi.fn(async () => makeVersion({ approval: "approved" })),
    deriveGraphScenarioVersion: vi.fn(async (_id, version) =>
      makeVersion({ version: version + 1, parentVersion: version, approval: "draft" }),
    ),
    listScenarioRuns: vi.fn(async () => []),
    ...overrides,
  };
}

async function renderEditor(api: ScenarioGraphEditorApi, categories: string[] = ["Дерево", "Пожар"]) {
  render(<ScenarioGraphEditor scenarioId="s-ai-001" categories={categories} api={api} />);
  await screen.findByRole("group", { name: /Холст графа сценария/ });
}

const block = (name: RegExp | string) => screen.getByRole("button", { name });

describe("ScenarioGraphEditor: холст и панель свойств", () => {
  it("рисует блоки графа с видом, идентификатором и пометкой старта", async () => {
    await renderEditor(makeApi(makeVersion()));
    expect(screen.getByRole("group", { name: "Холст графа сценария, блоков: 5" })).toBeInTheDocument();
    expect(block(/Шаг «Приём вызова», идентификатор n1, стартовый/)).toBeInTheDocument();
    expect(block(/Условие «Тип происшествия», идентификатор n3/)).toBeInTheDocument();
    expect(block(/Завершение «completed», идентификатор n4/)).toBeInTheDocument();
    expect(screen.getByText("Дерево")).toBeInTheDocument();
    expect(screen.getByText("Иначе")).toBeInTheDocument();
  });

  it("выбор блока открывает панель свойств, правка заголовка видна на холсте", async () => {
    await renderEditor(makeApi(makeVersion()));
    expect(screen.getByText("Выберите блок на холсте, чтобы изменить его свойства.")).toBeInTheDocument();
    fireEvent.keyDown(block(/идентификатор n1/), { key: "Enter" });
    const panel = screen.getByRole("region", { name: "Свойства блока n1" });
    fireEvent.change(within(panel).getByLabelText("Заголовок"), { target: { value: "Новый приём" } });
    expect(block(/Шаг «Новый приём», идентификатор n1/)).toBeInTheDocument();
  });

  it("палитра добавляет блок, Delete с подтверждением удаляет и очищает ссылки", async () => {
    await renderEditor(makeApi(makeVersion()));
    fireEvent.click(screen.getByRole("button", { name: "+ Завершение" }));
    expect(screen.getByRole("group", { name: "Холст графа сценария, блоков: 6" })).toBeInTheDocument();

    fireEvent.keyDown(block(/идентификатор n4/), { key: "Delete" });
    const dialog = screen.getByRole("alertdialog", { name: "Подтверждение удаления блока" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Отмена" }));
    expect(block(/идентификатор n4/)).toBeInTheDocument();

    fireEvent.keyDown(block(/идентификатор n4/), { key: "Delete" });
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Удалить блок" }));
    expect(screen.queryByRole("button", { name: /идентификатор n4/ })).not.toBeInTheDocument();
    // ветка «Дерево» осталась без цели — локальная проверка это показывает
    expect(screen.getByText(/Блок «n3»: ветка «Дерево» не ведёт ни к одному блоку/)).toBeInTheDocument();
  });

  it("цель соединения меняется выбором в панели свойств и попадает в сохранённый граф", async () => {
    const api = makeApi(makeVersion());
    await renderEditor(api);
    fireEvent.keyDown(block(/идентификатор n1/), { key: "Enter" });
    const panel = screen.getByRole("region", { name: "Свойства блока n1" });
    fireEvent.change(within(panel).getByLabelText("Следующий блок"), { target: { value: "n3" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(api.reviseGraphScenario).toHaveBeenCalled());
    const body = vi.mocked(api.reviseGraphScenario).mock.calls[0][1];
    expect(body.graph?.nodes[0].next).toBe("n3");
  });

  it("стрелка сдвигает блок на 10, и сдвиг сохраняется в layout", async () => {
    const api = makeApi(makeVersion());
    await renderEditor(api);
    fireEvent.keyDown(block(/идентификатор n1/), { key: "ArrowRight" });
    fireEvent.keyDown(block(/идентификатор n1/), { key: "ArrowDown", shiftKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(api.reviseGraphScenario).toHaveBeenCalled());
    expect(vi.mocked(api.reviseGraphScenario).mock.calls[0][1].graph?.layout?.n1).toEqual({ x: 90, y: 110 });
  });

  it("ветку условия можно добавить и удалить, последнюю ветку удалить нельзя", async () => {
    await renderEditor(makeApi(makeVersion()));
    fireEvent.keyDown(block(/идентификатор n3/), { key: "Enter" });
    const panel = screen.getByRole("region", { name: "Свойства блока n3" });
    expect(within(panel).queryByRole("button", { name: /Удалить ветку/ })).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Добавить ветку" }));
    expect(within(panel).getByText("Ветка 2")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Удалить ветку 2" }));
    expect(within(panel).queryByText("Ветка 2")).not.toBeInTheDocument();
  });
});

describe("ScenarioGraphEditor: проверка графа", () => {
  it("ошибки сервера выводятся списком, клик выбирает блок, блок подсвечен текстом", async () => {
    const api = makeApi(makeVersion(), [], {
      validateScenarioGraph: vi.fn(async () => ({
        valid: false,
        errors: [
          { message: "score — целое 0–100", nodeId: "n5" },
          { message: "нет достижимого завершения", nodeId: null },
        ],
      })),
    });
    await renderEditor(api);
    fireEvent.click(screen.getByRole("button", { name: "Проверить на сервере" }));
    const list = await screen.findByRole("list", { name: "Ошибки графа" });
    expect(within(list).getByText(/нет достижимого завершения/)).toBeInTheDocument();
    expect(block(/идентификатор n5, есть ошибки/)).toBeInTheDocument();
    expect(screen.getByText("⚠ Ошибка в блоке")).toBeInTheDocument();

    fireEvent.click(within(list).getByRole("button", { name: /Ошибка в блоке n5: score/ }));
    expect(screen.getByRole("region", { name: "Свойства блока n5" })).toBeInTheDocument();
  });

  it("при успехе сообщает об отсутствии ошибок; сбой проверки показывается отдельно", async () => {
    const api = makeApi(makeVersion());
    await renderEditor(api);
    fireEvent.click(screen.getByRole("button", { name: "Проверить на сервере" }));
    expect(await screen.findByText(/Сервер не нашёл ошибок/)).toBeInTheDocument();

    vi.mocked(api.validateScenarioGraph).mockRejectedValueOnce(new Error("Нет соединения с сервером"));
    fireEvent.click(screen.getByRole("button", { name: "Проверить на сервере" }));
    expect(await screen.findByText(/Проверка не выполнена: Нет соединения с сервером/)).toHaveAttribute(
      "role",
      "alert",
    );
  });
});

describe("ScenarioGraphEditor: процесс версий и права", () => {
  it("«Сохранить» создаёт новую версию с графом и сбрасывает признак несохранённых изменений", async () => {
    const api = makeApi(makeVersion());
    await renderEditor(api);
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "+ Шаг (действие)" }));
    expect(screen.getByText("Есть несохранённые изменения")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Сохранено новой версией")).toBeInTheDocument();
    const [id, body] = vi.mocked(api.reviseGraphScenario).mock.calls[0];
    expect(id).toBe("s-ai-001");
    expect(body.baseVersion).toBe(1);
    expect(body.requestId).toBeTruthy();
    expect(body.graph?.nodes).toHaveLength(6);
    expect(screen.queryByText("Есть несохранённые изменения")).not.toBeInTheDocument();
    expect(screen.getByText(/Версия 2:/)).toBeInTheDocument();
  });

  it("ошибка API при сохранении показывается и не выдаётся за успех; повтор проходит", async () => {
    const revise = vi
      .fn<ScenarioGraphEditorApi["reviseGraphScenario"]>()
      .mockRejectedValueOnce(new ApiError(403, "forbidden", "Недостаточно прав"))
      .mockImplementation(async (_id, body) => makeVersion({ version: 2, graph: body.graph }));
    await renderEditor(makeApi(makeVersion(), [], { reviseGraphScenario: revise }));
    fireEvent.click(screen.getByRole("button", { name: "+ Завершение" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Недостаточно прав");
    expect(screen.queryByText("Сохранено новой версией")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Сохранено новой версией")).toBeInTheDocument();
  });

  it("черновик без правок отправляется на проверку; с правками сначала требуется сохранение", async () => {
    const api = makeApi(makeVersion());
    await renderEditor(api);
    fireEvent.click(screen.getByRole("button", { name: "+ Условие" }));
    expect(screen.getByRole("button", { name: "Отправить на проверку" })).toBeDisabled();
    expect(screen.getByText("Чтобы отправить на проверку, сначала сохраните изменения.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await screen.findByText("Сохранено новой версией");
    fireEvent.click(screen.getByRole("button", { name: "Отправить на проверку" }));
    await waitFor(() =>
      expect(api.submitGraphScenario).toHaveBeenCalledWith(
        "s-ai-001",
        expect.objectContaining({ version: 2 }),
      ),
    );
    expect(await screen.findByTestId("approval-status")).toHaveTextContent("На проверке у эксперта");
  });

  it("на проверке без права эксперта: решения скрыты, «Сохранить» заблокирована, правки только для чтения", async () => {
    await renderEditor(makeApi(makeVersion({ approval: "pending_review" }), ["scenario.publish"]));
    expect(screen.queryByRole("button", { name: "Принять" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Отклонить" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    expect(screen.getByText(/Версия на проверке — изменить её нельзя/)).toBeInTheDocument();
    expect(screen.getByText(/правом «scenario.review»/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Шаг (действие)" })).toBeDisabled();
  });

  it("эксперт с правом принимает версию, отклонение требует комментария", async () => {
    const api = makeApi(makeVersion({ approval: "pending_review" }), ["scenario.review"]);
    await renderEditor(api);
    fireEvent.click(screen.getByRole("button", { name: "Отклонить" }));
    expect(await screen.findByText("Укажите причину отклонения")).toBeInTheDocument();
    expect(api.reviewGraphScenario).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Комментарий эксперта/), {
      target: { value: "Нет ветки отказа" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Принять" }));
    await waitFor(() =>
      expect(api.reviewGraphScenario).toHaveBeenCalledWith(
        "s-ai-001",
        expect.objectContaining({ version: 1, decision: "accept", comment: "Нет ветки отказа" }),
      ),
    );
    expect(await screen.findByTestId("approval-status")).toHaveTextContent("Принята");
  });

  it("публикация доступна только с правом scenario.publish после принятия", async () => {
    const withoutRight = makeApi(makeVersion({ approval: "approved" }), ["scenario.review"]);
    const first = render(<ScenarioGraphEditor scenarioId="s-ai-001" api={withoutRight} />);
    await screen.findByRole("group", { name: /Холст графа сценария/ });
    expect(screen.queryByRole("button", { name: "Опубликовать" })).not.toBeInTheDocument();
    first.unmount();

    const api = makeApi(makeVersion({ approval: "approved" }), ["scenario.publish"]);
    await renderEditor(api);
    fireEvent.click(screen.getByRole("button", { name: "Опубликовать" }));
    await waitFor(() =>
      expect(api.publishGraphScenario).toHaveBeenCalledWith(
        "s-ai-001",
        expect.objectContaining({ version: 1 }),
      ),
    );
  });
});

describe("ScenarioGraphEditor: новая версия из принятой", () => {
  it("кнопка видна только у принятой версии", async () => {
    const draft = render(<ScenarioGraphEditor scenarioId="s-ai-001" api={makeApi(makeVersion())} />);
    await screen.findByRole("group", { name: /Холст графа сценария/ });
    expect(screen.queryByRole("button", { name: "Создать новую версию" })).not.toBeInTheDocument();
    draft.unmount();

    await renderEditor(makeApi(makeVersion({ approval: "approved" })));
    expect(screen.getByRole("button", { name: "Создать новую версию" })).toBeInTheDocument();
  });

  it("создаёт версию с комментарием, перечитывает версии и открывает черновик", async () => {
    const approved = makeVersion({ approval: "approved" });
    const list = vi.fn().mockResolvedValueOnce([approved]);
    const api = makeApi(approved, [], { listAIScenarioVersions: list });
    list.mockResolvedValue([approved, makeVersion({ version: 2, parentVersion: 1, approval: "draft" })]);
    await renderEditor(api);
    fireEvent.change(screen.getByLabelText(/Комментарий к новой версии/), { target: { value: "уточнить" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать новую версию" }));
    await waitFor(() =>
      expect(api.deriveGraphScenarioVersion).toHaveBeenCalledWith(
        "s-ai-001",
        1,
        expect.objectContaining({ comment: "уточнить", requestId: expect.any(String) }),
      ),
    );
    expect(await screen.findByText("Версия 2:", { exact: false })).toBeInTheDocument();
    expect(screen.getByTestId("approval-status")).toHaveTextContent("Черновик");
    expect(screen.getByText("Создана версия 2 (черновик)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Создать новую версию" })).not.toBeInTheDocument();
  });

  it("409 «уже есть неопубликованная версия» показывается понятным текстом, версия не меняется", async () => {
    const api = makeApi(makeVersion({ approval: "approved" }), [], {
      deriveGraphScenarioVersion: vi.fn(async () => {
        throw new ApiError(409, "conflict", "conflict");
      }),
    });
    await renderEditor(api);
    fireEvent.click(screen.getByRole("button", { name: "Создать новую версию" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Уже есть неопубликованная версия");
    expect(screen.getByTestId("approval-status")).toHaveTextContent("Принята");
  });
});

describe("ScenarioGraphEditor: прохождения", () => {
  const run = (overrides: Record<string, unknown> = {}) => ({
    runId: "run-1",
    scenarioId: "s-ai-001",
    version: 1,
    studentId: "u-005",
    status: "completed" as const,
    createdAt: "2026-10-20T10:00:00+03:00",
    finishedAt: "2026-10-20T10:02:05+03:00",
    result: {
      score: 80,
      passed: true,
      outcome: "completed",
      outcomeTitle: "Вызов обработан",
      wrongAttempts: 1,
      steps: 4,
      durationMs: 125_000,
      finishedAt: "2026-10-20T10:02:05+03:00",
      path: ["n1", "n3", "n4"],
      branches: ["Дерево"],
    },
    ...overrides,
  });

  it("таблица показывает балл, зачёт, неверные и время; строка раскрывается маршрутом и ветками", async () => {
    const api = makeApi(makeVersion(), [], { listScenarioRuns: vi.fn(async () => [run()]) });
    await renderEditor(api);
    const table = await screen.findByRole("table");
    expect(api.listScenarioRuns).toHaveBeenCalledWith({ scenarioId: "s-ai-001" }, expect.anything());
    const row = within(table).getByText(/u-005/).closest("tr") as HTMLElement;
    expect(within(row).getByText("80")).toBeInTheDocument();
    expect(within(row).getByText(/Зачтено/)).toBeInTheDocument();
    expect(within(row).getByText("02:05")).toBeInTheDocument();
    expect(screen.queryByText("n1 → n3 → n4")).not.toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: /u-005/ }));
    expect(screen.getByText("n1 → n3 → n4")).toBeInTheDocument();
    expect(screen.getByText("Дерево", { selector: "dd" })).toBeInTheDocument();
  });

  it("незавершённый прогон — без результата; пусто и ошибка с повтором", async () => {
    const api = makeApi(makeVersion(), [], {
      listScenarioRuns: vi
        .fn()
        .mockRejectedValueOnce(new ApiError(500, "internal", "Сбой списка"))
        .mockResolvedValueOnce([run({ status: "waiting", result: undefined, finishedAt: undefined })])
        .mockResolvedValue([]),
    });
    await renderEditor(api);
    const section = screen.getByRole("region", { name: "Прохождения" });
    expect(await within(section).findByText("Сбой списка")).toBeInTheDocument();
    fireEvent.click(within(section).getByRole("button", { name: "Повторить" }));
    expect(await within(section).findByText("В процессе")).toBeInTheDocument();
    fireEvent.click(within(section).getByRole("button", { name: "Обновить" }));
    expect(await within(section).findByText("Прохождений пока нет")).toBeInTheDocument();
  });
});

describe("ScenarioGraphEditor: загрузка и создание", () => {
  it("состояние загрузки, затем холст", async () => {
    render(<ScenarioGraphEditor scenarioId="s-ai-001" api={makeApi(makeVersion())} />);
    expect(screen.getByRole("status", { name: "Загрузка версий сценария…" })).toBeInTheDocument();
    await screen.findByRole("group", { name: /Холст графа сценария/ });
  });

  it("ошибка загрузки показывается с кнопкой «Повторить»; повтор открывает холст", async () => {
    const list = vi
      .fn<ScenarioGraphEditorApi["listAIScenarioVersions"]>()
      .mockRejectedValueOnce(new ApiError(500, "internal", "Ошибка сервера. Повторите попытку позже"))
      .mockResolvedValue([makeVersion()]);
    render(
      <ScenarioGraphEditor scenarioId="s-ai-001" api={makeApi(null, [], { listAIScenarioVersions: list })} />,
    );
    expect(await screen.findByText("Ошибка сервера. Повторите попытку позже")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    await screen.findByRole("group", { name: /Холст графа сценария/ });
  });

  it("без бэкенда показывает понятное сообщение «требуется сервер»", async () => {
    const list = vi.fn(async () => {
      throw new ServerRequiredError();
    });
    render(
      <ScenarioGraphEditor scenarioId="s-1" api={makeApi(null, [], { listAIScenarioVersions: list })} />,
    );
    expect(await screen.findByText("Раздел требует подключения к серверу тренажёра")).toBeInTheDocument();
  });

  it("у сценария без версий показывается форма создания; создание отправляет шаблонный граф", async () => {
    const created = makeVersion({ scenarioId: "s-ai-009" });
    const api = makeApi(null, [], { createGraphScenario: vi.fn(async () => created) });
    render(<ScenarioGraphEditor scenarioId="s-1" categories={["Дерево", "Пожар"]} api={api} />);
    expect(await screen.findByText("У сценария ещё нет графа")).toBeInTheDocument();
    await screen.findByRole("form", { name: "Создание графа сценария" });

    fireEvent.click(screen.getByRole("button", { name: "Создать граф" }));
    expect(await screen.findByText("Выберите источник")).toBeInTheDocument();
    expect(api.createGraphScenario).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Источник (очищенный билет)"), { target: { value: "t-7" } });
    fireEvent.change(screen.getByLabelText("Категория"), { target: { value: "Пожар" } });
    fireEvent.change(screen.getByLabelText("Режим"), { target: { value: "dds" } });
    fireEvent.change(screen.getByLabelText("Краткое описание ситуации"), {
      target: { value: "Упало дерево" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Создать граф" }));

    await screen.findByRole("group", { name: /Холст графа сценария/ });
    const body = vi.mocked(api.createGraphScenario).mock.calls[0][0];
    expect(body).toMatchObject({
      mode: "dds",
      sourceTicketId: "t-7",
      category: "Пожар",
      summary: "Упало дерево",
    });
    expect(body.graph?.start).toBe("step1");
    expect(body.graph?.nodes.map((node) => node.type)).toEqual(["action", "end"]);
    expect(body.requestId).toBeTruthy();
  });

  it("сбой загрузки источников и отказ создания (403) показываются, не блокируя повтор", async () => {
    const sources = vi
      .fn<ScenarioGraphEditorApi["listScenarioSources"]>()
      .mockRejectedValueOnce(new Error("Источники недоступны"))
      .mockResolvedValue([{ sourceTicketId: "t-7", situationNo: 7, preview: "Упало дерево" }]);
    const create = vi
      .fn<ScenarioGraphEditorApi["createGraphScenario"]>()
      .mockRejectedValueOnce(new ApiError(403, "forbidden", "Недостаточно прав"))
      .mockResolvedValue(makeVersion());
    render(
      <ScenarioGraphEditor
        scenarioId="s-1"
        categories={["Дерево"]}
        api={makeApi(null, [], { listScenarioSources: sources, createGraphScenario: create })}
      />,
    );
    expect(await screen.findByText("Источники недоступны")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    await screen.findByRole("form", { name: "Создание графа сценария" });

    fireEvent.change(screen.getByLabelText("Источник (очищенный билет)"), { target: { value: "t-7" } });
    fireEvent.change(screen.getByLabelText("Краткое описание ситуации"), { target: { value: "Описание" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать граф" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Недостаточно прав");
    fireEvent.click(screen.getByRole("button", { name: "Создать граф" }));
    await screen.findByRole("group", { name: /Холст графа сценария/ });
  });
});
