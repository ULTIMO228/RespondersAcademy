// Копирует спек-моки в приложение и SVG-иконки АРМ-112 в public/ (локальный контур, без CDN).
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MOCKS_SRC = join(ROOT, "spec", "mocks");
const MOCKS_DST = join(ROOT, "mocks");
const ICONS_SRC = join(ROOT, "icons");
const ICONS_DST = join(ROOT, "public", "icons");
const SKIPPED_ENTRIES = new Set(["_tools", "README.md"]);
/*
 * Моки уровня приложения (не из spec/mocks, validate_mocks.py их не проверяет) — не удаляются:
 *   local/ — справочник адресов карточки (T2.3-06); admin/ — сид журнала аудита (T4.1-01).
 */
const APP_LOCAL_DIRS = new Set(["local", "admin"]);

function syncMocks() {
  mkdirSync(MOCKS_DST, { recursive: true });
  for (const entry of readdirSync(MOCKS_DST)) {
    if (!APP_LOCAL_DIRS.has(entry)) rmSync(join(MOCKS_DST, entry), { recursive: true, force: true });
  }
  for (const entry of readdirSync(MOCKS_SRC)) {
    if (SKIPPED_ENTRIES.has(entry)) continue;
    cpSync(join(MOCKS_SRC, entry), join(MOCKS_DST, entry), { recursive: true });
  }
}

function syncIcons() {
  rmSync(ICONS_DST, { recursive: true, force: true });
  mkdirSync(ICONS_DST, { recursive: true });
  for (const entry of readdirSync(ICONS_SRC)) {
    if (!entry.endsWith(".svg")) continue;
    cpSync(join(ICONS_SRC, entry), join(ICONS_DST, entry));
  }
}

syncMocks();
syncIcons();
process.stdout.write("mocks:sync — mocks/ и public/icons/ обновлены\n");
