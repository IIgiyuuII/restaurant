package services

import "testing"

func TestSuggestQuantity(t *testing.T) {
	cases := []struct {
		name          string
		unit          string
		min, have, ex float64
	}{
		{"низкий остаток", "g", 1000, 400, 1600},
		{"продукта нет", "g", 1500, 0, 3000},
		{"штуки — шаг 1", "pcs", 30, 5, 55},
		{"округление вверх до 100", "ml", 333, 0, 700},
		{"минимум не задан", "g", 0, 0, 0},
		{"запаса с избытком", "g", 1000, 2500, 0},
	}
	for _, c := range cases {
		if got := suggestQuantity(c.unit, c.min, c.have); got != c.ex {
			t.Errorf("%s: suggestQuantity(%q, %v, %v) = %v, ожидали %v", c.name, c.unit, c.min, c.have, got, c.ex)
		}
	}
}

func TestRestockStatus(t *testing.T) {
	if restockStatus(0) != RestockOut {
		t.Error("0 → out")
	}
	if restockStatus(0.001) != RestockLow {
		t.Error("остаток > 0 → low")
	}
}
