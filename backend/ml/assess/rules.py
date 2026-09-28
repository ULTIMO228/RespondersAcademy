"""Реестр правил оценщика (принцип II конституции): у каждого правила — источник и текст пояснения.

Режим B (ДДС): семь нарушений отдела контроля реагирования из памятки «Работа с АРМ-112 для ДДС»
(ОКР ГСИ, стр. 28–31), тайминги из Q&A заказчика (30 с / 3 мин), решение и служба-получатель
по классификатору ЕКП (эталон сценария), адрес по справочнику улиц (Q&A «Дубнинская/Дубининская»),
признаки угадывания и многозадачность — решения команды, зафиксированные в spec 002.

`Evaluation.errors[].message` = «<текст> — <source>» (одна строка, объяснимая преподавателю).
"""

from __future__ import annotations

from dataclasses import dataclass

from ml.assess.types import AssessError

MEMO = "памятка «Работа с АРМ-112 для ДДС» (ОКР ГСИ), стр. 28–31"
QA_TIMING = "Q&A заказчика: норматив первичной реакции 30 с, полной отработки 3 мин"
EKP = "классификатор ЕКП и эталон сценария (список оповещения карточки)"
QA_ADDRESS = "Q&A заказчика: адрес проверяется по справочнику улиц Москвы («Дубнинская» / «Дубининская»)"
TEAM = "решение команды (spec 002-two-mode-simulator"
SCENARIO = "критерии успеха сценария (Scenario.successCriteria)"
ETALON = "эталон сценария (Scenario.etalon)"


@dataclass(frozen=True)
class Rule:
    id: str
    error_type: str
    severity: str  # critical | major | minor
    source: str
    text: str  # шаблон пояснения (str.format по именованным полям)

    def error(
        self,
        step: str | None = None,
        fixed: bool = False,
        field_path: str | None = None,
        evidence_key: str | None = None,
        observed: str | None = None,
        expected: str | None = None,
        detector: str = "rule",
        **fields: object,
    ) -> AssessError:
        format_kwargs = dict(fields)
        if expected is not None:
            format_kwargs.setdefault("expected", expected)
        try:
            text = self.text.format(**format_kwargs) if format_kwargs else self.text
        except KeyError:
            # Если каких-то полей нет, дополняем дефолтами
            import collections
            text = collections.defaultdict(str, format_kwargs)
            text = self.text.format_map(collections.defaultdict(lambda: "—", format_kwargs))
        ev_key = evidence_key or (f"event:{step}" if step else (f"field:{field_path}" if field_path else f"rule:{self.id}"))
        obs = observed or text
        exp = expected or (str(fields.get("expected")) if "expected" in fields else None)
        return AssessError(
            rule_id=self.id,
            type=self.error_type,
            severity=self.severity,
            message=f"{text} — {self.source}",
            step=step,
            fixed=fixed,
            evidence_key=ev_key,
            field_path=field_path,
            observed=obs,
            expected=exp,
            source_ref=self.source,
            detector=detector,
        )


RULES: dict[str, Rule] = {}


def _register(rule: Rule) -> Rule:
    if rule.id in RULES:
        raise ValueError(f"duplicate rule id: {rule.id}")
    RULES[rule.id] = rule
    return rule


# ─── Семь нарушений памятки (режим B) ──────────────────────────────────────────────────────────────

V1_NO_PRIMARY_STATUS = _register(Rule("v1", "noPrimaryStatus", "critical", f"{MEMO}, нарушение №1", "Отсутствует статус реагирования: по карточке не проставлено ни «Принята», ни «Не принята»"))
V2_WRONG_DECISION = _register(Rule("v2", "wrongDecision", "critical", f"{MEMO}, нарушение №2", "Статус реагирования не соответствует заявке: проставлено «{actual}», ожидалось «{expected}»{hint}"))
V2_TRAP_MISSED = _register(Rule("v2t", "wrongDecision", "critical", f"{MEMO}, нарушение №2", "Не распознана ловушка ({trap}): проставлено «{actual}», ожидалось «{expected}»{hint}"))
TRAP_NOT_DETECTED = _register(Rule("tr1", "trapNotDetected", "critical", f"{ETALON}; {MEMO}, нарушение №2", "Не распознана ловушка ({trap}): проставлено «{actual}», ожидалось «{expected}»{hint}"))
V3_REFUSED_PROFILE = _register(Rule("v3", "refusedProfile", "critical", f"{MEMO}, нарушение №3", "Отказ от реагирования на профильное происшествие: проставлено «{actual}», ожидалось «{expected}»"))
V4_MISSING_COMMENT = _register(Rule("v4", "missingComment", "critical", f"{MEMO}, нарушение №4", "Нет комментария к статусу «{status}»: укажите причину и кому передана информация"))
V5_INCOMPLETE_COMMENT = _register(Rule("v5", "incompleteComment", "major", f"{MEMO}, нарушение №5", "Неполный комментарий к статусу «{status}»: не указано {missing}"))
V6_NO_PROGRESS_STATUS = _register(Rule("v6", "noProgressStatus", "major", f"{MEMO}, нарушение №6", "Отсутствует статус хода выполнения работ «{status}» после полученной информации о ходе реагирования"))
V6_NO_PROGRESS_COMMENT = _register(Rule("v6c", "noProgressStatus", "minor", f"{MEMO}, нарушение №6", "Статус хода работ «{status}» без комментария о ходе реагирования"))
V6_STATUS_WITHOUT_BASIS = _register(Rule("v6b", "statusWithoutBasis", "major", f"{MEMO}, нарушение №6; сообщение о ходе работ", "Статус «{status}» поставлен до получения информации о ходе работ"))
V6_STATUS_LATE = _register(Rule("v6l", "statusAfterInformationLate", "major", f"{MEMO}, нарушение №6; расписание сообщения о ходе работ", "Статус «{status}» поставлен через {delay} с после сообщения (допустимо {window} с)"))
V7_NO_CONTACT = _register(Rule("v7", "noContact", "major", f"{MEMO}, нарушение №7", "Не обеспечена оперативная связь: не отвечено на звонок отдела контроля / руководителя смены ({number})"))

