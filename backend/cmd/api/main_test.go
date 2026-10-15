package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/IIgiyuuII/restaurant/backend/internal/services"
)

// ---------- CORS: без него браузер не пустит фронтенд к API ----------

func TestRouter_CORSPreflight(t *testing.T) {
	r := newRouter(nil, nil) // preflight обрабатывается middleware, до БД дело не доходит

	for _, c := range []struct{ path, method string }{
		{"/api/orders", "POST"},
		{"/api/deliveries", "POST"},
		{"/api/writeoffs", "POST"},
		{"/api/dishes", "GET"},
	} {
		req := httptest.NewRequest(http.MethodOptions, c.path, nil)
		req.Header.Set("Origin", "http://localhost:5173")
		req.Header.Set("Access-Control-Request-Method", c.method)
		req.Header.Set("Access-Control-Request-Headers", "content-type")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK && rec.Code != http.StatusNoContent {
			t.Errorf("%s %s: preflight вернул %d", c.method, c.path, rec.Code)
		}
		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
			t.Errorf("%s: Access-Control-Allow-Origin = %q", c.path, got)
		}
		if got := rec.Header().Get("Access-Control-Allow-Methods"); got != c.method {
			t.Errorf("%s: Access-Control-Allow-Methods = %q, ожидали %q", c.path, got, c.method)
		}
	}
}

func TestRouter_UnknownRouteIs404(t *testing.T) {
	rec := httptest.NewRecorder()
	newRouter(nil, nil).ServeHTTP(rec, httptest.NewRequest("GET", "/nope", nil))
	if rec.Code != http.StatusNotFound {
		t.Errorf("код %d", rec.Code)
	}
}

// ---------- AUTO_WRITEOFF_INTERVAL ----------

func TestAutoWriteOffInterval(t *testing.T) {
	def := services.DefaultAutoWriteOff
	cases := []struct {
		env  string
		want time.Duration
	}{
		{"", def},
		{"   ", def},
		{"15m", 15 * time.Minute},
		{"1h", time.Hour},
		{"90m", 90 * time.Minute},
		{" 30M ", 30 * time.Minute}, // регистр и пробелы не важны
		{"1m", time.Minute},         // минимально допустимое
		{"0", 0},                    // выключено
		{"off", 0},
		{"OFF", 0},
		{"false", 0},
		{"no", 0},
		{"59s", def}, // меньше минуты → по умолчанию
		{"30s", def},
		{"-5m", def}, // отрицательное
		{"abc", def}, // мусор
		{"15", def},  // без единицы измерения
	}
	for _, c := range cases {
		t.Setenv("AUTO_WRITEOFF_INTERVAL", c.env)
		if got := autoWriteOffInterval(); got != c.want {
			t.Errorf("AUTO_WRITEOFF_INTERVAL=%q → %v, ожидали %v", c.env, got, c.want)
		}
	}
}
