# PrintFlow — тестовый деплой одним образом.
# Подходит для Hugging Face Spaces (Docker), Render, Fly.io и любого VPS с Docker.
FROM oven/bun:1-debian

# LibreOffice Writer — конвертация DOC/DOCX в PDF (бинарь /usr/bin/soffice),
# шрифты с кириллицей — корректный рендер русских документов.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libreoffice-writer \
       fonts-liberation \
       fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Зависимости отдельно — кэшируются между сборками.
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install

# ВАЖНО: bun (в отличие от npm) может не запускать postinstall @prisma/client
# (наблюдается на bun >= 1.4), поэтому генерируем клиент явным образом.
RUN bunx prisma generate

# Писаемые каталоги и переменные окружения ДО сборки: Next выполняет модули
# во время build, и PrismaClient должен видеть DATABASE_URL уже на этом этапе.
RUN mkdir -p db uploads

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL="file:/app/db/custom.db" \
    PORT=7860 \
    HOSTNAME=0.0.0.0

# Исходники и сборка (build-скрипт сам копирует static/ и public/ в standalone).
COPY . .
RUN bun run build

RUN chown -R bun:bun /app

USER bun
EXPOSE 7860

# При старте: создать/обновить схему БД, затем запустить standalone-сервер.
# PORT можно переопределить платформой (Fly подставит 8080 и т.п.).
CMD ["sh", "-c", "bunx prisma db push --accept-data-loss --skip-generate && bun .next/standalone/server.js"]
