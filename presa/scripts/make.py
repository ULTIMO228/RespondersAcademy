import copy, sys
from pptx import Presentation
from pptx.util import Emu, Inches
from lxml import etree

import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/"
B = ROOT + "assets/"
prs = Presentation(B + "template_base.pptx")
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
ns = {"a": A}


def S(n):
    return prs.slides[n - 1]


def shp(slide, sid):
    def walk(shapes):
        for sh in shapes:
            if sh.shape_id == sid:
                return sh
            if sh.shape_type == 6:
                r = walk(sh.shapes)
                if r is not None:
                    return r
        return None
    r = walk(slide.shapes)
    assert r is not None, sid
    return r


def set_paras(shape, items, size=None, color=None, nobullet=False, spc=None):
    """items: str | (label, text). Клонирует первый абзац и первый run шаблона."""
    txBody = shape._element.txBody
    paras = txBody.findall("a:p", ns)
    proto = copy.deepcopy(paras[0])
    for p in paras:
        txBody.remove(p)
    runs = proto.findall("a:r", ns)
    if runs:
        proto_r = copy.deepcopy(runs[0])
    else:
        proto_r = etree.SubElement(proto, "{%s}r" % A)
        etree.SubElement(proto_r, "{%s}rPr" % A).set("lang", "ru-RU")
        etree.SubElement(proto_r, "{%s}t" % A)
        proto_r = copy.deepcopy(proto_r)
    for r in proto.findall("a:r", ns) + proto.findall("a:endParaRPr", ns) + proto.findall("a:br", ns):
        proto.remove(r)
    for it in items:
        label, text = it if isinstance(it, tuple) else (None, it)
        p = copy.deepcopy(proto)
        parts = ([(label, True)] if label else []) + ([(text, False)] if text else [])
        for t, bold in parts:
            r = copy.deepcopy(proto_r)
            rpr = r.find("a:rPr", ns)
            if rpr is None:
                rpr = etree.Element("{%s}rPr" % A)
                r.insert(0, rpr)
            rpr.set("lang", "ru-RU")
            if bold:
                rpr.set("b", "1")
            elif "b" in rpr.attrib:
                del rpr.attrib["b"]
            if size:
                rpr.set("sz", str(size))
            if color:
                for old in rpr.findall("a:solidFill", ns):
                    rpr.remove(old)
                fill = etree.Element("{%s}solidFill" % A)
                etree.SubElement(fill, "{%s}schemeClr" % A).set("val", color)
                rpr.insert(0, fill)
            r.find("a:t", ns).text = t
            p.append(r)
        if nobullet:
            ppr = p.find("a:pPr", ns)
            if ppr is None:
                ppr = etree.Element("{%s}pPr" % A)
                p.insert(0, ppr)
            ppr.set("marL", "0")
            ppr.set("indent", "0")
            for old in ppr.findall("a:buChar", ns) + ppr.findall("a:buNone", ns) + ppr.findall("a:buFont", ns):
                ppr.remove(old)
            etree.SubElement(ppr, "{%s}buNone" % A)
        txBody.append(p)


def set_text(shape, text, size=None, color=None):
    set_paras(shape, [text], size, color)


def resize(shape, w=None, h=None, x=None, y=None):
    if x is not None: shape.left = Inches(x)
    if y is not None: shape.top = Inches(y)
    if w is not None: shape.width = Inches(w)
    if h is not None: shape.height = Inches(h)


def title(slide, text, title_id, pill_id=None):
    set_text(shp(slide, title_id), text)
    if pill_id:
        pill = shp(slide, pill_id)
        need = 0.9 + 0.2 * len(text)
        if need > pill.width / 914400:
            pill.width = Inches(need)


def notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text


# ---------------------------------------------------------------- 7 титул
s = S(7)
set_text(shp(s, 3), "RESPONDERS ACADEMY")
set_paras(shp(s, 5), ["Тренажёр АРМ-112 для диспетчеров ДДС Москвы", "Команда MISIS&MR.DRUN  ·  задача № 9"], 1800, nobullet=True)
# логотип постановщика (Департамент ГОЧСиПБ) из слайда 6 шаблона
src = [x for x in S(6).shapes if x.shape_id == 2160][0]
open(B + "gochs_logo.png", "wb").write(src.image.blob)
ph = shp(s, 4)
x, y = ph.left, ph.top
ph._element.getparent().remove(ph._element)
s.shapes.add_picture(B + "gochs_logo.png", x, y + Inches(0.15), width=Inches(5.2))
notes(s, "Добрый день! Мы команда MISIS&MR.DRUN, проект Responders Academy: тренажёр АРМ-112 для диспетчеров ДДС. (5 сек)")

