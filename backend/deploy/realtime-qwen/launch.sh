#!/usr/bin/env bash
# Запуск внутри подготовленного NVIDIA CUDA окружения. Не создаёт платные ресурсы.
set -euo pipefail

omni_root="${OMNI_ROOT:-/workspace/sglang-omni}"
omni_venv="${OMNI_VENV:-/workspace/omni-venv}"
model_path="${OMNI_MODEL_PATH:-/workspace/models/Qwen3-Omni-30B-A3B-Instruct}"
turn_model="${SGLANG_OMNI_SMART_TURN_MODEL_PATH:-/workspace/models/smart-turn/smart-turn-v3.2-gpu.onnx}"
expected_ref="2d5de98cd92b17df7974ac2ef4192b4a99263845"
expected_turn_sha="ab8dc64b88713f90b571c15b714bd1330e6c883cad8763dacf65c9376dc539be"

command -v nvidia-smi >/dev/null
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
if [[ "$(git -C "$omni_root" rev-parse HEAD)" != "$expected_ref" ]]; then
  printf 'Ожидается SGLang-Omni commit %s. См. README.\n' "$expected_ref" >&2
  exit 1
fi
test -x "$omni_venv/bin/sgl-omni"
test -f "$model_path/config.json"
test -f "$turn_model"
printf '%s  %s\n' "$expected_turn_sha" "$turn_model" | sha256sum --check --status
export SGLANG_OMNI_SMART_TURN_MODEL_PATH="$turn_model"
cd "$omni_root"
exec "$omni_venv/bin/sgl-omni" serve \
  --model-path "$model_path" \
  --config examples/configs/qwen3_omni_colocated_h200.yaml \
  --colocate --enable-realtime --host 127.0.0.1 --port 8008
