import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";
import type { Assignment } from "@/shared/api";

import type { TeacherGroupsApi } from "../api/teacherGroupsApi";
import { TeacherGroupScreen } from "./TeacherGroupScreen";

const makeApi = (overrides: Partial<TeacherGroupsApi> = {}): TeacherGroupsApi => ({
  insights: vi.fn().mockResolvedValue({
    insights: [{ share: 0.667, errorType: "address", text: "2 из 3 обучающихся: address" }],
    suggestedGroup: "Пожар",
  }),
  listAssignments: vi.fn().mockResolvedValue([{ id: "asg-001", title: "Тренировка" } as Assignment]),
  ...overrides,
});

describe("страница группы", () => {
  it("показывает инсайты и предлагаемую тему", async () => {
    render(<TeacherGroupScreen groupId="Г-1" api={makeApi()} />);
    expect(await screen.findByText("67%")).toBeInTheDocument();
    expect(screen.getByText("Пожар")).toBeInTheDocument();
  });

  it("выбор задания перезапрашивает инсайты с assignmentId", async () => {
    const api = makeApi();
    render(<TeacherGroupScreen groupId="Г-1" api={api} />);
    await screen.findByText("67%");
    await screen.findByRole("option", { name: "Тренировка" });
    fireEvent.change(screen.getByLabelText("Задание"), { target: { value: "asg-001" } });
    await waitFor(() => expect(api.insights).toHaveBeenLastCalledWith("Г-1", "asg-001"));
  });

  it("нет ошибок — пустое состояние; чужое задание (403) — сообщение сервера", async () => {
    const { unmount } = render(
      <TeacherGroupScreen
        groupId="Г-1"
        api={makeApi({ insights: vi.fn().mockResolvedValue({ insights: [], suggestedGroup: null }) })}
      />,
    );
    expect(await screen.findByText("Данных пока нет")).toBeInTheDocument();
    unmount();
    render(
      <TeacherGroupScreen
        groupId="Г-1"
        api={makeApi({
          insights: vi
            .fn()
            .mockRejectedValue(new ApiError(403, "forbidden", "Задание другого преподавателя")),
        })}
      />,
    );
    expect(await screen.findByText("Задание другого преподавателя")).toBeInTheDocument();
  });
});
