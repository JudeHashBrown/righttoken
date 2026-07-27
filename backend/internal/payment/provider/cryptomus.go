package provider

import (
	"bytes"
	"context"
	"crypto/md5"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/payment"
)

const (
	cryptomusAPIBase     = "https://api.cryptomus.com"
	cryptomusHTTPTimeout = 15 * time.Second
	cryptomusCNYPerUSD   = 7.0
)

// Cryptomus implements USDT (TRC20) invoice payments.
type Cryptomus struct {
	instanceID string
	config     map[string]string
	httpClient *http.Client
}

func NewCryptomus(instanceID string, config map[string]string) (*Cryptomus, error) {
	for _, key := range []string{"merchantId", "paymentApiKey", "notifyUrl"} {
		if strings.TrimSpace(config[key]) == "" {
			return nil, fmt.Errorf("cryptomus config missing required key: %s", key)
		}
	}
	return &Cryptomus{
		instanceID: instanceID,
		config:     config,
		httpClient: &http.Client{Timeout: cryptomusHTTPTimeout},
	}, nil
}

func (c *Cryptomus) Name() string        { return "Cryptomus" }
func (c *Cryptomus) ProviderKey() string { return payment.TypeCryptomus }
func (c *Cryptomus) SupportedTypes() []payment.PaymentType {
	return []payment.PaymentType{payment.TypeCryptomus}
}

func (c *Cryptomus) CreatePayment(ctx context.Context, req payment.CreatePaymentRequest) (*payment.CreatePaymentResponse, error) {
	cny, err := strconv.ParseFloat(req.Amount, 64)
	if err != nil || cny <= 0 {
		return nil, fmt.Errorf("cryptomus invalid CNY amount: %q", req.Amount)
	}
	payload := map[string]any{
		"amount":              fmt.Sprintf("%.2f", cny/cryptomusCNYPerUSD),
		"currency":            "USD",
		"to_currency":         "USDT",
		"network":             "tron",
		"order_id":            req.OrderID,
		"url_callback":        c.config["notifyUrl"],
		"is_payment_multiple": true,
		"lifetime":            3600,
	}
	if returnURL := strings.TrimSpace(c.config["returnUrl"]); returnURL != "" {
		payload["url_return"] = returnURL
		payload["url_success"] = returnURL
	}

	var result cryptomusInvoice
	if err := c.post(ctx, "/v1/payment", payload, &result); err != nil {
		return nil, err
	}
	if result.UUID == "" || result.Address == "" || result.PayerAmount == "" {
		return nil, fmt.Errorf("cryptomus response missing invoice uuid, address, or payer amount")
	}
	return &payment.CreatePaymentResponse{
		TradeNo:      result.UUID,
		PayURL:       result.URL,
		QRCode:       result.Address,
		PayAddress:   result.Address,
		CryptoAmount: result.PayerAmount,
		CryptoCode:   result.PayerCurrency,
		Network:      result.Network,
	}, nil
}

func (c *Cryptomus) QueryOrder(ctx context.Context, tradeNo string) (*payment.QueryOrderResponse, error) {
	var result cryptomusInvoice
	if err := c.post(ctx, "/v1/payment/info", map[string]any{"uuid": tradeNo}, &result); err != nil {
		return nil, err
	}
	status := result.PaymentStatus
	if status == "" {
		status = result.Status
	}
	return &payment.QueryOrderResponse{
		TradeNo: result.UUID,
		Status:  cryptomusProviderStatus(status),
		Amount:  0, // Use the locally expected CNY amount during fulfillment.
	}, nil
}

