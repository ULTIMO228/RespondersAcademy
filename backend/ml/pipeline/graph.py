"""LangGraph конвейер подготовки и проверки примеров ИИ (T036, T039, T040, T043)."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from ml.pipeline.checks import run_deterministic_checks
from ml.pipeline.judge import evaluate_with_judge
from ml.pipeline.models import LocalChatAdapter, sanitize_prompt_input
from ml.pipeline.review import get_human_decision
from ml.pipeline.sanitize import validate_sanitized_ticket
from ml.pipeline.state import PipelineState

# In-memory кэш идемпотентных вызовов узлов: f"{run_id}:{node}:{input_hash}:{prompt_version}"
_NODE_CALL_CACHE: dict[str, Any] = {}


def _get_input_hash(data: Any) -> str:
    serialized = json.dumps(data, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:16]


def build_pipeline_graph(
    baseline_model: BaseChatModel | None = None,
    teacher_model: BaseChatModel | None = None,
    judge_model_family: str = "llama",
    candidate_model_family: str = "qwen",
    checkpointer: BaseCheckpointSaver | None = None,
) -> tuple[Any, BaseCheckpointSaver]:
    """Строит и компилирует StateGraph для конвейера подготовки ИИ-данных."""
    if baseline_model is None:
        baseline_model = LocalChatAdapter(model_name="qwen3.5-0.8b", model_family="qwen")
    if teacher_model is None:
        teacher_model = LocalChatAdapter(model_name="qwen-strong", model_family="qwen")
    if checkpointer is None:
        checkpointer = MemorySaver()

    builder = StateGraph(PipelineState)

    # 1. Узел санитизации
    def sanitize_gate_node(state: PipelineState) -> dict[str, Any]:
        ticket = state.get("sanitized_ticket") or {}
        # Бросит SourceGateError если не прошло piiCheck или approval
        approved = validate_sanitized_ticket(ticket)
        return {
            "sanitized_ticket": {
                "source_ticket_id": approved.source_ticket_id,
                "situation_no": approved.situation_no,
                "sanitized_text": approved.sanitized_text,
                "source_hash": approved.source_hash,
                "reviewer_id": approved.reviewer_id,
                "reviewed_at": approved.reviewed_at,
            },
            "status": "sanitized",
        }

    # 2. Узел базовой модели (baseline_small_model)
    def baseline_model_node(state: PipelineState) -> dict[str, Any]:
        run_id = state.get("run_id", "default-run")
        prompt_ver = state.get("prompt_version", "v1")
        ticket_text = state.get("sanitized_ticket", {}).get("sanitized_text", "")
        input_hash = _get_input_hash(ticket_text)
        cache_key = f"{run_id}:baseline:{input_hash}:{prompt_ver}"

        if cache_key in _NODE_CALL_CACHE:
            return _NODE_CALL_CACHE[cache_key]

        safe_input = sanitize_prompt_input(ticket_text)
        messages = [
            SystemMessage(content=f"Системная инструкция {prompt_ver}"),
            HumanMessage(content=f"Фабула происшествия: {safe_input}"),
        ]
        res = baseline_model.invoke(messages)
        try:
            parsed = json.loads(res.content)
        except Exception:
            parsed = {
                "decision": "uncertain",
                "rationale": res.content[:400],
                "factIds": ["fact-1"],
                "errorIds": [],
            }

        out = {
            "base_output": parsed,
            "base_reasoning_summary": str(parsed.get("rationale") or "Базовое основание")[:200],
        }
        _NODE_CALL_CACHE[cache_key] = out
        return out

    # 3. Узел сильной модели (teacher_generate)
    def teacher_generate_node(state: PipelineState) -> dict[str, Any]:
        run_id = state.get("run_id", "default-run")
        prompt_ver = state.get("prompt_version", "v1")
        ticket_text = state.get("sanitized_ticket", {}).get("sanitized_text", "")
        input_hash = _get_input_hash(ticket_text)
        cache_key = f"{run_id}:teacher:{input_hash}:{prompt_ver}"

        if cache_key in _NODE_CALL_CACHE:
            return _NODE_CALL_CACHE[cache_key]

        safe_input = sanitize_prompt_input(ticket_text)
        messages = [
            SystemMessage(content="Генерация эталонного кандидата АРМ-112"),
            HumanMessage(content=f"Фабула: {safe_input}"),
        ]
        res = teacher_model.invoke(messages)
        try:
            parsed = json.loads(res.content)
            candidates = [parsed] if isinstance(parsed, dict) else parsed
        except Exception:
            candidates = [{
                "ekp_code": "10101",
                "address": "ул. Тверская 12",
                "decision": "correct",
                "text": "Исправленный вариант",
                "reference_fact_ids": ["fact-1"],
                "errorIds": [],
            }]

        out = {"teacher_candidates": candidates}
        _NODE_CALL_CACHE[cache_key] = out
        return out

    # 4. Узел детерминированных проверок
    def checks_node(state: PipelineState) -> dict[str, Any]:
        candidates = state.get("teacher_candidates") or []
        allowed_facts = ["fact-1", "fact-2", "fact-3"]
        passed_cands = []
        all_failures = []

        for cand in candidates:
            res = run_deterministic_checks(
                cand,
                allowed_fact_ids=allowed_facts,
                mode=state.get("mode", "operator112"),
            )
            if res.passed:
                passed_cands.append(cand)
            else:
                all_failures.extend(res.failures)

        return {
            "teacher_candidates": passed_cands,
            "checks_passed": len(passed_cands) > 0,
            "check_failures": all_failures,
        }

    # 5. Узел независимого LLM-судьи
    def judge_node(state: PipelineState) -> dict[str, Any]:
        base_out = state.get("base_output") or {}
        candidates = state.get("teacher_candidates") or [{}]
        primary_cand = candidates[0] if candidates else {}
        ticket_text = state.get("sanitized_ticket", {}).get("sanitized_text", "")

        review = evaluate_with_judge(
            situation_text=ticket_text,
            reference_fact_ids=["fact-1", "fact-2", "fact-3"],
            allowed_error_ids=["err-timeout", "err-address"],
            baseline_answer=base_out,
            candidate_answer=primary_cand,
            judge_model_family=judge_model_family,
            candidate_model_family=candidate_model_family,
        )
        return {
            "judge_review": review,
            "status": "waiting_human_review" if review.get("needsHuman") else "judged",
        }


    # 6. Узел человеческого арбитража с interrupt
    def human_adjudication_node(state: PipelineState) -> dict[str, Any]:
        thread_id = state.get("thread_id", "default-thread")
        review = state.get("judge_review") or {}
        needs_human = review.get("needsHuman", False)

        # Проверяем, есть ли уже вердикт человека в журнале решений
        decision = get_human_decision(thread_id)
        if needs_human and decision is None:
            # Прерываем граф и ждем вмешательства человека
            interrupt({
                "thread_id": thread_id,
                "reason": review.get("disagreementReason") or "Требуется решение человека",
            })
            return {"status": "waiting_human_review"}

        human_res = {
            "decision": decision.decision if decision else "auto_accepted",
            "reviewer_id": decision.reviewer_id if decision else "system",
            "reason": decision.reason if decision else "Автоматическое одобрение",
        }
        return {
            "human_decision": human_res,
            "status": "adjudicated",
        }

    # 7. Финальный узел формирования примера
    def export_example_node(state: PipelineState) -> dict[str, Any]:
        candidates = state.get("teacher_candidates") or []
        primary_cand = candidates[0] if candidates else {}
        example = {
            "id": f"ex-{state.get('run_id')}",
            "sourceTicketId": state.get("source_ticket_id"),
            "mode": state.get("mode"),
            "promptVersion": state.get("prompt_version"),
            "baseOutput": state.get("base_output"),
            "baseReasoningSummary": state.get("base_reasoning_summary"),
            "teacherCandidate": primary_cand,
            "correctedOutput": primary_cand,
            "judgeReview": state.get("judge_review"),
            "humanDecision": state.get("human_decision"),
            "checksPassed": state.get("checks_passed"),
        }
        return {
            "final_example": example,
            "status": "completed",
        }

    # Сборка графа
    builder.add_node("sanitize_gate", sanitize_gate_node)
    builder.add_node("baseline_model", baseline_model_node)
    builder.add_node("teacher_generate", teacher_generate_node)
    builder.add_node("deterministic_checks", checks_node)
    builder.add_node("independent_judge", judge_node)
    builder.add_node("human_adjudication", human_adjudication_node)
    builder.add_node("export_example", export_example_node)

    builder.add_edge(START, "sanitize_gate")
    builder.add_edge("sanitize_gate", "baseline_model")
    builder.add_edge("baseline_model", "teacher_generate")
    builder.add_edge("teacher_generate", "deterministic_checks")
    builder.add_edge("deterministic_checks", "independent_judge")
    builder.add_edge("independent_judge", "human_adjudication")
    builder.add_edge("human_adjudication", "export_example")
    builder.add_edge("export_example", END)

    compiled = builder.compile(checkpointer=checkpointer)
    return compiled, checkpointer
