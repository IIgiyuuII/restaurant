package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/IIgiyuuII/restaurant/backend/internal/services"
	"github.com/IIgiyuuII/restaurant/backend/internal/testutil"
)

// Внутренние функции хендлеров — без БД.

func TestWriteServiceError_Mapping(t *testing.T) {
	testutil.QuietLogs(t) // внутренняя ошибка пишется в лог — это ожидаемо, шум не нужен
	cases := []struct {
		name string
		err  error
		code int
		body string
	}{
		{"валидация", &services.ValidationError{Msg: "плохие данные"}, http.StatusBadRequest, "плохие данные"},
		{"валидация обёрнутая", fmt.Errorf("ctx: %w", &services.ValidationError{Msg: "обёрнуто"}), http.StatusBadRequest, "обёрнуто"},
		{"конфликт", &services.ConflictError{Msg: "уже есть"}, http.StatusConflict, "уже есть"},
		{"конфликт обёрнутый", fmt.Errorf("ctx: %w", &services.ConflictError{Msg: "дубль"}), http.StatusConflict, "дубль"},
		{"внутренняя ошибка", errors.New("pq: connection refused to 10.0.0.5"), http.StatusInternalServerError, "внутренняя ошибка сервера"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			writeServiceError(rec, c.err)
			if rec.Code != c.code {
				t.Errorf("код %d, ожидали %d", rec.Code, c.code)
			}
			if !strings.Contains(rec.Body.String(), c.body) {
				t.Errorf("тело %q не содержит %q", rec.Body.String(), c.body)
			}
			if c.code == http.StatusInternalServerError && strings.Contains(rec.Body.String(), "10.0.0.5") {
				t.Error("детали внутренней ошибки не должны попадать клиенту")
			}
		})
	}
}

func TestWriteJSON_SetsStatusAndContentType(t *testing.T) {
	rec := httptest.NewRecorder()
	writeJSON(rec, http.StatusTeapot, map[string]int{"a": 1})
	if rec.Code != http.StatusTeapot {
		t.Errorf("код %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json; charset=utf-8" {
		t.Errorf("Content-Type %q", ct)
	}
	if strings.TrimSpace(rec.Body.String()) != `{"a":1}` {
		t.Errorf("тело %q", rec.Body.String())
	}
}

func TestWriteError_Format(t *testing.T) {
	rec := httptest.NewRecorder()
	writeError(rec, http.StatusBadRequest, "ой")
	if rec.Code != 400 || strings.TrimSpace(rec.Body.String()) != `{"error":"ой"}` {
		t.Errorf("%d %q", rec.Code, rec.Body.String())
	}
}

func TestDecodeJSON(t *testing.T) {
	type body struct {
		A int `json:"a"`
	}
	run := func(raw string) (bool, int, body) {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest("POST", "/", strings.NewReader(raw))
		var b body
		ok := decodeJSON(rec, req, &b)
		return ok, rec.Code, b
	}

	if ok, _, b := run(`{"a": 5}`); !ok || b.A != 5 {
		t.Errorf("валидное тело: ok=%v %+v", ok, b)
	}
	if ok, _, b := run(`{"a": 5, "unknown": true}`); !ok || b.A != 5 {
		t.Errorf("неизвестные поля должны игнорироваться: ok=%v %+v", ok, b)
	}
	for name, raw := range map[string]string{
		"пусто": "", "обрыв": `{"a":`, "не тот тип": `{"a":"x"}`,
		"слишком большое": `{"a":1,"pad":"` + strings.Repeat("x", maxBodyBytes+1) + `"}`,
	} {
		ok, code, _ := run(raw)
		if ok || code != http.StatusBadRequest {
			t.Errorf("%s: ok=%v code=%d, ожидали false/400", name, ok, code)
		}
	}
}
