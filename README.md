# PrintFlow — приём заказов на печать

Сайт копи-центра: клиент загружает PDF/DOC/DOCX, видит предпросмотр страниц
(как в браузерном диалоге печати), управляет цветностью каждой страницы,
получает точную цену (ч/б и цветные считаются отдельно) и код отслеживания заказа.
Владелец — кабинет с PIN-кодом: заказы, статусы, цены, адрес выдачи на карте.

Стек: Next.js 16 (App Router) · TypeScript · Tailwind 4 + shadcn/ui ·
Prisma + SQLite · pdf.js (анализ и предпросмотр) · LibreOffice (конвертация DOC/DOCX).

## Локальный запуск

```bash
cp .env.example .env   # настройки по умолчанию (DATABASE_URL)
bun install
bun run db:push        # создать базу
bun run dev            # http://localhost:3000
```

Нужен LibreOffice (`/usr/bin/soffice`) — только для загрузки DOC/DOCX; PDF работает без него.

## Деплой для теста (бесплатно, ссылка для друга)

### Вариант А — Hugging Face Spaces (рекомендую: бесплатно, без карты, работает из РФ)

1. Зарегистрируйтесь на https://huggingface.co (бесплатно).
2. «New Space» → имя `printflow` → SDK: **Docker** → Public → Create.
3. Загрузите файлы проекта (через вкладку Files → «Add file» → Upload files, можно zip,
   либо привяжите GitHub-репозиторий). Обязательны: `Dockerfile`, исходники, `prisma/`.
4. В Space замените `README.md` на:

   ```yaml
   ---
   title: PrintFlow
   emoji: 🖨️
   colorFrom: green
   colorTo: gray
   sdk: docker
   app_port: 7860
   ---
   ```

5. Дождитесь сборки (5–15 минут, LibreOffice весит много). Ссылка:
   `https://<ваш-логин>-printflow.hf.space` — отправьте её другу.

Ограничения бесплатного Space: файлы и база живут до перезапуска контейнера,
после 48 часов без визитов Space «засыпает» (просыпается при открытии, ~1 мин).
Для теста этого достаточно; для продакшена — свой сервер (вариант В).

### Вариант Б — Render.com (free tier)

New → Web Service → Docker → репозиторий. Порт подставится из `PORT`.
Диск эфемерный, сервис засыпает после 15 минут без трафика.

### Вариант В — свой сервер (данные хранятся постоянно)

```bash
git clone <репозиторий> && cd printflow
docker build -t printflow .
docker run -d -p 3000:7860 -v printflow-data:/app/db -v printflow-uploads:/app/uploads printflow
```

Тома (`-v`) сохраняют базу и документы между перезапусками. Для HTTPS добавьте
Caddy/nginx перед контейнером.

## Данные и приватность

- Загруженные документы и заказы хранятся **только на сервере** (`uploads/` + SQLite)
  и **не публикуются в git** (`.gitignore`).
- Для публичного теста смените PIN владельца в кабинете «Владельцу» → настройки.
