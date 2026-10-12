package services

import (
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
)

// ValidationError — ошибка во входных данных (HTTP 400).
type ValidationError struct{ Msg string }

func (e *ValidationError) Error() string { return e.Msg }

func validation(format string, a ...any) error {
	return &ValidationError{Msg: fmt.Sprintf(format, a...)}
}

// ConflictError — конфликт состояния, например дубликат номера (HTTP 409).
type ConflictError struct{ Msg string }

func (e *ConflictError) Error() string { return e.Msg }

// pgCode возвращает SQLSTATE ошибки Postgres или "".
func pgCode(err error) string {
	var pe *pgconn.PgError
	if errors.As(err, &pe) {
		return pe.Code
	}
	return ""
}

const (
	pgUniqueViolation = "23505"
	pgInvalidText     = "22P02" // например, невалидный uuid
)
