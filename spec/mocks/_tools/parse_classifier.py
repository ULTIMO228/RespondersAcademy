#!/usr/bin/env python3
# Парсер классификатора происшествий (ЕКП) xlsx -> spec/mocks/classifier.json
# Только stdlib: xlsx = zip + XML. Запуск: python3 spec/mocks/_tools/parse_classifier.py
import zipfile, xml.etree.ElementTree as ET, re, json, os, datetime

SRC = '/Users/seva/Projects/RespondersAcademy/hack/Фронт/Источники/Классификатор_происшествий_v_046_24_корректировка_МВД_+_Департамент.xlsx'
DST = '/Users/seva/Projects/RespondersAcademy/spec/mocks/classifier.json'
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

# Статичная карта колонка -> (служба, условие/вариант) по заголовкам xlsx v.046_24
COLMAP = {
    13: ("Служба 101 (МЧС)", "признак НД не выбран"), 14: ("Служба 101 (МЧС)", "выбран признак НД"),
    15: ("ОДС ПСЦ", "другие признаки не выбраны"), 16: ("ОДС ПСЦ", "выбран признак УЛ"),
    17: ("ОДС ПСЦ", "выбран признак ПП"), 18: ("ОДС ПСЦ", "выбран признак НД"),
    19: ("МГПСС", None),
    20: ("МВД (Служба 102)", "признак Правонарушение или Пострадавшие не выбран"),
    21: ("МВД (Служба 102)", "выбран признак Правонарушение"), 22: ("МВД (Служба 102)", "выбран признак Пострадавшие"),
    23: ("СМП (Служба 103)", "признак Пострадавшие не выбран"), 24: ("СМП (Служба 103)", "выбран признак Пострадавшие"),
    25: ("СМП (Служба 103)", "выбран признак Пострадавшие не на месте"),
    26: ("МОСГАЗ (Служба 104)", "признак не выбран"), 27: ("МОСГАЗ (Служба 104)", "газификация"),
    28: ("ЦЭМП", "признаки не выбраны"), 29: ("ЦЭМП", "угроза людям"), 30: ("ЦЭМП", "пострадавшие/погибшие"),
    31: ("ЦЭМП", "мед. помощь"), 32: ("ЦЭМП", "треб. эвакуация"),
    33: ("ФСБ", "признак не выбран"), 34: ("ФСБ", ">5 чел / ОД"),
    35: ("Мособлгаз", None), 36: ("Автомобильные дороги", None),
    37: ("Мосгортранс", "признак не выбран"), 38: ("Мосгортранс", "пострадавшие/погибшие"),
    39: ("Мосгортранс", "перекрытие движения"),
    40: ("Городское хозяйство", None),
    41: ("ГОРМОСТ", "признак не выбран"), 42: ("ГОРМОСТ", "тоннель"), 43: ("ГОРМОСТ", "пеш. переход"), 44: ("ГОРМОСТ", "авто"),
    45: ("Канал имени Москвы", None),
    46: ("МГТС", "реагирование всегда"), 47: ("МГТС", "на объектах связи"),
    48: ("Метро", None), 49: ("Мосводоканал", None), 50: ("МОЭК", None), 51: ("МОЭСК", None), 52: ("ОЭК", None),
    53: ("Мослифт", None), 54: ("ЦОДД", None), 55: ("Деп. ЖКХ", None),
    56: ("МОСБЕЗ (РБиПК)", "Дежурная служба АРМ-112"), 57: ("МКП Аналитика", "Старый КРИМ"),
    58: ("Аппарат МЭРА", None), 59: ("Москоллектор", None), 60: ("РЖД", None),
    61: ("Департамент образования", None), 62: ("Центррегионводхоз", None), 63: ("Военная комендатура", None),
    64: ("ОАТИ", None), 65: ("Мосводосток", None), 66: ("Департамент ППиООС", None), 67: ("ОД Департамент ТСЗН", None),
    68: ("РСВО", None), 69: ("ЭВАЖД", None), 70: ("МСППН", None), 71: ("ДТУ_Р (Ритуал)", None), 72: ("ДТУ", None),
    73: ("Росгвардия", None), 74: ("Территориальные ОИВ", None), 75: ("Территориальные ОИВ ТиНАО", None),
    76: ("Автомобильные дороги АО", None),
    77: ("Департамент строительства", "признак не выбран"), 78: ("Департамент строительства", "стройка"),
    79: ("Комитет ветеринарии", None), 80: ("Мосжилинспекция", None), 81: ("Департамент культуры", "объект из перечня"),
    82: ("ГКУ ЦСА им. Е.П.Глинки", None), 83: ("ГКУ НТУ", None), 84: ("ФСО", None),
    85: ("ГУП МСР", "КУБ"), 86: ("ГУП МСР", "пожары"),
    87: ("Комитет по туризму", None), 88: ("ДГП", "интеграция"), 89: ("ДГП", "АРМ-112"),
    90: ("ЦУКБ Министерство обороны", None), 91: ("ЦУКБ.БПЛА Министерство обороны", None),
    92: ("ГКУ Организатор перевозок", "признак не выбран"), 93: ("ГКУ Организатор перевозок", "перекрытие движения"),
    94: ("ГПБУ Мосэкомониторинг", None),
    95: ("Министерство обороны РХБЗ", "События по полигонам"), 96: ("Министерство обороны РХБЗ", "Москва"),
    97: ("ООО Ситиэнерго", None), 98: ("Департамент гражданского строительства", None),
}