# ---------------------------------------------------------------- 8 суть
s = S(8)
set_paras(shp(s, 18), [("О РЕШЕНИИ", "")], 2800, color="accent5")
set_text(shp(s, 5), "Учебный эмулятор АРМ-112: преподаватель настраивает занятие, диспетчер отрабатывает карточки, группа получает отчёт и карту ошибок.", 1300)
set_paras(shp(s, 8), [
    "Интерфейс 1:1 с боевым АРМ-112",
    "ИИ работает локально: без интернета и видеокарты",
    "Карта ошибок группы для преподавателя",
], 1300)
resize(shp(s, 8), y=5.3, h=1.6)
set_paras(shp(s, 14), [
    ("Команда: ", "MISIS&MR.DRUN"),
    ("Капитан: ", "Алексеев Всеволод, full stack и AI engineer"),
    ("Участников: ", "5 человек"),
    ("Кто мы: ", "активные и амбициозные, собрались по знакомству, работаем на одной волне"),
    ("Учёба: ", "НИТУ МИСИС, Физтех-лицей им. Капицы"),
    ("Город: ", "Москва"),
], 1300)
notes(s, "Мы сделали тренажёр, где диспетчер тренируется на копии АРМ-112 в изолированном контуре, а преподаватель видит, где именно группа ошибается. Чем отличаемся от макета: копия интерфейса плюс управление занятием плюс карта ошибок. (25 сек)")

# ---------------------------------------------------------------- 9 участники
s = S(9)
set_text(shp(s, 7), "КОМАНДА MISIS&MR.DRUN")
people = [
    (15, 9, 2, "Алексеев Всеволод", ["Капитан, full stack и AI engineer", "@Sovochca", "+7 953 012-20-88", "НИТУ МИСИС"]),
    (58, 57, 3, "Хасянов Амир", ["Backend и ML engineer", "@sbnmklop", "+7 917 274-75-17", "НИТУ МИСИС"]),
    (61, 60, 4, "Янеев Александр", ["Full stack и аналитик", "@aleksander8_0", "+7 960 300-02-16", "Физтех-лицей им.\u00a0П.\u00a0Л.\u00a0Капицы"]),
    (64, 63, 5, "Яров Иван", ["Full stack и дизайнер", "@EeyuhVVV", "+7 952 024-20-62", "НИТУ МИСИС"]),
    (67, 66, 6, "Ткаченко Никита", ["Frontend и дизайнер", "@mr_melov", "+7 985 511-39-58", "НИТУ МИСИС"]),
]
for k, (name_id, info_id, photo_id, name, info) in enumerate(people, 1):
    set_text(shp(s, name_id), name, 1300)
    set_paras(shp(s, info_id), info, 1100)
    ph = shp(s, photo_id)
    x, y, w, h = ph.left, ph.top, ph.width, ph.height
    geom = ph._element.spPr.find("a:prstGeom", ns)
    geom = copy.deepcopy(geom) if geom is not None else None
    ph._element.getparent().remove(ph._element)
    pic = s.shapes.add_picture(B + f"photos/photo{k}.jpg", x, y, w, h)
    if geom is not None:
        old = pic._element.spPr.find("a:prstGeom", ns)
        old.addprevious(geom)
        old.getparent().remove(old)
notes(s, "Нас пятеро, контакты на слайде. (5 сек)")

# ---------------------------------------------------------------- 10 история
s = S(10)
title(s, "ИСТОРИЯ КОМАНДЫ, ЗАДАЧА И ВЫЗОВЫ", 7, 2)
for sid in (37, 43, 40):
    resize(shp(s, sid), w=11.2)
for sid in (41, 44):
    resize(shp(s, sid), w=11.2)
set_text(shp(s, 38), "Краткая история команды:")
set_text(shp(s, 37), "Мы учимся в НИТУ МИСИС и в Физтех-лицее им. Капицы, живём в Москве. Познакомились лично и быстро поняли, что мыслим в одном ритме и хотим делать амбициозные проекты. Собрались, чтобы за хакатон довести идею до работающего прототипа.", 1500)
resize(shp(s, 37), y=1.7, h=1.2)
set_text(shp(s, 44), "Почему выбрали эту задачу:")
set_text(shp(s, 43), "Задача нишевая: готовых тренажёров АРМ-112 мы в открытых источниках не нашли. Цена ошибки высокая: одна неверная буква в адресе отправляет бригаду не туда. А нам важна точность, а не красивая обёртка.", 1500)
resize(shp(s, 43), y=3.6, h=1.2)
set_text(shp(s, 41), "Сложности и вызовы:")
set_paras(shp(s, 40), [
    "Точная копия АРМ-112 без доступа к боевой системе, по скриншотам и памятке",
    "Слабое железо: ИИ только локальный (модель 0,8B, 542 МБ, CPU, без интернета)",
    "Один строгий дизайн симулятора: свободы творчества нет, всё как в программе",
    "Нет официальной методики оценки: веса задаёт преподаватель, итог за ним",
], 1400)
resize(shp(s, 40), y=5.3, h=1.7)
notes(s, "Историю команды (слайд 10) нужно сверить с реальностью: текст про знакомство придуман как черновик. (15 сек история, 15 сек почему задача, 25 сек вызовы)")

