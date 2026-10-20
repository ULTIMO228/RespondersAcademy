"""Excel и PDF сводной успеваемости (спека 005, T004): те же числа, что в `PerformanceReport` на экране.

Excel собирает общий модуль `xlsx_export` (листы «Сводка», «Группы», «Обучающиеся», «Ошибки», «Параметры»).
PDF — одна-две страницы «для руководства»: ключевые числа, таблица групп и зона риска; шрифт встроен, сети нет.
"""

from __future__ import annotations

import io
from datetime import date
from typing import Any, Final
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import LongTable, Paragraph, SimpleDocTemplate, Spacer, TableStyle

from app.schemas.performance import PerformanceReport, PerformanceStats
from app.services.error_map_pdf import FONT_NAME, PAGE_WIDTH, _ensure_font
from app.services.xlsx_export import Sheet, render_xlsx

MODE_LABELS: Final = {"all": "ДДС и специалист-112", "dds": "ДДС", "operator112": "специалист-112"}
PERIOD_LABELS: Final = {"2w": "2 недели", "1m": "месяц", "all": "всё время"}
LEVEL_LABELS: Final = {"ok": "в норме", "risk": "зона риска", "noData": "мало данных"}
NO_VALUE: Final = "—"
STAT_COLUMNS: Final = [
    "Обучающихся",
    "Активных",
    "Попыток",
    "Средний балл",
    "Изменение к прошлому периоду",
    "Реакция в норме, %",
    "Отработка в норме, %",
    "Экзаменов",
    "Сдано",
    "Слабый этап",
    "Оценка",
]


def period_label(report: PerformanceReport) -> str:
    filters = report.filters
    if filters.period == "range":
        return f"{filters.date_from} — {filters.date_to}"
    return PERIOD_LABELS[filters.period]


def _percent(share: float | None) -> float | None:
    return None if share is None else round(share * 100, 1)


def stat_cells(stats: PerformanceStats) -> list[Any]:
    """Значения в порядке `STAT_COLUMNS`; пусто — нет данных (число не выдумывается)."""
    return [
        stats.students,
        stats.active_students,
        stats.attempts,
        stats.avg_score,
        stats.delta,
        _percent(stats.reaction_in_norm_share),
        _percent(stats.processing_in_norm_share),
        stats.exams,
        stats.exams_passed,
        stats.weak_stage or NO_VALUE,
        LEVEL_LABELS[stats.level],
    ]


def _parameters(report: PerformanceReport, generated_by: str, scope_title: str) -> list[list[Any]]:
    filters = report.filters
    return [
        ["Период", period_label(report)],
        ["Режим", MODE_LABELS[filters.mode]],
        ["Охват", scope_title],
        ["Группа", filters.group_id or "все доступные"],
        ["Сформировано", report.generated_at],
        ["Сформировал", generated_by],
        ["Минимум попыток обучающегося / группы", f"{report.thresholds.min_attempts_student} / {report.thresholds.min_attempts_group}"],
        ["Зона риска: средний балл ниже", report.thresholds.risk_score],
    ]


def render_xlsx_report(report: PerformanceReport, *, generated_by: str, scope_title: str) -> bytes:
    heading = ["Успеваемость обучающихся", f"Период: {period_label(report)} · Режим: {MODE_LABELS[report.filters.mode]}"]
    totals = Sheet(
        "Сводка",
        ["Показатель", "Значение"],
        [[name, value] for name, value in zip(STAT_COLUMNS, stat_cells(report.totals), strict=True)],
        heading=heading,
    )
    groups = Sheet(
        "Группы",
        ["Группа", *STAT_COLUMNS],
        [[row.title, *stat_cells(row.stats)] for row in report.groups],
        heading=[*heading, "Сравнение групп"],
        notes=[] if report.groups else ["Нет групп в выбранном охвате."],
    )
    students = Sheet(
        "Обучающиеся",
        ["ФИО", "Группа", *STAT_COLUMNS[2:]],
        [[row.name, row.group_id or "Без группы", *stat_cells(row.stats)[2:]] for row in report.students],
        heading=[*heading, "Успеваемость по обучающимся"],
        notes=[] if report.students else ["Нет обучающихся в выбранном охвате."],
    )
    errors = Sheet(
        "Ошибки",
        ["Типичная ошибка", "Попыток с ошибкой"],
        [[item.label, item.attempts] for item in report.top_errors],
        heading=[*heading, "Чаще всего встречается"],
        notes=[] if report.top_errors else ["Ошибок за период нет."],
    )
    params = Sheet("Параметры", ["Параметр", "Значение"], _parameters(report, generated_by, scope_title), heading=["Параметры отчёта"])
    return render_xlsx([totals, groups, students, errors, params])


