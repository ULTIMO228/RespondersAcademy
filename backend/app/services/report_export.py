"""CSV/PDF: строка на попытку, живые оценки, локальный кириллический шрифт."""

from __future__ import annotations

import csv
import io
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import LongTable, Paragraph, SimpleDocTemplate, Spacer, TableStyle
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Viewer
from app.api.errors import forbidden, not_found
from app.models.report import GroupReport, Report
from app.models.session import Attempt, TrainingSession
from app.models.user import User
from app.services.evaluation_service import find_scenario_for_attempt
from app.services.report_builder import _norms_for, effective_score
from app.services.session_engine import evaluation_contract

HEADERS = ["Обучаемый", "АРМ", "Режим", "Формат", "Попытка", "Сценарий / карточка", "Реакция, мс", "Отклонение реакции, мс", "Отработка, мс", "Отклонение отработки, мс", "Ошибки по типам", "Балл", "Сдал / не сдал"]
FONT_PATH = Path(__file__).resolve().parents[2] / "data" / "fonts" / "DejaVuSans.ttf"
if not FONT_PATH.is_file():
    FONT_PATH = Path(__file__).resolve().parents[1] / "data" / "fonts" / "DejaVuSans.ttf"


async def export_data(db: AsyncSession, report_id: str, viewer: Viewer) -> dict[str, Any]:
    report = await db.get(Report, report_id)
    group = None if report else await db.get(GroupReport, report_id)
    target = report or group
    if target is None:
        raise not_found("Отчёт не найден")
    session = await db.get(TrainingSession, target.session_id)
    if viewer.is_student and (report is None or report.student_id != viewer.user_id):
        raise forbidden("Обучающемуся доступны только собственные результаты")
    if viewer.role == "teacher" and (session is None or session.teacher_id != viewer.user_id):
        raise forbidden("Отчёты занятия другого преподавателя недоступны")
    if session is None:
        raise not_found("Занятие отчёта не найдено")
    query = select(Attempt).where(Attempt.session_id == session.id)
    if report:
        query = query.where(Attempt.student_id == report.student_id)
    attempts = (await db.execute(query.order_by(Attempt.student_id, Attempt.seq, Attempt.id))).scalars().all()
    rows, norms_cache = [], {}
    for attempt in attempts:
        student = await db.get(User, attempt.student_id)
        scenario = await find_scenario_for_attempt(db, attempt, session)
        evaluation = await evaluation_contract(db, attempt.id)
        score = effective_score(evaluation)
        norms = await _norms_for(db, session, attempt, norms_cache)
        errors = Counter(e.get("type", "unknown") for e in (evaluation or {}).get("errors", []))
        errors.update(e.get("type", "unknown") for e in (evaluation or {}).get("grammarErrors", []))
        threshold = (session.exam or {}).get("passThreshold")
        passed = ""
        if session.format == "exam" and score is not None and isinstance(threshold, (int, float)) and not isinstance(threshold, bool):
            passed = "сдал" if score >= threshold else "не сдал"
        completed = bool(attempt.completed_at)
        rows.append([
            student.full_name if student else attempt.student_id,
            student.arm_number if student else "", attempt.mode, session.format, attempt.id,
            f"{scenario.id} / {attempt.card_id}" if scenario else attempt.card_id,
            attempt.primary_reaction_ms, attempt.primary_reaction_ms - norms["primaryReactionMs"],
            attempt.full_processing_ms if completed else "",
            attempt.full_processing_ms - norms["fullProcessingMs"] if completed else "",
            "; ".join(f"{key}: {value}" for key, value in sorted(errors.items())),
            score if score is not None else "", passed,
        ])
    return {"id": target.id, "sessionId": session.id, "generatedAt": target.generated_at, "rows": rows, "insights": list(group.group_insights or []) if group else []}


def _csv_cell(value: Any) -> Any:
    # Текст из ФИО/сценариев не должен превращаться в формулу при открытии в Excel.
    if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r", "\n")):
        return "'" + value
    return value


def render_csv(data: dict[str, Any]) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(HEADERS)
    writer.writerows([_csv_cell(v) for v in row] for row in data["rows"])
    return stream.getvalue().encode("utf-8-sig")


def render_pdf(data: dict[str, Any]) -> bytes:
    if "DejaVu" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("DejaVu", str(FONT_PATH)))
    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=landscape(A4), leftMargin=28, rightMargin=28, topMargin=28, bottomMargin=30, title=f"Отчёт {data['id']}", author="Responders Academy")
    cell_style = ParagraphStyle("cell", fontName="DejaVu", fontSize=7, leading=10, splitLongWords=True)
    heading_style = ParagraphStyle("heading", fontName="DejaVu", fontSize=16, leading=21, spaceAfter=10)
    section_style = ParagraphStyle("section", parent=heading_style, fontSize=11, leading=15, spaceBefore=12, keepWithNext=True)

    def para(value: Any) -> Paragraph:
        return Paragraph(escape(str(value)).replace("\n", "<br/>"), cell_style)

    def table(headers: list[str], rows: list[list[Any]], widths: list[float]) -> LongTable:
        result = LongTable([[para(v) for v in headers], *[[para(v) for v in row] for row in rows]], colWidths=widths, repeatRows=1, hAlign="LEFT")
        result.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e5edf5")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f7fa")]),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        return result

    story = [Paragraph("Отчёт по занятию", heading_style), para(f"{data['sessionId']} | {data['id']} | Сформирован: {data['generatedAt']}"), Spacer(1, 12)]
    rows = data["rows"]
    if not rows:
        story.append(para("Нет данных по попыткам."))
    else:
        # Две таблицы вместо 13 узких колонок; ключ попытки связывает времена и результат.
        story.append(table([HEADERS[i] for i in (0, 1, 2, 3, 4, 5, 11, 12)], [[r[i] for i in (0, 1, 2, 3, 4, 5, 11, 12)] for r in rows], [160, 35, 65, 65, 75, 225, 50, 55]))
        story.append(Paragraph("Времена и ошибки", section_style))
        story.append(table([HEADERS[i] for i in (4, 6, 7, 8, 9, 10)], [[r[i] for i in (4, 6, 7, 8, 9, 10)] for r in rows], [90, 85, 95, 85, 95, 280]))
        scores: dict[str, list[int]] = defaultdict(list)
        errors: Counter[str] = Counter()
        for row in rows:
            if isinstance(row[11], (int, float)):
                scores[f"{row[0]} (АРМ {row[1]})"].append(row[11])
            for entry in row[10].split("; "):
                if entry:
                    kind, count = entry.rsplit(": ", 1)
                    errors[kind] += int(count)
        story.append(Paragraph("Сводные показатели (графики в табличном виде)", section_style))
        story.append(table(["Обучаемый", "Оценённых попыток", "Средний балл"], [[name, len(values), f"{sum(values) / len(values):.1f}"] for name, values in scores.items()], [480, 150, 100]))
        if errors:
            story.append(Spacer(1, 12))
            story.append(table(["Тип ошибки", "Количество"], [[key, count] for key, count in sorted(errors.items())], [630, 100]))
    if data.get("insights"):
        story.append(Paragraph("Комментарий по группе", section_style))
        story.extend(para(text) for text in data["insights"])

    def footer(canvas, document):
        canvas.setFont("DejaVu", 7)
        canvas.drawRightString(landscape(A4)[0] - 28, 16, f"Responders Academy | {document.page}")

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return output.getvalue()
