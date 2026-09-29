import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import type * as SharedApi from "@/shared/api";
import * as api from "@/shared/api";
import { AIAssessmentPanel } from "./AIAssessmentPanel";

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedApi>();
  return {
    ...actual,
    getAssessmentState: vi.fn(),
    getAssessmentReview: vi.fn(),
    resolveAssessment: vi.fn(),
  };
});

describe("AIAssessmentPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("не рендерится, если карточка еще не завершена и нет начальной оценки", () => {
    const { container } = render(<AIAssessmentPanel attemptId="att-01" cardCompleted={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("рендерит предварительную оценку с 4 осями и итоговым баллом", async () => {
    vi.mocked(api.getAssessmentState).mockResolvedValueOnce({
      attemptId: "att-01",
      mode: "operator112",
      status: "preliminary",
      revision: 1,
      availableAxes: ["timeScore", "correctnessScore", "grammarScore", "semanticScore"],
      axes: {
        timeScore: 90,
        correctnessScore: 95,
        grammarScore: 100,
        semanticScore: 85,
      },
      totalScore: 92,
      updatedAt: "2026-09-27T12:00:00Z",
    });

    render(<AIAssessmentPanel attemptId="att-01" cardCompleted={true} />);

    await waitFor(() => {
      expect(screen.getByText("Предварительно")).toBeInTheDocument();
    });

    expect(screen.getByText("rev.1")).toBeInTheDocument();
    expect(screen.getByText("90")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("85")).toBeInTheDocument();
    expect(screen.getByText("92")).toBeInTheDocument();
  });

  it("ответ автономного режима помечен пояснением рядом с бейджем «ИИ»; у ответа бэкенда пометки нет", async () => {
    const state = {
      attemptId: "att-01",
      mode: "dds" as const,
      status: "preliminary" as const,
      revision: 1,
      availableAxes: ["timeScore" as const],
      axes: { timeScore: 90, correctnessScore: null, grammarScore: null, semanticScore: null },
      totalScore: 90,
      updatedAt: "2026-09-27T12:00:00Z",
    };
    vi.mocked(api.getAssessmentState).mockResolvedValueOnce({ ...state, reasonCode: "standalone_mock" });
    const { unmount } = render(<AIAssessmentPanel attemptId="att-01" cardCompleted={true} />);
    expect(await screen.findByTestId("ai-standalone-note")).toHaveTextContent(/Автономный режим/);
    unmount();
    vi.mocked(api.getAssessmentState).mockResolvedValueOnce({ ...state, reasonCode: null });
    render(<AIAssessmentPanel attemptId="att-01" cardCompleted={true} />);
    await screen.findByText("Предварительно");
    expect(screen.queryByTestId("ai-standalone-note")).toBeNull();
  });

  it("при review_required отображает форму арбитража и не показывает фиктивный итоговый балл", async () => {
    vi.mocked(api.getAssessmentState).mockResolvedValueOnce({
      attemptId: "att-02",
      mode: "dds",
      status: "review_required",
      revision: 1,
      availableAxes: ["timeScore", "correctnessScore", "grammarScore", "semanticScore"],
      axes: {
        timeScore: 80,
        correctnessScore: 70,
        grammarScore: 90,
        semanticScore: null,
      },
      totalScore: null,
      reasonCode: "disputed_semantic_similarity",
      updatedAt: "2026-09-27T12:00:00Z",
    });

    vi.mocked(api.getAssessmentReview).mockResolvedValueOnce({
      attemptId: "att-02",
      mode: "dds",
      status: "review_required",
      revision: 1,
      availableAxes: ["timeScore", "correctnessScore", "grammarScore", "semanticScore"],
      axes: {
        timeScore: 80,
        correctnessScore: 70,
        grammarScore: 90,
        semanticScore: null,
      },
      totalScore: null,
      etalonVersion: "etalon-v1",
      assessorVersion: "assessor-v1",
      semanticReviews: [
        {
          id: "sem-rev-1",
          attemptId: "att-02",
          fieldPath: "description",
          referenceFactIds: ["fact-1"],
          reason: "Близость в серой зоне (0.72)",
          baseSimilarity: 0.72,
          thresholdVersion: "semantic-calibrated-v1",
          decision: "uncertain",
          explanation: "Формулировка отличается от эталона",
        },
      ],
      errorRecords: [],
      updatedAt: "2026-09-27T12:00:00Z",
    });

    render(<AIAssessmentPanel attemptId="att-02" cardCompleted={true} />);

    await waitFor(() => {
      expect(screen.getByText("На проверке")).toBeInTheDocument();
    });

    expect(screen.getByText("Требуется арбитраж преподавателя")).toBeInTheDocument();
    expect(screen.getByText(/Близость в серой зоне/)).toBeInTheDocument();
    // Итоговый балл при review_required должен быть «—»
    const totalScoreContainer = screen.getByText("Итоговый балл").parentElement;
    expect(within(totalScoreContainer!).getByText("—")).toBeInTheDocument();
  });

  it("позволяет преподавателю утвердить оценку через resolveAssessment", async () => {
    vi.mocked(api.getAssessmentState).mockResolvedValueOnce({
      attemptId: "att-02",
      mode: "dds",
      status: "review_required",
      revision: 1,
      availableAxes: ["timeScore", "correctnessScore", "grammarScore", "semanticScore"],
      axes: {
        timeScore: 80,
        correctnessScore: 70,
        grammarScore: 90,
        semanticScore: null,
      },
      totalScore: null,
      updatedAt: "2026-09-27T12:00:00Z",
    });

    vi.mocked(api.getAssessmentReview).mockResolvedValueOnce({
      attemptId: "att-02",
      mode: "dds",
      status: "review_required",
      revision: 1,
      availableAxes: ["timeScore", "correctnessScore", "grammarScore", "semanticScore"],
      axes: {
        timeScore: 80,
        correctnessScore: 70,
        grammarScore: 90,
        semanticScore: null,
      },
      totalScore: null,
      etalonVersion: "etalon-v1",
      assessorVersion: "assessor-v1",
      semanticReviews: [],
      errorRecords: [],
      updatedAt: "2026-09-27T12:00:00Z",
    });

    vi.mocked(api.resolveAssessment).mockResolvedValueOnce({
      status: "final",
      revision: 2,
      totalScore: 85,
    });

    // После resolveAssessment будет вызван getAssessmentState повторно
    vi.mocked(api.getAssessmentState).mockResolvedValueOnce({
      attemptId: "att-02",
      mode: "dds",
      status: "final",
      revision: 2,
      availableAxes: ["timeScore", "correctnessScore", "grammarScore", "semanticScore"],
      axes: {
        timeScore: 80,
        correctnessScore: 70,
        grammarScore: 90,
        semanticScore: 85,
      },
      totalScore: 85,
      updatedAt: "2026-09-27T12:05:00Z",
    });

    const onResolved = vi.fn();
    render(<AIAssessmentPanel attemptId="att-02" cardCompleted={true} onEvaluationResolved={onResolved} />);

    await waitFor(() => {
      expect(screen.getByText("Требуется арбитраж преподавателя")).toBeInTheDocument();
    });

    const scoreInput = screen.getByLabelText(/Итоговый балл/);
    const commentInput = screen.getByPlaceholderText(/Укажите комментарий к оценке/);
    const submitButton = screen.getByRole("button", { name: "Утвердить итоговую оценку" });

    fireEvent.change(scoreInput, { target: { value: "85" } });
    fireEvent.change(commentInput, { target: { value: "Преподаватель подтвердил верный смысл" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(api.resolveAssessment).toHaveBeenCalledWith(
        "att-02",
        expect.objectContaining({
          expectedRevision: 1,
          score: 85,
          comment: "Преподаватель подтвердил верный смысл",
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Итоговая")).toBeInTheDocument();
    });

    expect(screen.getByText("rev.2")).toBeInTheDocument();
    expect(onResolved).toHaveBeenCalled();
  });
});
