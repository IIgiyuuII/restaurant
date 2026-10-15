# Backend (Go) для Railway.
# Railway берёт файл с именем "Dockerfile" из корня сервиса (Root Directory = backend).

# ---------- Сборка ----------
FROM golang:1.26-alpine AS build
WORKDIR /src

# Если go.mod требует более свежий патч-релиз Go, чем в образе, Go скачает нужный сам (GOTOOLCHAIN=auto).
ENV CGO_ENABLED=0 GOOS=linux

# Сначала только зависимости — этот слой кешируется, пока go.mod/go.sum не меняются.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

# ---------- Запуск ----------
FROM alpine:3.20
# ca-certificates — для TLS-подключения к Supabase; tzdata — на случай логов/времени в локальной зоне.
RUN apk add --no-cache ca-certificates tzdata \
 && adduser -D -u 10001 app
USER app
COPY --from=build /out/api /usr/local/bin/api

# PORT выставляет Railway; сервер читает его сам (main.go) и слушает на всех интерфейсах.
# EXPOSE намеренно нет: с несколькими портами Railway путается.
CMD ["api"]