# ---------------------------------------------------------------- 11 суть техническая и маркетинговая
s = S(11)
set_text(shp(s, 14), "КОРОТКО О РЕШЕНИИ")
set_text(shp(s, 17), "Маркетинговая суть (гипотезы)")
set_paras(shp(s, 3), [
    "Фронт: Next.js и TypeScript; бэкенд: FastAPI, SQLite",
    "ИИ локально: Qwen3.5-0.8B (llama.cpp, CPU, 542 МБ), запасной режим по правилам",
    "Справочник ЕКП (1283 записи), оценка по правилам, ИИ только рекомендует",
    "Закрытый контур: без внешних API и CDN, синтетические данные",
    "Стенд поднимается одной командой",
], 1500)
set_paras(shp(s, 7), [
    "Кому: УМЦ ГО и ЧС, центры Системы-112 и ЕДДС регионов",
    "Ценность: безопасная практика до выхода на смену и измеримый разбор ошибок для преподавателя",
    "Модель: внедрение в закрытом контуре заказчика, лицензия и поддержка",
    "Отличие: интерфейс 1:1, работа офлайн, прозрачный ИИ",
    "Спрос и эффект проверим в пилоте",
], 1500)
notes(s, "Техника: без GPU, без интернета, запуск одной командой. Облачный ИИ по умолчанию выключен; опциональный внешний провайдер включается только переменной окружения и получает лишь синтетические сценарии. Маркетинг: это гипотезы, цифр рынка и эффекта у нас нет. (35 сек)")

# ---------------------------------------------------------------- 24 проблема
s = S(24)
title(s, "ПРОБЛЕМА", 9, 2)
set_paras(shp(s, 3), [
    ("30 секунд и 3 минуты", ""),
    "Диспетчер должен среагировать на новую карточку за 30 секунд и отработать её за 3 минуты (норматив).",
], 1800, color="tx1", nobullet=True)
set_paras(shp(s, 4), [
    ("Учиться негде", ""),
    "Практика идёт на действующей системе. Одна буква в адресе («Дубнинская» вместо «Дубининская») отправляет бригаду не туда.",
], 1800, color="tx1", nobullet=True)
set_paras(shp(s, 5), [
    ("Нет общей картины", ""),
    "У преподавателя нет единого рабочего места: вводные задаются вручную, где группа теряет баллы, видно плохо.",
], 1800, color="tx1", nobullet=True)
notes(s, "Источник: Q&A с заказчиком от 16.09.2026, это слова заказчика, не наша статистика. Статистики ошибок у нас нет. (30 сек)")

# ---------------------------------------------------------------- 25 цикл
s = S(25)
title(s, "ЗАМКНУТЫЙ ЦИКЛ ЗАНЯТИЯ", 15, 12)
stages = [
    ((2, 3), "Настройка", "Преподаватель выбирает сценарии из 96 ситуаций (32 билета) или генерирует новые"),
    ((8, 9), "Приём вызова 112", "Оператор заполняет карточку: адрес, опросная карта ЕКП"),
    ((4, 5), "Подтверждение", "Преподаватель утверждает карточку и передаёт диспетчеру ДДС"),
    ((10, 11), "Отработка ДДС", "Полный цикл статусов, нормативы 30 с и 3 мин, софтфон"),
    ((6, 7), "Разбор", "Отчёт, подсказки ИИ, карта ошибок группы; итог оценки за преподавателем"),
]
for (hid, bid), head, body in stages:
    set_paras(shp(s, hid), [(head, "")], 1500, color="accent5", nobullet=True)
    set_paras(shp(s, bid), [body], 1300, color="tx1", nobullet=True)
notes(s, "Цикл замкнут: настроили, отработали, увидели ошибки группы. Три роли: обучающийся, преподаватель, администратор. Зачем два режима: цепочка 112 → ДДС, карточку оператора подтверждает преподаватель и отправляет диспетчеру. (30 сек)")

