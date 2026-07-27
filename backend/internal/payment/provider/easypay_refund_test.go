package provider

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/payment"
)

func TestEasyPayRefundUsesOnlyMerchantOrderID(t *testing.T) {
	t.Parallel()

	var receivedValues url.Values
	client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path != "/api.php" || r.URL.Query().Get("act") != "refund" {
			t.Errorf("unexpected refund endpoint: %s", r.URL.String())
		}
		if err := r.ParseForm(); err != nil {
			t.Errorf("parse refund form: %v", err)
		}
		receivedValues = r.PostForm
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"code":1,"msg":"退款成功"}`)),
		}, nil
	})}

	provider, err := NewEasyPay("3", map[string]string{
		"pid":       "merchant",
		"pkey":      "secret",
		"apiBase":   "https://zpay.example/",
		"notifyUrl": "https://example.com/notify",
		"returnUrl": "https://example.com/return",
	})
	if err != nil {
		t.Fatalf("create provider: %v", err)
	}
	provider.httpClient = client

	_, err = provider.Refund(context.Background(), payment.RefundRequest{
		TradeNo: "zpay-trade-number",
		OrderID: "merchant-order-number",
		Amount:  "10.00",
	})
	if err != nil {
		t.Fatalf("refund: %v", err)
	}

	if got := receivedValues.Get("out_trade_no"); got != "merchant-order-number" {
		t.Fatalf("out_trade_no = %q, want merchant-order-number", got)
	}
	if _, exists := receivedValues["trade_no"]; exists {
		t.Fatalf("trade_no must not be sent: %#v", receivedValues["trade_no"])
	}
	if got := receivedValues.Get("money"); got != "10.00" {
		t.Fatalf("money = %q, want 10.00", got)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}

func TestEasyPayRefundRequiresMerchantOrderID(t *testing.T) {
	t.Parallel()

	provider, err := NewEasyPay("3", map[string]string{
		"pid":       "merchant",
		"pkey":      "secret",
		"apiBase":   "https://example.com",
		"notifyUrl": "https://example.com/notify",
		"returnUrl": "https://example.com/return",
	})
	if err != nil {
		t.Fatalf("create provider: %v", err)
	}

	if _, err := provider.Refund(context.Background(), payment.RefundRequest{
		TradeNo: "zpay-trade-number",
		Amount:  "10.00",
	}); err == nil {
		t.Fatal("expected missing out_trade_no error")
	}
}