def pdf_filename(today: date) -> str:
    return f"performance-{today.isoformat()}.pdf"


def xlsx_filename(today: date) -> str:
    return f"performance-{today.isoformat()}.xlsx"


def render_pdf_report(report: PerformanceReport, *, generated_by: str, scope_title: str) -> bytes:
    """Краткая сводка: заголовок, ключевые числа, таблица групп, список «зона риска»; легенда и параметры внизу."""
    _ensure_font()
    output = io.BytesIO()
    doc = SimpleDocTemplate(
        output,
        pagesize=landscape(A4),
        leftMargin=28,
        rightMargin=28,
        topMargin=28,
        bottomMargin=34,
        title="Успеваемость обучающихся",
        author="Responders Academy",
    )
    title = ParagraphStyle("title", fontName=FONT_NAME, fontSize=18, leading=23, spaceAfter=4)
    meta = ParagraphStyle("meta", fontName=FONT_NAME, fontSize=10, leading=14, spaceAfter=10)
    section = ParagraphStyle("section", fontName=FONT_NAME, fontSize=13, leading=18, spaceBefore=12, spaceAfter=6, keepWithNext=True)
    cell = ParagraphStyle("cell", fontName=FONT_NAME, fontSize=9, leading=12, splitLongWords=True)

    def para(value: Any, style: ParagraphStyle = cell) -> Paragraph:
        return Paragraph(escape(NO_VALUE if value is None else str(value)).replace("\n", "<br/>"), style)

    def table(columns: list[str], rows: list[list[Any]], widths: list[float]) -> LongTable:
        data = [[para(name) for name in columns], *[[para(value) for value in row] for row in rows]]
        result = LongTable(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
        result.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e5edf5")),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        return result

    stats = report.totals
    story: list[Any] = [
        para("Успеваемость обучающихся", title),
        para(
            f"{scope_title} · Период: {period_label(report)} · Режим: {MODE_LABELS[report.filters.mode]} · "
            f"Сформировано: {report.generated_at[:10]} · Сформировал: {generated_by}",
            meta,
        ),
        para("Итого", section),
        table(
            ["Обучающихся", "Попыток", "Средний балл", "Реакция в норме", "Отработка в норме", "Экзамены (сдано)", "Оценка"],
            [
                [
                    stats.students,
                    stats.attempts,
                    NO_VALUE if stats.avg_score is None else stats.avg_score,
                    NO_VALUE if stats.reaction_in_norm_share is None else f"{_percent(stats.reaction_in_norm_share)}%",
                    NO_VALUE if stats.processing_in_norm_share is None else f"{_percent(stats.processing_in_norm_share)}%",
                    f"{stats.exams_passed} из {stats.exams}",
                    LEVEL_LABELS[stats.level],
                ]
            ],
            [PAGE_WIDTH / 7] * 7,
        ),
        para("Группы", section),
        table(
            ["Группа", "Обучающихся", "Попыток", "Средний балл", "Реакция в норме, %", "Слабый этап", "Оценка"],
            [
                [
                    row.title,
                    row.stats.students,
                    row.stats.attempts,
                    row.stats.avg_score,
                    _percent(row.stats.reaction_in_norm_share),
                    row.stats.weak_stage,
                    LEVEL_LABELS[row.stats.level],
                ]
                for row in report.groups
            ],
            [150, 90, 60, 75, 95, 210, PAGE_WIDTH - 680],
        ),
    ]
    risk = [row for row in report.students if row.stats.level == "risk"]
    story.append(para(f"Зона риска (средний балл ниже {report.thresholds.risk_score})", section))
    if risk:
        story.append(
            table(
                ["ФИО", "Группа", "Попыток", "Средний балл", "Слабый этап"],
                [[r.name, r.group_id or "Без группы", r.stats.attempts, r.stats.avg_score, r.stats.weak_stage] for r in risk],
                [200, 130, 70, 90, PAGE_WIDTH - 490],
            )
        )
    else:
        story.append(para("Обучающихся в зоне риска нет."))
    story += [
        Spacer(1, 8),
        para(
            f"Минимум попыток для вывода: обучающийся {report.thresholds.min_attempts_student}, группа "
            f"{report.thresholds.min_attempts_group}; «мало данных» — числа не выдумываются. Нормативы: реакция 30 с, отработка 3 мин.",
            cell,
        ),
    ]

    def footer(canvas: Any, page: Any) -> None:
        canvas.saveState()
        canvas.setFont(FONT_NAME, 9)
        canvas.drawRightString(landscape(A4)[0] - 28, 18, f"Страница {page.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return output.getvalue()
