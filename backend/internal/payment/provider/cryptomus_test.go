package provider

import (
	"fmt"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/payment"
	"github.com/stretchr/testify/require"
)

func TestCryptomusProviderStatus(t *testing.T) {
	require.Equal(t, payment.ProviderStatusSuccess, cryptomusProviderStatus("paid"))
	require.Equal(t, payment.ProviderStatusSuccess, cryptomusProviderStatus("paid_over"))
	require.Equal(t, payment.ProviderStatusFailed, cryptomusProviderStatus("wrong_amount"))
	require.Equal(t, payment.ProviderStatusFailed, cryptomusProviderStatus("cancel"))
	require.Equal(t, payment.ProviderStatusPending, cryptomusProviderStatus("check"))
}

func TestCryptomusVerifyNotification(t *testing.T) {
	const apiKey = "payment-api-key"
	unsigned := []byte(`{"type":"payment","uuid":"invoice-uuid","order_id":"sub2_order","status":"paid","is_final":true}`)
	raw := fmt.Sprintf(`%s,"sign":"%s"}`, unsigned[:len(unsigned)-1], cryptomusSign(unsigned, apiKey))

	provider, err := NewCryptomus("1", map[string]string{
		"merchantId":    "merchant",
		"paymentApiKey": apiKey,
		"notifyUrl":     "https://example.com/webhook",
	})
	require.NoError(t, err)
	notification, err := provider.VerifyNotification(t.Context(), raw, nil)
	require.NoError(t, err)
	require.Equal(t, "sub2_order", notification.OrderID)
	require.Equal(t, "invoice-uuid", notification.TradeNo)
	require.Equal(t, payment.ProviderStatusSuccess, notification.Status)
}

func TestCryptomusRawWithoutFinalSign(t *testing.T) {
	raw := []byte(`{"uuid":"u","order_id":"o","sign":"abc"}`)
	unsigned, ok := cryptomusRawWithoutFinalSign(raw)
	require.True(t, ok)
	require.JSONEq(t, `{"uuid":"u","order_id":"o"}`, string(unsigned))
}