# ---------------------------------------------------------------- 27 демо A / новая копия демо B
for n, head, c1, c2 in [
    (27, "ДЕМО: РАБОТА ДИСПЕТЧЕРА",
     "Журнал карточек и таймер: 30 секунд на первичный статус",
     "Карточка: полный цикл статусов, софтфон и сообщения служб"),
    (38, "ДЕМО: КАБИНЕТ ПРЕПОДАВАТЕЛЯ",
     "Монитор занятия: лента действий обучающихся в реальном времени",
     "Карта ошибок группы: светофор по этапам и пояснение ИИ (демо-данные)"),
]:
    s = S(n)
    title(s, head, 55, 2)
    set_paras(shp(s, 3), [c1], 1400, color="tx1", nobullet=True)
    set_paras(shp(s, 4), [c2], 1400, color="tx1", nobullet=True)
    for tid in ((34, 33) if False else ()):
        pass
    for t in s.shapes:
        pass
    # адресная строка «браузера»
    for sid in (10, 33):
        try:
            set_text(shp(s, sid), "localhost:3130", 900)
        except AssertionError:
            pass
notes(S(27), "Покажите вживую или запасным видео (docs/demo.mp4 не записан, записать заранее). Журнал, 30 секунд на первичный статус, цикл статусов, софтфон. Софтфон не по SIP: UI-эмуляция с транскриптами, как согласовано с заказчиком. (35 сек)")
notes(S(38), "Преподаватель видит всё в реальном времени. Карта ошибок: светофор по этапам, ИИ объясняет почему, преподаватель соглашается или нет. Решение за ним. Подписать «демо-данные». (30 сек)")

# ---------------------------------------------------------------- 16 цифры
s = S(16)
title(s, "ЦИФРЫ, КОТОРЫЕ МОЖНО ПРОВЕРИТЬ", 14, 10)
cards = [
    (15, 2, 3, "01", "96 ситуаций", "32 билета из материалов заказчика: эталонные сценарии занятий"),
    (16, 4, 5, "02", "542 МБ", "Модель ИИ Qwen3.5-0.8B (Q4): работает на CPU, без видеокарты и интернета"),
    (17, 6, 7, "03", "83,6 %", "Точность вердикта модели на 110 примерах; около 1 из 5 ошибок пропускает, поэтому ИИ только советует"),
    (18, 8, 9, "04", "30 с / 3 мин", "Нормативы реакции и полной отработки: контролируются таймерами симулятора"),
]
for num_id, head_id, body_id, num, head, body in cards:
    set_paras(shp(s, num_id), [num], None, color="accent1", nobullet=True)
    set_paras(shp(s, head_id), [(head, "")], 1800, color="accent5", nobullet=True)
    set_paras(shp(s, body_id), [body], 1500, color="tx1", nobullet=True)
notes(s, "Все цифры из репозитория: docs/model-report/README.md (точность 83,6 % Q4 на закрытой выборке 110 примеров, ≈4–5 с на ответ на CPU машины разработчика), mocks/cards.json (96 ситуаций). Метрики ИИ подавать как подсказку, а не как оценку. (20 сек)")

# ---------------------------------------------------------------- 17 планы
s = S(17)
set_paras(shp(s, 14), [("ПЛАНЫ РАЗВИТИЯ", "")], 2400, color="accent5")
plans = [
    (15, 2, 3, "01", "Пилот в УМЦ", "2–3 преподавателя, замер времени реакции и доли пропущенных пунктов карточки"),
    (16, 4, 5, "02", "Методика оценки", "Подключить официальные методики и веса, согласовать их с заказчиком"),
    (17, 6, 7, "03", "Дообучение ИИ", "Улучшать модель на разметке преподавателей, проверять качество на реальных занятиях"),
]
for num_id, head_id, body_id, num, head, body in plans:
    set_paras(shp(s, num_id), [num], None, color="accent1", nobullet=True)
    set_paras(shp(s, head_id), [(head, "")], 1800, color="accent5", nobullet=True)
    set_paras(shp(s, body_id), [body], 1600, color="tx1", nobullet=True)
notes(s, "Нам нужен пилот в УМЦ, чтобы получить данные и методику. Сроков без пилота не обещаем, цифр эффекта у нас нет: говорим «позволяет измерить». (20 сек)")

# ---------------------------------------------------------------- порядок и удаление
order = [7, 8, 9, 10, 11, 24, 25, 27, 38, 16, 17]
lst = prs.slides._sldIdLst
ids = list(lst)
keep = [ids[n - 1] for n in order]
for el in ids:
    lst.remove(el)
    if el not in keep:
        prs.part.drop_rel(el.rId)
for el in keep:
    lst.append(el)
prs.save(ROOT + "Responders_Academy_MISIS-MR.DRUN.pptx")
print("ok", len(prs.slides))
