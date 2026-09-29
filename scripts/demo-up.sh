#!/usr/bin/env bash
# Точка входа для запуска демо-стенда из корня репозитория (T060)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
exec "$ROOT/backend/scripts/demo_up.sh" "$@"