# ─── Тайминги (Q&A) ───────────────────────────────────────────────────────────────────────────────

TIME_REACTION = _register(Rule("t1", "timeReactionExceeded", "major", QA_TIMING, "Превышен норматив первичной реакции: {fact} с (норма {norm} с)"))
TIME_PROCESSING = _register(Rule("t2", "timeProcessingExceeded", "major", QA_TIMING, "Превышено время полной отработки: {fact} с (норма {norm} с)"))
TIME_NOT_COMPLETED = _register(Rule("t3", "timeNotCompleted", "major", QA_TIMING, "Отработка карточки не завершена к окончанию занятия"))

# ─── Решение и служба-получатель (ЕКП / эталон) ───────────────────────────────────────────────────

MISSED_CALL = _register(Rule("d1", "missedRequiredCall", "critical", EKP, "Пропущен ожидаемый звонок точке C: {target}"))
WRONG_RECIPIENT = _register(Rule("d2", "wrongRecipient", "major", EKP, "Информация передана не той службе: звонок {actual}, ожидалось {expected}"))
TRANSFER_MISSING = _register(Rule("d3", "transferMissing", "major", EKP, "Не выполнен перевод вызова в ЦУС другого региона (происшествие вне зоны ответственности)"))
DUPLICATE_MISSED = _register(Rule("d4", "wrongDecision", "major", f"{MEMO}, нарушение №4 (дубль)", "Карточка — дубль карточки {original}: ожидалось «Не принята: дубль, реагирование по КП»"))

# ─── Статусы хода работ (эталон + памятка №6) ─────────────────────────────────────────────────────

STATUS_MISSING = _register(Rule("s1", "statusMissing", "major", f"{ETALON}; {MEMO}, нарушение №6", "Не проставлен ожидаемый статус ДДС «{status}»"))
STATUS_ORDER = _register(Rule("s2", "statusSequenceOrder", "minor", f"{ETALON}; граф статусов reference.ddsStatuses", "Нарушен порядок статусов относительно эталона: {actual}"))
STATUS_NOT_CLOSED = _register(Rule("s3", "statusMissing", "major", f"{MEMO}, статус «Не завершено»", "Карточка не закрыта: нет статуса «Работы завершены» или «Отказ от выполнения работ»"))

# ─── Комментарии и смысл ──────────────────────────────────────────────────────────────────────────

KEY_PHRASE_MISSING = _register(Rule("c1", "keyPhraseMissing", "minor", f"{ETALON}: keyPhrases; Q&A «сравнение смысловое, не побуквенное»", "В действиях диспетчера не отражено: {phrases}"))
REPORT_INCOMPLETE = _register(Rule("c2", "reportIncomplete", "minor", f"{TEAM}, FR-035i): чек-лист доклада точке C", "В докладе по телефону не прозвучало: {items}"))

# ─── Поля и грамотность (критерии сценария) ───────────────────────────────────────────────────────

FIELD_MISSING = _register(Rule("f1", "requiredFieldMissing", "major", f"{SCENARIO}: requiredFields", "Не заполнено обязательное поле «{field}»"))
GRAMMAR_LIMIT = _register(Rule("g1", "grammarLimitExceeded", "major", f"{SCENARIO}: maxGrammarErrors", "Грамматических ошибок: {count} (допустимо {limit})"))

# ─── Адрес (Q&A) ──────────────────────────────────────────────────────────────────────────────────

ADDRESS_LOOKALIKE = _register(Rule("a1", "addressLookalike", "major", QA_ADDRESS, "Похожая улица: введено «{entered}», по билету «{expected}»"))
ADDRESS_TYPO = _register(Rule("a2", "addressTypo", "minor", QA_ADDRESS, "Опечатка в названии улицы: «{entered}» (справочник: «{expected}»)"))
ADDRESS_MISMATCH = _register(Rule("a3", "addressMismatch", "critical", QA_ADDRESS, "Адрес не совпадает с билетом: введено «{entered}», ожидалось «{expected}»"))
ADDRESS_UNKNOWN = _register(Rule("a4", "addressUnknown", "major", QA_ADDRESS, "Улица «{entered}» не найдена в справочнике улиц Москвы"))

