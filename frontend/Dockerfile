# Frontend (React + Vite) для Railway: сборка статики и раздача через Caddy.
# Root Directory = frontend.

# ---------- Сборка ----------
# Debian-образ (glibc), а не alpine: нативные модули Tailwind/Rollup ставятся из lock-файла надёжнее.
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_API_URL вшивается в JS при сборке. Railway передаёт переменные сервиса только тем ARG,
# которые объявлены здесь, в этапе сборки. Пример значения: https://<backend>.up.railway.app/api
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ---------- Раздача ----------
# Caddy слушает ":$PORT" и не падает, если в окружении нет IPv6 (в отличие от nginx с listen [::]).
FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

# Значение по умолчанию для локального запуска; на Railway PORT приходит из окружения.
ENV PORT=8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
