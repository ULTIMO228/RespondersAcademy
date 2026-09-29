# Быстрый запуск модели

Дообученная Qwen3.5-0.8B в формате **Q4_K_M** (542 МБ, адаптер уже слит в веса). Работает на **обычном CPU, видеокарта не нужна**, после первой загрузки — без интернета.

## Для жюри: три команды

Нужен только Python 3.9+ (сторонние пакеты не требуются). Проверено на Windows 11; для Linux и macOS предусмотрены официальные сборки llama.cpp, но там запуск не проверялся.

```bash
git clone https://github.com/ULTIMO228/RespondersAcademy.git
cd RespondersAcademy
python backend/ml/scripts/run_semantic_model.py --check
```

Что произойдёт при первом запуске:

1. Скачается модель `semantic-review-Q4_K_M.gguf` (542 МБ) из Google Drive в `backend/models/` и сверится контрольная сумма sha256.
2. Скачается движок llama.cpp `b11258` (19 МБ, официальный релиз) в `backend/var/llamacpp/`.
3. Поднимется локальный сервер на `http://127.0.0.1:8081`, будет отправлено 3 тестовых запроса, результат выведется в консоль, сервер остановится.

Повторные запуски ничего не скачивают. Чтобы оставить сервер работать:

```bash
python backend/ml/scripts/run_semantic_model.py
```

В другом окне можно отправлять свои запросы:

```bash
python backend/ml/scripts/semantic_review_demo.py
python backend/ml/scripts/semantic_review_demo.py --text "Принято, направил пожарных."
python backend/ml/scripts/semantic_review_demo.py --all   # все образцы, включая инъекцию
```

Пример вывода:

```
=== пропущен факт ===
Текст обучающегося: Сообщение принято.
  Вердикт: different  (уверенность 0.8, 3.0 с)
  Не передано: ['fact:demo:a2']
  Основание: Не передано: направление МЧС. Сообщение принято верно.
  Контракт SemanticReviewV1: соблюдён
```

Сервер отдаёт OpenAI-совместимый API (`POST /v1/chat/completions`), поэтому к нему можно подключить любой клиент.

### Без интернета или без Google Drive

- Положите файл `semantic-review-Q4_K_M.gguf` в `backend/models/` вручную (sha256 указан в `backend/ml/semantic_model.json`).
- Или укажите свою ссылку: `python backend/ml/scripts/run_semantic_model.py --url https://…/semantic-review-Q4_K_M.gguf`.
- Свой llama.cpp: задайте переменную окружения `LLAMA_SERVER` (путь к `llama-server`).

### Ручной запуск через llama.cpp или LM Studio

```bash
llama-server -m backend/models/semantic-review-Q4_K_M.gguf --port 8081 -c 4096 --jinja --reasoning off --temp 0
```

> **Важно:** обязательно `--reasoning off`. Модель обучена отвечать без блока рассуждений; по умолчанию llama.cpp включает режим `<think>`, и ответ приходит пустым. В LM Studio отключите «Thinking» для этой модели.
>
> Ollama не проверялась: для неё нужен собственный шаблон чата в Modelfile.

## Где лежит модель

Файл `semantic-review-Q4_K_M.gguf` (542 МБ) выложен на Google Drive с доступом «все, у кого есть ссылка»: [папка с моделью](https://drive.google.com/drive/folders/1C7YjA2eBq8_b_GxvMaZ5zno_xT0GpJIl?usp=sharing). ID файла (`1o9RHSYpA09TGPlkU2WP5b_VhTRwUEjcH`) записан в `backend/ml/semantic_model.json`, поле `driveFileId`; лаунчер скачивает по нему без авторизации.

Скачивание проверено на реальном Drive: чистый запуск `run_semantic_model.py --check` загрузил файл (≈ 6 минут при 1,5 МБ/с), контрольная сумма совпала, модель ответила на все три образца.

Если Drive не откроется (лимит скачиваний, нет доступа), скачайте файл из папки вручную и положите в `backend/models/`, либо используйте `--url` с прямой ссылкой.

Дополнительно (необязательно) можно выложить LoRA-адаптер `backend/models/qwen3.5_0.8b_qlora_adapter/final/` (41 МБ): он нужен только тем, кто хочет повторить оценку на GPU через PyTorch.

## Как собирался Q4-файл (воспроизводимо)

```bash
python backend/ml/scripts/train_qlora.py                      # обучение адаптера
python backend/ml/scripts/merge_lora.py                       # слияние с весами → backend/var/merged_qwen3.5_0.8b
python convert_hf_to_gguf.py backend/var/merged_qwen3.5_0.8b --outfile semantic-review-f16.gguf --outtype f16
llama-quantize semantic-review-f16.gguf semantic-review-Q4_K_M.gguf Q4_K_M
```

`convert_hf_to_gguf.py` и `llama-quantize` берутся из llama.cpp `b11258`. Слитые матрицы хранятся в fp32 до квантования, чтобы малые поправки адаптера не терялись при округлении.

## Проверка качества Q4 на holdout

Тот же закрытый набор из 110 примеров, что и для адаптера в PyTorch:

```bash
python backend/ml/scripts/run_semantic_model.py               # в одном окне
python backend/ml/scripts/eval_qlora_holdout.py --server http://127.0.0.1:8081   # в другом
```

Результаты и сравнение с версией в PyTorch — в [README.md](README.md), раздел «Q4-версия».
