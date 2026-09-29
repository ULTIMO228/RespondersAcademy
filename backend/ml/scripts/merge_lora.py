"""Слияние LoRA-адаптера с исходными весами Qwen3.5-0.8B (для конвертации в GGUF).

Работает напрямую с safetensors оригинального чекпоинта (архитектура Qwen3_5ForConditionalGeneration, ключи
`model.language_model.*`), поэтому результат совместим с конвертером llama.cpp. Слитые матрицы сохраняются в fp32,
чтобы малые поправки LoRA не потерялись в округлении bf16; остальные тензоры остаются как в оригинале.

    python backend/ml/scripts/merge_lora.py
    python backend/ml/scripts/merge_lora.py --adapter <каталог> --out <каталог>
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import torch
from safetensors import safe_open
from safetensors.torch import save_file

REPO = Path(__file__).resolve().parents[3]
WEIGHTS = "model.safetensors-00001-of-00001.safetensors"


def base_key(lora_key: str) -> str:
    """base_model.model.model.layers.0.mlp.gate_proj.lora_A.weight → model.language_model.layers.0.mlp.gate_proj.weight."""
    key = lora_key.replace(".lora_A.weight", ".weight").replace(".lora_B.weight", ".weight")
    prefix = "base_model.model.model."
    if not key.startswith(prefix):
        raise ValueError(f"Неожиданный ключ адаптера: {lora_key}")
    return "model.language_model." + key[len(prefix):]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--base", default=str(REPO / "backend" / "models" / "qwen3.5_0.8b"))
    p.add_argument("--adapter", default=str(REPO / "backend" / "models" / "qwen3.5_0.8b_qlora_adapter" / "final"))
    p.add_argument("--out", default=str(REPO / "backend" / "var" / "merged_qwen3.5_0.8b"))
    args = p.parse_args()
    base_dir, adapter_dir, out_dir = Path(args.base), Path(args.adapter), Path(args.out)

    cfg = json.loads((adapter_dir / "adapter_config.json").read_text(encoding="utf-8"))
    scale = cfg["lora_alpha"] / cfg["r"]
    print(f"LoRA: r={cfg['r']} alpha={cfg['lora_alpha']} scale={scale}")

    tensors: dict[str, torch.Tensor] = {}
    with safe_open(str(base_dir / WEIGHTS), "pt") as f:
        for k in f.keys():
            tensors[k] = f.get_tensor(k)
    with safe_open(str(adapter_dir / "adapter_model.safetensors"), "pt") as a:
        lora_keys = sorted(k for k in a.keys() if ".lora_A." in k)
        merged = 0
        max_rel = 0.0
        for ka in lora_keys:
            kb = ka.replace(".lora_A.", ".lora_B.")
            key = base_key(ka)
            if key not in tensors:
                raise KeyError(f"В базе нет тензора {key} для {ka}")
            A, B = a.get_tensor(ka).float(), a.get_tensor(kb).float()
            w = tensors[key].float()
            delta = (B @ A) * scale
            if delta.shape != w.shape:
                raise ValueError(f"Форма дельты {tuple(delta.shape)} ≠ весов {tuple(w.shape)} для {key}")
            max_rel = max(max_rel, (delta.norm() / w.norm()).item())
            tensors[key] = (w + delta).contiguous()
            merged += 1
    print(f"Слито матриц: {merged}; максимальная относительная поправка ‖ΔW‖/‖W‖ = {max_rel:.4f}")

    out_dir.mkdir(parents=True, exist_ok=True)
    save_file(tensors, str(out_dir / WEIGHTS), metadata={"format": "pt"})
    for name in base_dir.iterdir():
        if name.is_file() and name.suffix != ".safetensors" and name.name not in ("README.md", "LICENSE", ".gitattributes"):
            shutil.copy2(name, out_dir / name.name)
    print(f"Готово: {out_dir}")


if __name__ == "__main__":
    main()
