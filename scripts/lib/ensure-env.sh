#!/usr/bin/env bash
# Общая подготовка backend/.env: создать из .env.example, проставить рекомендованные модели Polza,
# при необходимости спросить ключ. Подключается через `source`; повторный запуск безопасен.
#   ensure_env <каталог backend> [--key]   (--key: читать ключ из stdin даже без терминала)
# ИИ-ключ никогда не печатается; значения читаются/пишутся только через эти функции.

# env_get FILE KEY -> значение последней непустой строки KEY=... (без кавычек вокруг)
env_get() {
  awk -F= -v k="$2" '$1 == k { v = substr($0, length(k) + 2) } END { print v }' "$1" | sed -e 's/[[:space:]]*#.*$//' -e 's/^"//;s/"$//'
}

# env_set FILE KEY VALUE -> заменить активную строку KEY=... или дописать в конец
env_set() {
  local f="$1" k="$2" v="$3" tmp
  tmp="$(mktemp "${f}.XXXXXX")"
  V="$v" awk -v k="$k" '
    BEGIN { done = 0 }
    $0 ~ "^" k "=" { if (!done) { print k "=" ENVIRON["V"]; done = 1 } ; next }
    { print }
    END { if (!done) print k "=" ENVIRON["V"] }
  ' "$f" >"$tmp" && cat "$tmp" >"$f"
  rm -f "$tmp"
}

# env_default FILE KEY VALUE -> проставить, только если пусто или строки нет
env_default() {
  [ -n "$(env_get "$1" "$2")" ] || env_set "$1" "$2" "$3"
}

has_polza_key() {
  [ -f "$1" ] && [ -n "$(env_get "$1" POLZA_API_KEY)" ]
}

# Включает облачный режим и живого заявителя, когда ключ задан.
apply_polza_mode() {
  local f="$1"
  has_polza_key "$f" || return 0
  env_set "$f" AI_PROVIDER polza
  env_set "$f" LIVE_CALLS_ENABLED true
  env_set "$f" LIVE_CALL_REALTIME_TRANSPORT polza
}

ensure_env() {
  local bdir="$1" ask="${2:-}" f key
  f="$bdir/.env"
  if [ ! -f "$f" ]; then
    if [ ! -f "$bdir/.env.example" ]; then
      echo "⚠ Нет $bdir/.env.example — пропускаю подготовку .env" >&2
      return 0
    fi
    cp "$bdir/.env.example" "$f"
    echo "▸ Создан backend/.env из .env.example"
  fi
  chmod 600 "$f" 2>/dev/null || true

  # Рекомендованные модели из .env.example (только если пусты в .env)
  local k v
  for k in POLZA_MODEL LIVE_CALL_POLZA_CHAT_MODEL LIVE_CALL_POLZA_STT_MODEL POLZA_BASE_URL; do
    v="$(env_get "$bdir/.env.example" "$k")"
    [ -n "$v" ] && env_default "$f" "$k" "$v"
  done
  if [ -z "$(env_get "$f" JWT_SECRET)" ]; then
    env_set "$f" JWT_SECRET "$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
  fi

  if ! has_polza_key "$f"; then
    if [ -t 0 ] || [ "$ask" = "--key" ]; then
      printf 'Вставьте ключ Polza.ai (Enter — пропустить, работать локально): '
      IFS= read -rs key || key=""
      echo
      if [ -n "$key" ]; then
        env_set "$f" POLZA_API_KEY "$key"
        chmod 600 "$f" 2>/dev/null || true
        echo "▸ Ключ сохранён в backend/.env"
      fi
      key=""
    else
      echo "ℹ Ключ Polza.ai не задан — ИИ работает локально. Ключ: ./scripts/setup.sh --key (или вставьте в Кабинет администратора → ИИ, /account/ai)."
    fi
  fi
  apply_polza_mode "$f"
  return 0
}
