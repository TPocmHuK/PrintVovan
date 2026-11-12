#!/usr/bin/env bash
# Сторож upload-роута: песочница периодически теряет
# src/app/api/documents/upload/route.ts при цикле сохранения/восстановления среды.
# Скрипт каждые 5 секунд проверяет файл и восстанавливает его из резервной копии,
# если он пропал или повреждён (меньше 2 КБ).
#
# ВАЖНО: основная защита — самолечение ВНУТРИ dev-сервера (ensureUploadRoute в
# src/app/api/_lib/shared.ts, вызывается из GET /api/settings и status): фоновые
# процессы из shell-сессий песочница прибивает, а dev-сервер живёт постоянно.
# Этот скрипт — опциональное ускорение, если хочется лечить файл проактивно:
#
# Запуск в фоне (из корня проекта):
#   setsid nohup .zscripts/upload-guard.sh >> .zscripts/upload-guard.log 2>&1 < /dev/null &
# Остановка:
#   pkill -f upload-guard.sh

cd "$(dirname "$0")/.." || exit 1

BACKUP="scripts/upload-route.ts.bak"
ROUTE="src/app/api/documents/upload/route.ts"
MIN_BYTES=2000

while true; do
  size=$(stat -c%s "$ROUTE" 2>/dev/null || echo 0)
  if [ "$size" -lt "$MIN_BYTES" ]; then
    mkdir -p "$(dirname "$ROUTE")"
    if cp "$BACKUP" "$ROUTE" 2>/dev/null; then
      echo "[$(date '+%F %T')] route.ts отсутствовал (${size}B) — восстановлен из резервной копии"
    else
      echo "[$(date '+%F %T')] ОШИБКА: не удалось скопировать $BACKUP"
    fi
  fi
  sleep 5
done
