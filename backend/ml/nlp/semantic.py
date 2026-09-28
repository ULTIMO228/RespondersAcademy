"""Смысловое сравнение текстов (FR-038, Q&A «сравнение смысловое, не побуквенное»).

`similarity(a, b)` — косинус эмбеддингов rubert-tiny2; `covers_key_phrases(text, phrases, threshold)` —
доля ключевых фраз эталона, покрытых текстом (фраза покрыта, если похожа на текст целиком или на одно из
его предложений/фрагментов). Без модели — лексический фолбэк: покрытие основ слов (порт мок-оценки фронта),
результат помечается `available=False`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import numpy as np

from ml.nlp import embedder

DEFAULT_THRESHOLD = 0.62
WORD_PATTERN = re.compile(r"[а-яa-z0-9]+")
SENTENCE_SPLIT = re.compile(r"[.;!?\n]+|,\s*(?=[а-яё])")
MIN_WORD_LENGTH = 3
STEM_LENGTH = 5


def stems(text: str) -> list[str]:
    words = WORD_PATTERN.findall(text.lower().replace("ё", "е"))
    return [w[:STEM_LENGTH] for w in words if len(w) >= MIN_WORD_LENGTH]


def _stem_matches(s1: str, s2: str) -> bool:
    return s1 == s2 or (
        len(s1) >= MIN_WORD_LENGTH
        and len(s2) >= MIN_WORD_LENGTH
        and (s1.startswith(s2) or s2.startswith(s1))
    )


def lexical_coverage(phrase: str, text: str) -> float:
    """Доля основ слов фразы, встретившихся в тексте (регистр, ё, словоформы с общей основой не важны)."""
    phrase_stems = stems(phrase)
    if not phrase_stems:
        return 1.0
    text_stems = set(stems(text))
    return sum(1 for s in phrase_stems if any(_stem_matches(s, ts) for ts in text_stems)) / len(phrase_stems)


def lexical_similarity(a: str, b: str) -> float:
    """Коэффициент Дайса по основам слов — симметричный лексический фолбэк для similarity()."""
    sa, sb = set(stems(a)), set(stems(b))
    if not sa or not sb:
        return 1.0 if sa == sb else 0.0
    matched_a = sum(1 for a_stem in sa if any(_stem_matches(a_stem, b_stem) for b_stem in sb))
    matched_b = sum(1 for b_stem in sb if any(_stem_matches(b_stem, a_stem) for a_stem in sa))
    return (matched_a + matched_b) / (len(sa) + len(sb))


def _fragments(text: str) -> list[str]:
    parts = [p.strip() for p in SENTENCE_SPLIT.split(text) if p and p.strip()]
    return [text.strip(), *parts] if parts else [text.strip()]


@dataclass(frozen=True)
class SemanticResult:
    score: float  # 0..1
    available: bool  # True — эмбеддинги; False — лексический фолбэк
    details: dict[str, float]


def similarity(a: str, b: str) -> SemanticResult:
    """Косинусная близость двух текстов (0..1); фолбэк — лексическая близость."""
    if not a.strip() or not b.strip():
        return SemanticResult(score=0.0, available=embedder.available(), details={})
    vectors = embedder.encode([a, b])
    if vectors is None:
        return SemanticResult(score=lexical_similarity(a, b), available=False, details={})
    cosine = float(np.clip(np.dot(vectors[0], vectors[1]), -1.0, 1.0))
    return SemanticResult(score=max(0.0, cosine), available=True, details={})


def phrase_scores(text: str, phrases: list[str]) -> tuple[dict[str, float], bool]:
    """Для каждой фразы — лучшая близость к тексту или его фрагменту; флаг доступности модели."""
    phrases = [p for p in phrases if p and p.strip()]
    if not phrases:
        return {}, embedder.available()
    if not text.strip():
        return {p: 0.0 for p in phrases}, embedder.available()
    fragments = _fragments(text)
    vectors = embedder.encode([*phrases, *fragments])
    if vectors is None:
        return {p: lexical_coverage(p, text) for p in phrases}, False
    phrase_vectors = vectors[: len(phrases)]
    fragment_vectors = vectors[len(phrases) :]
    matrix = phrase_vectors @ fragment_vectors.T
    best = matrix.max(axis=1)
    scores: dict[str, float] = {}
    for phrase, cosine in zip(phrases, best, strict=True):
        # Лексическое покрытие подстраховывает эмбеддер на коротких фразах («ОДС-3», номера служб).
        scores[phrase] = float(max(np.clip(cosine, 0.0, 1.0), lexical_coverage(phrase, text) if lexical_coverage(phrase, text) >= 0.99 else 0.0))
    return scores, True


def covers_key_phrases(text: str, phrases: list[str], threshold: float = DEFAULT_THRESHOLD) -> SemanticResult:
    """Доля ключевых фраз, покрытых текстом (близость ≥ threshold). Нет фраз → 1.0."""
    scores, available = phrase_scores(text, phrases)
    if not scores:
        return SemanticResult(score=1.0, available=available, details={})
    if available:
        covered = sum(1 for value in scores.values() if value >= threshold)
    else:
        covered = sum(scores.values())  # лексический фолбэк — непрерывное покрытие, как в моке фронта
    return SemanticResult(score=covered / len(scores), available=available, details=scores)


def missing_key_phrases(text: str, phrases: list[str], threshold: float = DEFAULT_THRESHOLD) -> list[str]:
    scores, available = phrase_scores(text, phrases)
    limit = threshold if available else 0.5
    return [phrase for phrase, value in scores.items() if value < limit]
