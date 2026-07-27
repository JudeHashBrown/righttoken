package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/stretchr/testify/require"
)

func queryValue(t *testing.T, rawURL, key string) string {
	t.Helper()
	parsed, err := url.Parse(rawURL)
	require.NoError(t, err)
	return parsed.Query().Get(key)
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func TestRecallSSOServiceCheckAccess(t *testing.T) {
	t.Parallel()

	const internalSecret = "internal-secret-at-least-32-characters"
	client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		require.Equal(t, "https://recall.example/api/internal/righttoken/access-check", r.URL.String())
		require.Equal(t, "Bearer "+internalSecret, r.Header.Get("Authorization"))
		require.Equal(t, "application/json", r.Header.Get("Content-Type"))
		var body map[string]string
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		require.Equal(t, "42", body["externalUserId"])
		require.Equal(t, "operator@example.com", body["email"])
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"allowed":true}`)),
			Request:    r,
		}, nil
	})}

	svc := newRecallSSOService(
		config.RecallSSOConfig{
			BaseURL:        "https://recall.example",
			InternalSecret: internalSecret,
			SSOSecret:      "sso-secret-at-least-32-characters",
			Issuer:         "https://righttoken.ai",
			Audience:       "righttoken-recall",
		},
		client,
		time.Now,
		randomBytes,
	)

	allowed, err := svc.CheckAccess(context.Background(), &User{
		ID:    42,
		Email: "Operator@Example.com",
	})

	require.NoError(t, err)
	require.True(t, allowed)
}

func TestRecallSSOServiceSignsCompatibleShortLivedTicket(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 7, 26, 12, 0, 0, 0, time.UTC)
	const secret = "sso-secret-at-least-32-characters"
	svc := newRecallSSOService(
		config.RecallSSOConfig{
			BaseURL:        "https://recall.righttoken.ai",
			InternalSecret: "internal-secret-at-least-32-characters",
			SSOSecret:      secret,
			Issuer:         "https://righttoken.ai",
			Audience:       "righttoken-recall",
		},
		http.DefaultClient,
		func() time.Time { return now },
		func(size int) ([]byte, error) {
			return []byte("1234567890abcdef")[:size], nil
		},
	)

	loginURL, err := svc.CreateLoginURL(&User{
		ID:       42,
		Email:    "Operator@Example.com",
		Username: "运营一号",
	}, "/tasks?status=TODO")
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(
		loginURL,
		"https://recall.righttoken.ai/api/auth/righttoken/callback?",
	))

	ticket := queryValue(t, loginURL, "ticket")
	parts := strings.Split(ticket, ".")
	require.Len(t, parts, 3)

	message := parts[0] + "." + parts[1]
	expectedSignature := hmac.New(sha256.New, []byte(secret))
	_, _ = expectedSignature.Write([]byte(message))
	require.Equal(
		t,
		base64.RawURLEncoding.EncodeToString(expectedSignature.Sum(nil)),
		parts[2],
	)

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	require.NoError(t, err)
	var payload map[string]any
	require.NoError(t, json.Unmarshal(payloadBytes, &payload))
	require.Equal(t, "https://righttoken.ai", payload["iss"])
	require.Equal(t, "righttoken-recall", payload["aud"])
	require.Equal(t, "42", payload["sub"])
	require.Equal(t, "operator@example.com", payload["email"])
	require.Equal(t, float64(now.Unix()), payload["iat"])
	require.Equal(t, float64(now.Add(60*time.Second).Unix()), payload["exp"])
	require.NotEmpty(t, payload["jti"])
	require.Equal(t, "/tasks?status=TODO", queryValue(t, loginURL, "next"))
}

func TestRecallSSOServiceFailsClosedWhenUnconfigured(t *testing.T) {
	t.Parallel()

	svc := NewRecallSSOService(&config.Config{})
	_, err := svc.CheckAccess(context.Background(), &User{
		ID:    42,
		Email: "operator@example.com",
	})
	require.ErrorIs(t, err, ErrRecallSSOUnavailable)

	_, err = svc.CreateLoginURL(&User{
		ID:    42,
		Email: "operator@example.com",
	}, "/dashboard")
	require.ErrorIs(t, err, ErrRecallSSOUnavailable)
}
