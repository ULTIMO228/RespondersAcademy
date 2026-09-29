"""Дообучение Qwen 3.5 0.8B (QLoRA) на датасете смыслового разбора (фича 001, US5).

Особенности:
- 4-bit NF4 + double quant (bitsandbytes), LoRA на линейные проекции;
- loss только по токенам assistant (промпт и system маскируются -100);
- логиты считаются только для позиций ответа (словарь 248 тыс. токенов, иначе не хватит 6 ГБ VRAM);
- прогресс в процентах, скорость, оставшееся время, VRAM: в консоли, `progress.json` и `training_log.jsonl`;
- чекпоинты каждые `--save-steps` шагов, остановка по Ctrl+C или файлу `STOP` с сохранением, `--resume`;
- `--benchmark N` — замер N шагов и прогноз времени полного обучения без сохранения адаптера;
- `--dry-run` — проверка данных и токенизации без загрузки модели.

Запуск (из корня репозитория):
    python backend/ml/scripts/train_qlora.py --dry-run
    python backend/ml/scripts/train_qlora.py --benchmark 4
    python backend/ml/scripts/train_qlora.py
    python backend/ml/scripts/train_qlora.py --resume
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import signal
import sys
import time
from pathlib import Path
from typing import Any

# Для Windows и bitsandbytes 0.50+ фиксируем рабочий драйвер CUDA 12.4
os.environ.setdefault("BNB_CUDA_VERSION", "124")

import torch
import torch.nn.functional as F
from datasets import Dataset
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    Trainer,
    TrainerCallback,
    TrainingArguments,
    default_data_collator,
)
from transformers.trainer_utils import get_last_checkpoint

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s: %(message)s")
logger = logging.getLogger("train_qlora")

REPO = Path(__file__).resolve().parents[3]
DEFAULT_MODEL = REPO / "backend" / "models" / "qwen3.5_0.8b"
RELEASE = REPO / "backend" / "data" / "ai_dataset" / "v1" / "release"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Дообучение Qwen 3.5 0.8B через QLoRA")
    p.add_argument("--model-id", default=str(DEFAULT_MODEL), help="Локальный каталог модели или ID на HuggingFace")
    p.add_argument("--train-file", default=str(RELEASE / "train.jsonl"))
    p.add_argument("--val-file", default=str(RELEASE / "validation.jsonl"))
    p.add_argument("--output-dir", default=str(REPO / "backend" / "models" / "qwen3.5_0.8b_qlora_adapter"))
    p.add_argument("--epochs", type=int, default=2)
    p.add_argument("--batch-size", type=int, default=1, help="Размер батча на GPU (логиты по ответу рассчитаны на 1)")
    p.add_argument("--grad-accum", type=int, default=8, help="Шагов накопления градиента")
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--lora-alpha", type=int, default=32)
    p.add_argument("--lora-dropout", type=float, default=0.05)
    p.add_argument("--max-length", type=int, default=3072, help="Максимум токенов примера (системный промпт ~1500)")
    p.add_argument("--train-limit", type=int, default=352, help="Стратифицированная подвыборка train (0 = весь набор)")
    p.add_argument("--val-limit", type=int, default=24, help="Стратифицированная подвыборка validation (0 = весь набор)")
    p.add_argument("--save-steps", type=int, default=11, help="Чекпоинт каждые N шагов оптимизатора")
    p.add_argument("--eval-steps", type=int, default=22, help="Оценка на validation каждые N шагов оптимизатора")
    p.add_argument("--sec-per-token", type=float, default=0.0142, help="Замер GTX 1660: с на токен примера (fwd+bwd), для прогноза")
    p.add_argument("--optim", default="paged_adamw_8bit", help="Оптимизатор (при проблемах: adamw_torch)")
    p.add_argument("--resume", action="store_true", help="Продолжить с последнего чекпоинта в --output-dir")
    p.add_argument("--benchmark", type=int, default=0, metavar="N", help="Замерить N шагов, показать прогноз и выйти")
    p.add_argument("--dry-run", action="store_true", help="Проверить данные и токенизацию без загрузки модели")
    return p.parse_args()


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Файл данных не найден: {path}")
    records = []
    with open(path, encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as err:
                logger.warning("Пропуск строки %d в %s: %s", line_no, path, err)
    return records


def stratified_subsample(records: list[dict[str, Any]], limit: int, seed: int = 112) -> list[dict[str, Any]]:
    """Детерминированная подвыборка с сохранением пропорций (поле × вердикт)."""
    import random

    if limit <= 0 or limit >= len(records):
        return records
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for r in records:
        m = r["messages"]
        key = (json.loads(m[1]["content"]).get("field", ""), json.loads(m[2]["content"]).get("decision", ""))
        groups.setdefault(key, []).append(r)
    rng = random.Random(seed)
    for g in groups.values():
        rng.shuffle(g)
    quotas = {k: len(g) * limit / len(records) for k, g in groups.items()}
    take = {k: int(q) for k, q in quotas.items()}
    for k in sorted(quotas, key=lambda k: quotas[k] - take[k], reverse=True)[: limit - sum(take.values())]:
        take[k] += 1
    picked = [r for k, g in groups.items() for r in g[: take[k]]]
    rng.shuffle(picked)
    return picked


def format_and_tokenize(records: list[dict[str, Any]], tokenizer: Any, max_length: int) -> tuple[Dataset, dict[str, int]]:
    """Токенизирует диалоги и маскирует метки (-100) до ответа assistant.

    Пример, не влезающий в `max_length`, не усекается (обрезанный ответ дал бы пустые метки), а отбрасывается и считается.
    """
    input_ids_list, mask_list, labels_list = [], [], []
    lengths: list[int] = []
    skipped = 0
    for record in records:
        messages = record.get("messages", [])
        if len(messages) < 3:
            skipped += 1
            continue
        prompt_text = tokenizer.apply_chat_template(
            [m for m in messages if m.get("role") in ("system", "user")], tokenize=False, add_generation_prompt=True
        )
        full_text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
        if not full_text.startswith(prompt_text):
            raise RuntimeError("Шаблон чата: промпт не является префиксом полного диалога, маска была бы неверной")
        prompt_len = len(tokenizer(prompt_text, add_special_tokens=False)["input_ids"])
        full = tokenizer(full_text, add_special_tokens=False)["input_ids"]
        if len(full) > max_length:
            skipped += 1
            continue
        labels = [-100] * prompt_len + full[prompt_len:]
        input_ids_list.append(full)
        mask_list.append([1] * len(full))
        labels_list.append(labels)
        lengths.append(len(full))
    stats = {
        "count": len(lengths),
        "skipped_too_long_or_bad": skipped,
        "max_tokens": max(lengths, default=0),
        "mean_tokens": round(sum(lengths) / max(len(lengths), 1)),
        "answer_tokens_mean": round(sum(sum(1 for x in lab if x != -100) for lab in labels_list) / max(len(labels_list), 1)),
    }
    return Dataset.from_dict({"input_ids": input_ids_list, "attention_mask": mask_list, "labels": labels_list}), stats


def fmt_time(seconds: float) -> str:
    seconds = max(int(seconds), 0)
    return f"{seconds // 3600}ч {seconds % 3600 // 60:02d}м {seconds % 60:02d}с"


class ProgressCallback(TrainerCallback):
    """Проценты, скорость, ETA, VRAM; запись `progress.json` и `training_log.jsonl`; корректная остановка с чекпоинтом."""

    def __init__(self, output_dir: Path, benchmark_steps: int = 0) -> None:
        self.output_dir = output_dir
        self.stop_file = output_dir / "STOP"
        self.benchmark_steps = benchmark_steps
        self.stop_requested = False
        self.interrupted = False
        self.t0 = 0.0
        self.step0 = 0
        self.last_loss: float | None = None
        self.last_eval: float | None = None
        self.best_eval: float | None = None
        signal.signal(signal.SIGINT, self._on_signal)
        if hasattr(signal, "SIGBREAK"):
            signal.signal(signal.SIGBREAK, self._on_signal)

    def _on_signal(self, *_: Any) -> None:
        if self.stop_requested:
            logger.warning("Повторный сигнал: выход без сохранения.")
            raise KeyboardInterrupt
        self.stop_requested = True
        logger.warning("Получен сигнал остановки: дойду до конца шага, сохраню чекпоинт и выйду. Продолжить: --resume")

    def _write(self, name: str, payload: dict[str, Any], append: bool = False) -> None:
        try:
            self.output_dir.mkdir(parents=True, exist_ok=True)
            with open(self.output_dir / name, "a" if append else "w", encoding="utf-8") as f:
                f.write(json.dumps(payload, ensure_ascii=False) + ("\n" if append else ""))
        except OSError as err:
            logger.warning("Не удалось записать %s: %s", name, err)

    def on_train_begin(self, args: Any, state: Any, control: Any, **kw: Any) -> None:
        self.t0 = time.time()
        self.step0 = state.global_step  # при --resume отсчёт скорости идёт от точки возобновления
        if self.stop_file.exists():
            self.stop_file.unlink()
        torch.cuda.reset_peak_memory_stats()

    def on_log(self, args: Any, state: Any, control: Any, logs: dict[str, float] | None = None, **kw: Any) -> None:
        if logs and "loss" in logs:
            self.last_loss = logs["loss"]
        if logs and "eval_loss" in logs:
            self.last_eval = logs["eval_loss"]
            self.best_eval = self.last_eval if self.best_eval is None else min(self.best_eval, self.last_eval)
            logger.info("ОЦЕНКА на validation: eval_loss=%.4f (лучшая %.4f)", self.last_eval, self.best_eval)

    def on_step_end(self, args: Any, state: Any, control: Any, **kw: Any) -> None:
        done = state.global_step - self.step0
        elapsed = time.time() - self.t0
        per_step = elapsed / max(done, 1)
        remaining = per_step * (state.max_steps - state.global_step)
        pct = 100.0 * state.global_step / max(state.max_steps, 1)
        peak = torch.cuda.max_memory_allocated() / 1024**3
        logger.info(
            "[%5.1f%%] шаг %d/%d | эпоха %.2f | loss %s | %.1f с/шаг | прошло %s | осталось ~%s | VRAM пик %.2f ГБ",
            pct, state.global_step, state.max_steps, state.epoch or 0.0,
            f"{self.last_loss:.4f}" if self.last_loss is not None else "—",
            per_step, fmt_time(elapsed), fmt_time(remaining), peak,
        )
        payload = {
            "step": state.global_step, "maxSteps": state.max_steps, "percent": round(pct, 2), "epoch": state.epoch,
            "loss": self.last_loss, "evalLoss": self.last_eval, "bestEvalLoss": self.best_eval,
            "secPerStep": round(per_step, 2), "elapsedSec": round(elapsed), "etaSec": round(remaining),
            "vramPeakGb": round(peak, 2), "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        self._write("progress.json", payload)
        self._write("training_log.jsonl", payload, append=True)
        if self.last_loss is not None and (math.isnan(self.last_loss) or math.isinf(self.last_loss)):
            logger.error("loss = %s: обучение расходится (вероятно, переполнение fp16). Остановка.", self.last_loss)
            control.should_training_stop = True
            self.interrupted = True
        if self.benchmark_steps and done >= self.benchmark_steps:
            control.should_training_stop = True
        if self.stop_requested or self.stop_file.exists():
            control.should_save = True
            control.should_training_stop = True
            self.interrupted = True


class AnswerOnlyTrainer(Trainer):
    """Считает логиты только для позиций, предсказывающих токены ответа (batch size = 1)."""

    def compute_loss(self, model: Any, inputs: dict[str, torch.Tensor], return_outputs: bool = False, num_items_in_batch: Any = None):
        labels = inputs.pop("labels")
        if labels.shape[0] != 1:
            raise ValueError("AnswerOnlyTrainer рассчитан на batch size = 1")
        targets = labels[0, 1:]
        keep = (targets != -100).nonzero(as_tuple=True)[0]
        out = model(**inputs, logits_to_keep=keep, use_cache=False)
        loss = F.cross_entropy(out.logits[0].float(), targets[keep])
        if model.training:
            loss = loss / self.args.gradient_accumulation_steps  # Trainer сам не делит: модель принимает **kwargs
        return (loss, out) if return_outputs else loss


def preflight_model_dir(model_id: str) -> None:
    path = Path(model_id)
    if path.exists() and not any(path.glob("*.safetensors")):
        logger.error("В %s нет файла весов *.safetensors. Скачайте model.safetensors-00001-of-00001.safetensors (1.75 ГБ).", path)
        sys.exit(1)


def main() -> None:
    args = parse_args()
    output_path = Path(args.output_dir)
    logger.info("=== QLoRA: подготовка ===")
    logger.info("Модель: %s | Train: %s | Val: %s", args.model_id, args.train_file, args.val_file)
    preflight_model_dir(args.model_id)

    tokenizer = AutoTokenizer.from_pretrained(args.model_id, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    train_all, val_all = load_jsonl(Path(args.train_file)), load_jsonl(Path(args.val_file))
    train_ds, train_stats = format_and_tokenize(stratified_subsample(train_all, args.train_limit), tokenizer, args.max_length)
    val_ds, val_stats = format_and_tokenize(stratified_subsample(val_all, args.val_limit), tokenizer, args.max_length)
    logger.info("Подвыборка: train %d из %d, validation %d из %d (стратификация поле × вердикт)", len(train_ds), len(train_all), len(val_ds), len(val_all))
    logger.info("train: %s", train_stats)
    logger.info("validation: %s", val_stats)
    if train_stats["skipped_too_long_or_bad"] or val_stats["skipped_too_long_or_bad"]:
        logger.error("Часть примеров не влезла в --max-length=%d или битая. Увеличьте --max-length.", args.max_length)
        sys.exit(1)

    steps_per_epoch = math.ceil(len(train_ds) / (args.batch_size * args.grad_accum))
    total_steps = steps_per_epoch * args.epochs
    logger.info("План: %d примеров, %d шагов на эпоху, всего %d шагов оптимизатора (%d эпох)", len(train_ds), steps_per_epoch, total_steps, args.epochs)
    train_tokens = train_stats["mean_tokens"] * len(train_ds)
    val_tokens = val_stats["mean_tokens"] * len(val_ds)
    n_evals = total_steps // args.eval_steps
    est = train_tokens * args.epochs * args.sec_per_token + n_evals * val_tokens * args.sec_per_token / 4
    logger.info("ПРОГНОЗ времени: ≈ %s (обучение %d проходов + %d оценок; %.4f с/токен по замеру на GTX 1660, реальное покажет ETA)",
                fmt_time(est), len(train_ds) * args.epochs, n_evals, args.sec_per_token)
    if args.dry_run:
        logger.info("--dry-run: данные и токенизация в порядке, модель не загружалась.")
        return

    if not torch.cuda.is_available():
        logger.error("CUDA недоступна: QLoRA требует NVIDIA GPU.")
        sys.exit(1)
    logger.info("GPU: %s (%.2f ГБ)", torch.cuda.get_device_name(0), torch.cuda.get_device_properties(0).total_memory / 1024**3)

    last_ckpt = get_last_checkpoint(str(output_path)) if output_path.exists() else None
    if last_ckpt and not args.resume and not args.benchmark:
        logger.error("В %s уже есть чекпоинт %s. Продолжить: --resume; начать заново: удалите каталог или задайте другой --output-dir.", output_path, Path(last_ckpt).name)
        sys.exit(1)
    if args.resume and not last_ckpt:
        logger.warning("--resume указан, но чекпоинтов нет: начинаю с нуля.")

    bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=torch.float16)
    logger.info("Загрузка модели в 4-бит (NF4)...")
    model, info = AutoModelForCausalLM.from_pretrained(
        args.model_id, quantization_config=bnb, device_map={"": 0}, dtype=torch.float16, trust_remote_code=True, output_loading_info=True
    )
    if info.get("missing_keys"):
        logger.error("Часть весов не загрузилась (осталась случайной): %s ... Обучение бессмысленно.", list(info["missing_keys"])[:5])
        sys.exit(1)
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model)
    lora = LoraConfig(
        r=args.lora_r, lora_alpha=args.lora_alpha, lora_dropout=args.lora_dropout, bias="none", task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj", "in_proj_qkv", "in_proj_z", "out_proj"],
    )
    peft_model = get_peft_model(model, lora)
    peft_model.print_trainable_parameters()

    output_path.mkdir(parents=True, exist_ok=True)
    training_args = TrainingArguments(
        output_dir=str(output_path),
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        warmup_ratio=0.05,
        num_train_epochs=args.epochs,
        logging_steps=1,
        eval_strategy="steps",
        eval_steps=args.eval_steps,
        save_strategy="steps",
        save_steps=args.save_steps,
        save_total_limit=3,
        prediction_loss_only=True,
        fp16=True,
        report_to="none",
        optim=args.optim,
        remove_unused_columns=False,
        disable_tqdm=True,
        seed=112,
    )
    progress = ProgressCallback(output_path, benchmark_steps=args.benchmark)
    trainer = AnswerOnlyTrainer(
        model=peft_model, args=training_args, train_dataset=train_ds, eval_dataset=val_ds,
        data_collator=default_data_collator, callbacks=[progress],
    )

    scaler = getattr(trainer.accelerator, "scaler", None)
    if scaler is not None:
        # fp16-градиенты этой модели переполняются уже при большом масштабе: старт с 65536 пропустил бы десятки шагов
        scaler._init_scale = 8.0
        scaler._growth_interval = 10**6
    logger.info("=== Старт обучения (Ctrl+C или файл %s = безопасная остановка) ===", progress.stop_file)
    result = trainer.train(resume_from_checkpoint=last_ckpt if args.resume else None)

    if args.benchmark:
        per_step = (time.time() - progress.t0) / max(trainer.state.global_step - progress.step0, 1)
        logger.info("=== БЕНЧМАРК: %.1f с/шаг (включая прогрев) → полное обучение %d шагов ≈ %s; VRAM пик %.2f ГБ ===",
                    per_step, total_steps, fmt_time(per_step * total_steps), torch.cuda.max_memory_allocated() / 1024**3)
        return
    if progress.interrupted:
        logger.warning("Обучение остановлено на шаге %d. Чекпоинт сохранён, продолжить: --resume. Финальный адаптер не записан.", trainer.state.global_step)
        return

    final_dir = output_path / "final"
    peft_model.save_pretrained(str(final_dir))
    tokenizer.save_pretrained(str(final_dir))
    eval_metrics = trainer.evaluate()
    summary = {
        "model_id": args.model_id, "epochs": args.epochs, "batch_size": args.batch_size, "grad_accum": args.grad_accum,
        "learning_rate": args.lr, "lora_r": args.lora_r, "lora_alpha": args.lora_alpha, "max_length": args.max_length,
        "train_samples": len(train_ds), "val_samples": len(val_ds), "total_steps": total_steps,
        "best_eval_loss": progress.best_eval, "last_eval_loss": progress.last_eval,
        "train_metrics": result.metrics, "eval_metrics": eval_metrics,
    }
    (output_path / "training_summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("=== Готово. Адаптер: %s ===", final_dir)


if __name__ == "__main__":
    main()
