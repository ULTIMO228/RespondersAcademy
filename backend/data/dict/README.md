# Частотный словарь русского языка для спеллчекера (R2)

`ru_frequency.txt` — `hermitdave/FrequencyWords` (content/2018/ru/ru_full.txt, лицензия CC-BY-SA 4.0,
источник — субтитры OpenSubtitles 2018), отфильтрован: только кириллица, частота ≥ 3.
Формат: `слово частота`. Доменные слова (`../domain_words.txt`) собираются
`uv run python -m ml.scripts.build_domain_words` из сидов и памятки и имеют приоритет.
