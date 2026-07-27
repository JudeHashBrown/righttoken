package provider

import (
	"encoding/json"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/payment"
	"github.com/stretchr/testify/require"
	stripe "github.com/stripe/stripe-go/v85"
)

func TestParseStripePaymentIntentFailure(t *testing.T) {
	t.Parallel()

	raw := json.RawMessage(`{
		"id":"pi_test",
		"amount":2000,
		"metadata":{"orderId":"sub2_test"},
		"last_payment_error":{
			"code":"payment_method_provider_decline",
			"decline_code":"partner_generic_decline",
			"network_decline_code":"REQUEST_BLOCKED",
			"message":"The payment provider has declined the payment."
		}
	}`)
	event := &stripe.Event{Data: &stripe.EventData{Raw: raw}}

	got, err := parseStripePaymentIntent(event, payment.ProviderStatusFailed, string(raw))
	require.NoError(t, err)
	require.Equal(t, "pi_test", got.TradeNo)
	require.Equal(t, "sub2_test", got.OrderID)
	require.Equal(t, 20.0, got.Amount)
	require.Equal(t, payment.ProviderStatusFailed, got.Status)
	require.Equal(t, "payment_method_provider_decline", got.FailureCode)
	require.Equal(t, "partner_generic_decline", got.DeclineCode)
	require.Equal(t, "REQUEST_BLOCKED", got.NetworkDeclineCode)
	require.Equal(t, "The payment provider has declined the payment.", got.FailureMessage)
}
