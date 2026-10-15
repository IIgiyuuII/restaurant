package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/IIgiyuuII/restaurant/backend/internal/handlers"
	"github.com/IIgiyuuII/restaurant/backend/internal/services"
	"github.com/IIgiyuuII/restaurant/backend/internal/testutil"
)

// app — тестовое приложение: роутер с реальными сервисами поверх изолированной схемы.
type app struct {
	t *testing.T
	d *testutil.DB
	h http.Handler
}

func newApp(t *testing.T) *app {
	t.Helper()
	d := testutil.New(t)
	r := chi.NewRouter()
	handlers.New(d.Pool, services.NewExpiryService(d.Pool, 15*time.Minute)).Mount(r)
	return &app{t: t, d: d, h: r}
}

// do выполняет запрос. body: nil, string (сырое тело) или значение для JSON-кодирования.
func (a *app) do(method, path string, body any) *httptest.ResponseRecorder {
	a.t.Helper()
	var rdr *bytes.Reader
	switch b := body.(type) {
	case nil:
		rdr = bytes.NewReader(nil)
	case string:
		rdr = bytes.NewReader([]byte(b))
	default:
		raw, err := json.Marshal(b)
		if err != nil {
			a.t.Fatal(err)
		}
		rdr = bytes.NewReader(raw)
	}
	req := httptest.NewRequest(method, path, rdr)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	a.h.ServeHTTP(rec, req)
	return rec
}

func (a *app) get(path string) *httptest.ResponseRecorder {
	a.t.Helper()
	return a.do("GET", path, nil)
}
func (a *app) post(path string, body any) *httptest.ResponseRecorder {
	a.t.Helper()
	return a.do("POST", path, body)
}

// expect проверяет код ответа.
func expect(t *testing.T, rec *httptest.ResponseRecorder, code int) {
	t.Helper()
	if rec.Code != code {
		t.Fatalf("HTTP %d, ожидали %d; тело: %s", rec.Code, code, strings.TrimSpace(rec.Body.String()))
	}
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("тело не разобралось как %T: %v\n%s", v, err, rec.Body.String())
	}
	return v
}

// keys разбирает объект и возвращает множество его ключей — для проверки JSON-контракта.
func keys(t *testing.T, raw json.RawMessage) map[string]bool {
	t.Helper()
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("не объект: %v\n%s", err, raw)
	}
	out := map[string]bool{}
	for k := range m {
		out[k] = true
	}
	return out
}

func wantKeys(t *testing.T, got map[string]bool, want ...string) {
	t.Helper()
	for _, k := range want {
		if !got[k] {
			t.Errorf("в JSON нет ключа %q (есть: %v)", k, got)
		}
	}
}

// firstElem возвращает первый элемент JSON-массива.
func firstElem(t *testing.T, rec *httptest.ResponseRecorder) json.RawMessage {
	t.Helper()
	var arr []json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &arr); err != nil || len(arr) == 0 {
		t.Fatalf("ожидали непустой массив: %v\n%s", err, rec.Body.String())
	}
	return arr[0]
}

// assertEmptyArray проверяет, что тело — именно "[]" (а не null).
func assertEmptyArray(t *testing.T, rec *httptest.ResponseRecorder) {
	t.Helper()
	expect(t, rec, http.StatusOK)
	if got := strings.TrimSpace(rec.Body.String()); got != "[]" {
		t.Fatalf("ожидали [] (фронтенд делает .map), получили %q", got)
	}
}