def col_of(ref):
    c = 0
    for ch in re.match(r'([A-Z]+)', ref).group(1):
        c = c * 26 + ord(ch) - 64
    return c - 1

def main():
    z = zipfile.ZipFile(SRC)
    ss = []
    root = ET.fromstring(z.read('xl/sharedStrings.xml'))
    for si in root.findall(f'{NS}si'):
        ss.append(''.join(t.text or '' for t in si.iter(f'{NS}t')))

    def cellval(c):
        t = c.get('t'); v = c.find(f'{NS}v')
        if t == 's' and v is not None: return ss[int(v.text)]
        if t == 'inlineStr':
            is_ = c.find(f'{NS}is')
            return ''.join(x.text or '' for x in is_.iter(f'{NS}t')) if is_ is not None else ''
        return v.text if v is not None else ''

    sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    rows = sheet.find(f'{NS}sheetData').findall(f'{NS}row')

    entries = []
    group = ''
    for r in rows:
        rn = int(r.get('r'))
        if rn < 4: continue
        row = {}
        for c in r.findall(f'{NS}c'):
            v = cellval(c)
            row[col_of(c.get('r'))] = v.strip() if isinstance(v, str) else v
        if row.get(5): group = row[5]
        code = row.get(4, '')
        if not code: continue
        # пропускаем строки-заголовки групп (есть номер, но нет признаков и итогового типа)
        if not (row.get(6) or row.get(7) or row.get(8) or row.get(10)): continue
        notifications = []
        for ci, (service, cond) in COLMAP.items():
            val = row.get(ci, '')
            if not val: continue
            low = val.lower().replace(' ', '')
            if low == 'карточка-112': mode, mapped = 'card112', None
            elif low == 'интеграция': mode, mapped = 'integration', None
            elif low == 'нетреагирования': mode, mapped = 'none', None
            else: mode, mapped = 'mapped', val
            n = {'service': service, 'mode': mode}
            if cond: n['condition'] = cond
            if mapped: n['mappedType'] = mapped
            notifications.append(n)
        entries.append({
            'code': code,
            'group': group,
            'sign1': row.get(6, ''), 'sign2': row.get(7, ''), 'sign3': row.get(8, ''),
            'extraSigns': row.get(9, ''),
            'finalType': row.get(10, ''), 'ekp35Type': row.get(11, ''),
            'mainService': row.get(12, ''),
            'notifications': notifications,
        })

    out = {
        'meta': {
            'title': 'Единый классификатор событий, происшествий и ЧС (ЕКП) — извлечение',
            'sourceFile': os.path.basename(SRC),
            'version': 'v046.24 (корректировка МВД + Департамент)',
            'extractedAt': datetime.date.today().isoformat(),
            'rowCount': len(entries),
            'groupCount': len({e['group'] for e in entries}),
            'note': 'notifications: только непустые ячейки служебных колонок xlsx. mode: card112="карточка-112" (вариант "карточка -112" нормализован), integration="интеграция", none="нет реагирования", mapped=маппинг типа для ВИС (текст в mappedType). condition — вариант подколонки из заголовка xlsx. В отличие от v.046_11, колонки «Сценарий реагирования» в источнике нет — поле responseScenario из записей убрано.',
        },
        'entries': entries,
    }
    os.makedirs(os.path.dirname(DST), exist_ok=True)
    with open(DST, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('written:', DST, 'entries:', len(entries))

if __name__ == '__main__':
    main()