func (c *Cryptomus) VerifyNotification(_ context.Context, rawBody string, _ map[string]string) (*payment.PaymentNotification, error) {
	var payload map[string]any
	if err := json.Unmarshal([]byte(rawBody), &payload); err != nil {
		return nil, fmt.Errorf("cryptomus parse webhook: %w", err)
	}
	provided, _ := payload["sign"].(string)
	if provided == "" {
		return nil, fmt.Errorf("cryptomus webhook missing sign")
	}
	delete(payload, "sign")
	unsigned, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("cryptomus marshal webhook: %w", err)
	}
	valid := cryptomusSignatureMatches(provided, unsigned, c.config["paymentApiKey"])
	// Cryptomus normally appends "sign" as the final top-level field. Preserve
	// the exact incoming key order as an additional verification path because
	// re-marshalling a JSON object can reorder its fields.
	if rawUnsigned, ok := cryptomusRawWithoutFinalSign([]byte(rawBody)); ok {
		valid = valid || cryptomusSignatureMatches(provided, rawUnsigned, c.config["paymentApiKey"])
	}
	if !valid {
		return nil, fmt.Errorf("cryptomus invalid webhook signature")
	}

	orderID, _ := payload["order_id"].(string)
	uuid, _ := payload["uuid"].(string)
	status, _ := payload["status"].(string)
	if orderID == "" || uuid == "" {
		return nil, fmt.Errorf("cryptomus webhook missing order_id or uuid")
	}
	providerStatus := cryptomusProviderStatus(status)
	if providerStatus == payment.ProviderStatusPending {
		return nil, nil
	}
	return &payment.PaymentNotification{
		TradeNo: uuid,
		OrderID: orderID,
		Status:  providerStatus,
		RawData: rawBody,
		FailureCode: func() string {
			if providerStatus == payment.ProviderStatusFailed {
				return status
			}
			return ""
		}(),
		FailureMessage: func() string {
			if providerStatus == payment.ProviderStatusFailed {
				return "Cryptomus payment " + status
			}
			return ""
		}(),
	}, nil
}

func (c *Cryptomus) Refund(_ context.Context, _ payment.RefundRequest) (*payment.RefundResponse, error) {
	return nil, fmt.Errorf("cryptomus automatic refunds are not enabled")
}

type cryptomusInvoice struct {
	UUID          string `json:"uuid"`
	OrderID       string `json:"order_id"`
	URL           string `json:"url"`
	Address       string `json:"address"`
	PayerAmount   string `json:"payer_amount"`
	PayerCurrency string `json:"payer_currency"`
	Network       string `json:"network"`
	PaymentStatus string `json:"payment_status"`
	Status        string `json:"status"`
}

type cryptomusEnvelope struct {
	State   int             `json:"state"`
	Result  json.RawMessage `json:"result"`
	Message string          `json:"message"`
}

func (c *Cryptomus) post(ctx context.Context, path string, payload map[string]any, result any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("cryptomus encode request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cryptomusAPIBase+path, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("cryptomus create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("merchant", c.config["merchantId"])
	req.Header.Set("sign", cryptomusSign(body, c.config["paymentApiKey"]))

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("cryptomus request: %w", err)
	}
	defer resp.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return fmt.Errorf("cryptomus read response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("cryptomus HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(responseBody)))
	}
	var envelope cryptomusEnvelope
	if err := json.Unmarshal(responseBody, &envelope); err != nil {
		return fmt.Errorf("cryptomus parse response: %w", err)
	}
	if envelope.State != 0 {
		return fmt.Errorf("cryptomus error: %s", envelope.Message)
	}
	if err := json.Unmarshal(envelope.Result, result); err != nil {
		return fmt.Errorf("cryptomus parse result: %w", err)
	}
	return nil
}

func cryptomusSign(body []byte, apiKey string) string {
	encoded := base64.StdEncoding.EncodeToString(body)
	sum := md5.Sum([]byte(encoded + apiKey))
	return hex.EncodeToString(sum[:])
}

func cryptomusSignatureMatches(provided string, body []byte, apiKey string) bool {
	expected := cryptomusSign(body, apiKey)
	return subtle.ConstantTimeCompare([]byte(strings.ToLower(provided)), []byte(expected)) == 1
}

func cryptomusRawWithoutFinalSign(body []byte) ([]byte, bool) {
	signKey := bytes.LastIndex(body, []byte(`"sign"`))
	if signKey < 0 {
		return nil, false
	}
	comma := bytes.LastIndexByte(body[:signKey], ',')
	closeBrace := bytes.LastIndexByte(body, '}')
	if comma < 0 || closeBrace < signKey {
		return nil, false
	}
	unsigned := make([]byte, 0, len(body))
	unsigned = append(unsigned, body[:comma]...)
	unsigned = append(unsigned, body[closeBrace:]...)
	return unsigned, true
}

func cryptomusProviderStatus(status string) string {
	switch strings.ToLower(status) {
	case "paid", "paid_over":
		return payment.ProviderStatusSuccess
	case "fail", "wrong_amount", "cancel", "system_fail":
		return payment.ProviderStatusFailed
	default:
		return payment.ProviderStatusPending
	}
}