# ─── Многозадачность и угадывание (решения команды) ───────────────────────────────────────────────

PARALLEL_IGNORED = _register(Rule("m1", "parallelCardIgnored", "major", f"{TEAM}, FR-035f): реакция на параллельные карточки", "Параллельная карточка {card} не открыта в норматив реакции ({norm} с) во время работы с текущей"))
GUESSING = _register(Rule("x1", "guessing", "minor", f"{TEAM}, FR-042): порог чтения карточки", "Возможное угадывание: решение принято через {fact} с после открытия карточки (порог {threshold} с)"))


# ─── Режим A (специалист-112): опросная карта, адрес, факты, заявитель (FR-036) ───────────────────

MEMO_CARD = "памятка «Работа на АРМ-112» (ГБУ «Система 112»), стр. 12–20: карточка ПОВ-112 (заявитель, адресный блок, описание, опросная карта, список оповещения)"
MEMO_POLL = "памятка «Работа на АРМ-112», стр. 15: опросная карта → итоговый тип → список оповещения по ЕКП"
QA_CALL = "Q&A заказчика и FR-011: ответ на вызов в 30 с, неответ фиксируется как событие"
FACTS = f"{TEAM}, FR-036d): факты записи заявителя сверяются по смыслу, а не побуквенно"

OP_ANSWER_TIMEOUT = _register(Rule("op-t1", "answerTimeout", "major", QA_CALL, "Вызов принят с опозданием: {fact} с (норматив {norm} с)"))
OP_NOT_ANSWERED = _register(Rule("op-t0", "answerTimeout", "critical", QA_CALL, "Вызов не принят: заявитель не получил ответа оператора"))
OP_PROCESSING = _register(Rule("op-t2", "timeProcessingExceeded", "major", QA_TIMING, "Превышено время до отправки карточки: {fact} с (норма {norm} с)"))
OP_NOT_SUBMITTED = _register(Rule("op-t3", "timeNotCompleted", "critical", f"{MEMO_CARD}; FR-016", "Карточка не отправлена: попытка не завершена"))

OP_WRONG_FINAL_TYPE = _register(Rule("op-f1", "wrongFinalType", "critical", MEMO_POLL, "Неверный итоговый тип: выбрано «{actual}», по билету ожидался тип группы «{expected}»{missing}"))
OP_NO_FINAL_TYPE = _register(Rule("op-f0", "wrongFinalType", "critical", MEMO_POLL, "Итоговый тип не определён: опросная карта не заполнена (ожидался тип группы «{expected}»)"))
OP_MISSING_SERVICE = _register(Rule("op-f2", "missingService", "major", f"{EKP}; {MEMO_CARD}", "В списке оповещения нет ожидаемой службы: {services}"))
OP_MISSING_SIGN = _register(Rule("op-s1", "missingSign", "major", MEMO_POLL, "Не выставлен признак «{sign}» из билета"))
OP_MISSING_FLAG = _register(Rule("op-s2", "missingSign", "major", f"{MEMO_CARD}: флаги «Пострадавшие» / «Отказ от СМП»", "Не выставлен признак «{flag}», хотя по билету {reason}"))
OP_EXTRA_FLAG = _register(Rule("op-s3", "extraFlag", "minor", f"{MEMO_CARD}: флаги ЧС/ЧП", "Флаг «{flag}» выставлен без оснований по билету"))
OP_LOST_FACT = _register(Rule("op-d1", "lostFact", "major", FACTS, "Потерян ключевой факт записи: «{fact}» не отражён в описании"))
OP_EMPTY_DESCRIPTION = _register(Rule("op-d0", "lostFact", "critical", f"{MEMO_CARD}: описание со слов заявителя", "Описание со слов заявителя не заполнено"))
OP_APPLICANT_NAME = _register(Rule("op-a1", "applicantMismatch", "major", f"{MEMO_CARD}: блок «Заявитель»", "Заявитель записан неверно: введено «{entered}», по записи «{expected}»"))
OP_APPLICANT_STATUS = _register(Rule("op-a2", "applicantMismatch", "minor", f"{MEMO_CARD}: статус заявителя", "Статус заявителя: введено «{entered}», по записи «{expected}»"))
OP_PHONE = _register(Rule("op-a3", "phoneMismatch", "major", f"{MEMO_CARD}: телефон предоставленный", "Телефон заявителя записан неверно: введено «{entered}», по записи «{expected}»"))
OP_PHONE_MISSING = _register(Rule("op-a4", "phoneMismatch", "minor", f"{MEMO_CARD}: телефон предоставленный", "Телефон заявителя не записан (по записи «{expected}»)"))
OP_ADDRESS_MISSING = _register(Rule("op-a5", "addressMismatch", "critical", f"{MEMO_CARD}: адресный блок", "Адрес происшествия не заполнен"))


def by_type(error_type: str) -> list[Rule]:
    return [rule for rule in RULES.values() if rule.error_type == error_type]
