"""PDF карты ошибок и журнала для печати на занятии (фича 003, T049, FR-022).

Два слоя. `build_document` собирает из тех же ответов сервиса, что видит экран, плоскую структуру `PdfDocument`
(заголовок, фильтры, дата, вывод, таблица, легенда) — её можно проверять без разбора PDF. `render_pdf` рисует
структуру через reportlab: `landscape(A4)`, локальный кириллический шрифт из репозитория (общий с отчётами,
`report_export.FONT_PATH`), сеть не нужна.

Печать чёрно-белая: уровень в таблице — значок и слово («! часто», «~ иногда», «✓ редко», «○ мало данных»), как на
экране (SC-006); цвет в документе не несёт смысла. Пороги светофора напечатаны в легенде, чтобы лист был понятен
без экрана. Доступ проверяют те же функции сервиса, что и экраны (401/403/404 приходят оттуда).
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Literal
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import LongTable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer
from app.services import error_map_service
from app.services.error_map_settings import ErrorMapSettings, read_error_map_settings
from app.services.report_export import FONT_PATH
from app.services.time import MOSCOW

Scope = Literal["group", "student", "journal"]
Mode = Literal["operator112", "dds"]
Period = Literal["2w", "1m", "all"]

FONT_NAME = "DejaVu"
PAGE_WIDTH = landscape(A4)[0] - 2 * 28  # ширина области таблицы при полях 28 pt

# Значки и слова уровней совпадают с `src/entities/error-map/model/levels.ts` (экран) — лист читается так же, как экран.
LEVELS: dict[str, tuple[str, str]] = {
    "rare": ("✓", "редко"),
    "sometimes": ("~", "иногда"),
    "often": ("!", "часто"),
    "noData": ("○", "мало данных"),
}
COMPARISONS = {"better": "лучше группы", "same": "как у группы", "worse": "хуже группы"}
PERIOD_LABELS = {"2w": "2 недели", "1m": "месяц", "all": "всё время"}
MODE_LABELS = {"dds": "ДДС", "operator112": "специалист-112"}
NO_VALUE = "—"


@dataclass(frozen=True, slots=True)
class PdfDocument:
    """Содержимое листа до рисования: всё, что напечатано, лежит в этих полях."""

    scope: Scope
    title: str
    subtitle: str
    headline: str | None
    columns: list[str]
    rows: list[list[str]]
    legend: str
    notes: list[str] = field(default_factory=list)


def level_text(level: str) -> str:
    icon, word = LEVELS[level]
    return f"{icon} {word}"


def _percent(value: float) -> str:
    return f"{value * 100:g}"


def _legend(settings: ErrorMapSettings) -> str:
    marks = " · ".join(level_text(level) for level in ("rare", "sometimes", "often", "noData"))
    return (
        f"Значки: {marks}. Пороги: «иногда» — от {_percent(settings.sometimes_from)}%, "
        f"«часто» — выше {_percent(settings.often_from)}% попыток с ошибкой на этапе."
    )


def _share_text(attempts: int, with_error: int, share: float | None) -> str:
    if share is None:
        return f"попыток: {attempts}"
    return f"{round(share * 100)}% ({with_error} из {attempts})"


def _subtitle(parts: list[str], period: str, mode: str, attempts: int | None, today: date) -> str:
    items = [*parts, f"Период: {PERIOD_LABELS[period]}", f"Режим: {MODE_LABELS[mode]}"]
    if attempts is not None:
        items.append(f"Оценённых попыток: {attempts}")
    items.append(f"Сформировано: {today.strftime('%d.%m.%Y')}")
    return " · ".join(items)


async def build_document(
    db: AsyncSession,
    viewer: Viewer | None,
    *,
    scope: Scope,
    group_id: str | None = None,
    student_id: str | None = None,
    mode: Mode,
    period: Period,
    today: date | None = None,
) -> PdfDocument:
    """Структура листа для `scope`; доступ и 404 — те же, что у соответствующих эндпоинтов карты."""
    day = today or datetime.now(MOSCOW).date()
    settings = await read_error_map_settings(db)
    legend = _legend(settings)

    if scope == "journal":
        assert group_id is not None
        journal = await error_map_service.journal(db, viewer, group_id, mode, period)
        titles = [stage.title for stage in journal.stages]
        rows = [
            [row.name, str(row.attempts), *[level_text(level.level) for level in row.levels]] for row in journal.rows
        ]
        notes = [] if any(row.attempts for row in journal.rows) else ["За выбранный период попыток нет."]
        return PdfDocument(
            scope=scope,
            title=f"Журнал группы {group_id}",
            subtitle=_subtitle([], period, mode, sum(row.attempts for row in journal.rows), day),
            headline=None,
            columns=["Обучающийся", "Попыток", *titles],
            rows=rows,
            legend=legend,
            notes=notes,
        )

    if scope == "student":
        assert student_id is not None
        data = await error_map_service.student_map(db, viewer, student_id, mode, period)
        title = f"Карта ошибок обучающегося: {data.scope.title}"
        parts = [f"Группа: {data.scope.group_id}"] if data.scope.group_id else []
    else:
        assert group_id is not None
        data = await error_map_service.group_map(db, viewer, group_id, mode, period)
        title = f"Карта ошибок группы {group_id}"
        parts = []

    levels = {level.stage_id: level for level in data.levels}
    columns = ["Этап", "Уровень", "Доля попыток с ошибкой"]
    columns.append("Сравнение с группой" if scope == "student" else "Затронуто обучающихся")
    rows = []
    for stage in data.stages:
        level = levels[stage.id]
        row = [stage.title, level_text(level.level), _share_text(level.attempts, level.attempts_with_error, level.share)]
        if scope == "student":
            row.append(COMPARISONS.get(level.comparison, NO_VALUE) if level.comparison else NO_VALUE)
        else:
            row.append(str(level.affected_students) if level.level != "noData" else NO_VALUE)
        rows.append(row)
    return PdfDocument(
        scope=scope,
        title=title,
        subtitle=_subtitle(parts, period, mode, data.attempts, day),
        headline=data.headline.text,
        columns=columns,
        rows=rows,
        legend=legend,
        notes=[] if data.attempts else ["За выбранный период попыток нет."],
    )


def pdf_filename(scope: Scope, group_id: str | None, student_id: str | None) -> str:
    """Имя файла для заголовка ответа: понятное и без служебных символов (кодирует вызывающий)."""
    if scope == "student":
        return f"error-map-student-{student_id}.pdf"
    return f"error-map-{'journal-' if scope == 'journal' else ''}{group_id}.pdf"


def xlsx_filename(scope: Scope, group_id: str | None, student_id: str | None) -> str:
    return pdf_filename(scope, group_id, student_id).removesuffix(".pdf") + ".xlsx"


def render_xlsx(document: PdfDocument) -> bytes:
    """Excel с теми же заголовком, таблицей и пояснениями, что и в PDF (`Sheet` из общего модуля выгрузки)."""
    from app.services.xlsx_export import Sheet
    from app.services.xlsx_export import render_xlsx as render

    heading = [document.title, document.subtitle]
    if document.headline:
        heading.append(document.headline)
    sheet_title = {"group": "Карта группы", "student": "Карта обучающегося", "journal": "Журнал группы"}[document.scope]
    notes = [*document.notes, document.legend]
    # Целые числа (попытки, число обучающихся) — числами: Excel сортирует и считает по ним.
    rows = [[int(cell) if cell.isdigit() else cell for cell in row] for row in document.rows]
    return render([Sheet(sheet_title, document.columns, rows, heading=heading, notes=notes)])


def _ensure_font() -> None:
    if FONT_NAME not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(FONT_NAME, str(FONT_PATH)))


def _column_widths(document: PdfDocument) -> list[float]:
    count = len(document.columns)
    if document.scope == "journal":
        # «происшествия» при 8 pt — 60,8 pt: столбец при 9 этапах (с «Прочее») не уже 69 pt, имена обучающихся переносятся.
        first, attempts = 112.0, 46.0
        rest = (PAGE_WIDTH - first - attempts) / max(count - 2, 1)
        return [first, attempts, *[rest] * (count - 2)]
    weights = [3.0, 2.0, 2.2, 2.2][:count]
    unit = PAGE_WIDTH / sum(weights)
    return [weight * unit for weight in weights]


def render_pdf(document: PdfDocument) -> bytes:
    """Рисует лист: заголовок, фильтры, вывод в рамке, таблица, легенда. Без сети, шрифт встроен в файл."""
    _ensure_font()
    output = io.BytesIO()
    doc = SimpleDocTemplate(
        output,
        pagesize=landscape(A4),
        leftMargin=28,
        rightMargin=28,
        topMargin=28,
        bottomMargin=34,
        title=document.title,
        subject=document.subtitle,
        author="Responders Academy",
    )
    title_style = ParagraphStyle("title", fontName=FONT_NAME, fontSize=18, leading=23, spaceAfter=4)
    meta_style = ParagraphStyle("meta", fontName=FONT_NAME, fontSize=10, leading=14, spaceAfter=10)
    headline_style = ParagraphStyle("headline", fontName=FONT_NAME, fontSize=14, leading=19)
    cell_style = ParagraphStyle("cell", fontName=FONT_NAME, fontSize=10, leading=13, splitLongWords=True)
    note_style = ParagraphStyle("note", fontName=FONT_NAME, fontSize=10, leading=14, spaceBefore=8)

    def para(value: str, style: ParagraphStyle = cell_style) -> Paragraph:
        return Paragraph(escape(value).replace("\n", "<br/>"), style)

    story: list[Any] = [para(document.title, title_style), para(document.subtitle, meta_style)]
    if document.headline:
        box = Table([[para(document.headline, headline_style)]], colWidths=[PAGE_WIDTH])
        box.setStyle(
            TableStyle(
                [
                    ("BOX", (0, 0), (-1, -1), 1.2, colors.black),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )
        story += [box, Spacer(1, 10)]

    # В журнале до девяти узких столбцов: заголовки мельче и без широких отступов, чтобы слова не рвались посередине.
    narrow = document.scope == "journal"
    head_style = ParagraphStyle("head", parent=cell_style, fontSize=8, leading=10) if narrow else cell_style
    pad = 4 if narrow else 6
    data = [
        [para(name, head_style) for name in document.columns],
        *[[para(cell) for cell in row] for row in document.rows],
    ]
    table = LongTable(data, colWidths=_column_widths(document), repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e5edf5")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), pad),
                ("RIGHTPADDING", (0, 0), (-1, -1), pad),
            ]
        )
    )
    story.append(table)
    story.append(para(document.legend, note_style))
    for note in document.notes:
        story.append(para(note, note_style))

    def footer(canvas: Any, page: Any) -> None:
        canvas.saveState()
        canvas.setFont(FONT_NAME, 9)
        canvas.drawRightString(landscape(A4)[0] - 28, 18, f"Страница {page.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return output.getvalue()
