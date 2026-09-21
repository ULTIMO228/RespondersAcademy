"""Компонент «комментарии»: наличие и смысловая полнота комментария к отказу (памятка №4/№5) и покрытие
ключевых фраз эталона ручным вводом (Q&A «сравнение смысловое, не побуквенное»)."""

from __future__ import annotations

import re

from ml.assess import rules
from ml.assess.components import clamp01
from ml.assess.etalon import COMMENT_REQUIRED, resolve_card_etalon, status_title
from ml.assess.types import AssessContext, ComponentResult
from ml.nlp import semantic

NAME = "comments"

# Слоты полного комментария к «Не принята» / «Отказ от выполнения работ» (памятка №5): причина + кому передано.
REASON_PATTERN = re.compile(r"не обслужива|не в компетенци|дубл|реагиру\w* по|нет договора|принадлеж|территори|друг\w+ (служб|организац)|чуж|не наш|ошибочн|не относ|вне зоны", re.IGNORECASE)
TRANSFER_PATTERN = re.compile(r"перед(ан|ал|аём|аем)|сообщ(ен|ил)|направлен\w* в|проинформирован|в компетенции \d{3}|позвонил|уведомл", re.IGNORECASE)
REASON_CANON = ["не обслуживаем территорию", "не в компетенции службы", "дубль карточки", "реагирование по другой карточке", "территория другой службы", "нет договора с организацией", "объект принадлежит другой организации", "не обслуживаем объект"]
TRANSFER_CANON = ["информация передана в диспетчерскую", "передано в ОДС", "передано в управляющую компанию", "передано в другую службу", "информация передана"]
SLOT_TITLES = {"reason": "причина отказа", "transfer": "кому передана информация"}
# Слоты подтверждаются смыслом только при высокой близости к каноническим формулировкам (базовая близость
# коротких фраз у rubert-tiny2 ≈ 0,6–0,7, поэтому порог выше общего).
SLOT_THRESHOLD = 0.8

# Признаки, по которым ключевая фраза общего эталона относится к конкретной карточке.
SERVICE_HINTS = {
    "101": re.compile(r"пожар|расч[её]т|спасател|мчс|101", re.IGNORECASE),
    "102": re.compile(r"полици|наряд|дежурн\w+ част|мвд|102", re.IGNORECASE),
    "103": re.compile(r"смп|скор\w+ помощ|бригад\w+ смп|медик|103", re.IGNORECASE),
    "104": re.compile(r"газ|104", re.IGNORECASE),
}
GENERIC_HINT = re.compile(r"сообщение принято|информация принята|заявка принята|принято", re.IGNORECASE)
RELEVANCE_THRESHOLD = 0.62


def slot_filled(comment: str, pattern: re.Pattern[str], canon: list[str], threshold: float) -> tuple[bool, bool]:
    """(заполнен?, модель доступна?) — регулярка либо смысловая близость к каноническим формулировкам."""
    if pattern.search(comment):
        return True, semantic.embedder.available()
    scores, available = semantic.phrase_scores(comment, canon)
    limit = threshold if available else 0.75
    return any(value >= limit for value in scores.values()), available


def check_refusal_comment(comment: str, expected_phrases: list[str], threshold: float) -> tuple[list[str], bool, float]:
    """Недостающие слоты (названия) + доступность модели + доля заполненного (0..1)."""
    missing: list[str] = []
    available = True
    slot_threshold = max(threshold, SLOT_THRESHOLD)
    reason_ok, a1 = slot_filled(comment, REASON_PATTERN, REASON_CANON, slot_threshold)
    transfer_ok, a2 = slot_filled(comment, TRANSFER_PATTERN, TRANSFER_CANON, slot_threshold)
    available = a1 and a2
    if not reason_ok:
        missing.append(SLOT_TITLES["reason"])
    if not transfer_ok:
        missing.append(SLOT_TITLES["transfer"])
    parts = [reason_ok, transfer_ok]
    if expected_phrases:
        covered = semantic.covers_key_phrases(comment, expected_phrases, threshold)
        available = available and covered.available
        absent = semantic.missing_key_phrases(comment, expected_phrases, threshold)
        if absent:
            missing.append("не отражено " + "; ".join(f"«{p}»" for p in absent))
        parts.append(covered.score >= 0.999)
    return missing, available, sum(1.0 if p else 0.0 for p in parts) / len(parts)


def relevant_phrases(ctx: AssessContext, phrases: list[str], expected_calls: list[str], explicit: bool) -> list[str]:
    """Эталон волны A общий на 2–3 карточки: оставляем фразы про службы карточки, общие и близкие к фабуле."""
    if explicit and len(phrases) <= 2:
        return phrases
    summary = str((ctx.card or {}).get("summary") or "")
    similarity = semantic.phrase_scores(summary, phrases)[0] if summary else {}
    picked: list[str] = []
    for phrase in phrases:
        services = [n for n, hint in SERVICE_HINTS.items() if hint.search(phrase)]
        if services:
            if any(n in expected_calls for n in services):
                picked.append(phrase)
            continue
        if GENERIC_HINT.search(phrase) or similarity.get(phrase, 0.0) >= RELEVANCE_THRESHOLD:
            picked.append(phrase)
    return picked or phrases


def run(ctx: AssessContext) -> ComponentResult:
    etalon = resolve_card_etalon(ctx.etalon, str(ctx.attempt.get("cardId") or ""))
    threshold = ctx.options.semantic_threshold
    result = ComponentResult(name=NAME, score=1.0)
    parts: list[float] = []
    available = True
    for mark in ctx.statuses:
        status = str(mark.get("ddsStatus"))
        if status not in COMMENT_REQUIRED:
            continue
        title = status_title(ctx.reference, status)
        step = str(mark.get("id") or f"status:{status}")
        comment = str(mark.get("comment") or "").strip()
        if not comment:
            result.errors.append(rules.V4_MISSING_COMMENT.error(step=step, status=title))
            parts.append(0.0)
            continue
        missing, ok, filled = check_refusal_comment(comment, etalon.expected_comment_phrases, threshold)
        available = available and ok
        if missing:
            result.errors.append(rules.V5_INCOMPLETE_COMMENT.error(step=step, status=title, missing=", ".join(missing)))
        parts.append(filled)
        result.details.setdefault("refusalComments", []).append({"status": status, "comment": comment, "missing": missing})
    text = " . ".join([*ctx.entered_text.values(), *(str(s.get("comment") or "") for s in ctx.statuses)]).strip()
    phrases = relevant_phrases(ctx, etalon.key_phrases, etalon.expected_calls, etalon.explicit) if etalon.key_phrases else []
    if phrases:
        covered = semantic.covers_key_phrases(text, phrases, threshold)
        available = available and covered.available
        absent = semantic.missing_key_phrases(text, phrases, threshold)
        if absent:
            result.errors.append(rules.KEY_PHRASE_MISSING.error(phrases="; ".join(f"«{p}»" for p in absent)))
        parts.append(covered.score)
        result.details["keyPhrases"] = {p: round(v, 3) for p, v in covered.details.items()}
    if not parts:
        result.applicable = False
        return result
    result.available = available
    if not available:
        result.warnings.append("Смысловое сравнение выполнено лексически: модель эмбеддингов недоступна")
    result.score = clamp01(sum(parts) / len(parts))
    return result
