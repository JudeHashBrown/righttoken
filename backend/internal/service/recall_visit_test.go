package service

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/stretchr/testify/require"
)

type recallVisitRoundTripper func(*http.Request) (*http.Response, error)

func (transport recallVisitRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	return transport(request)
}

func TestRecallVisitServiceTrack(t *testing.T) {
	var captured *http.Request
	var payload map[string]any
	client := &http.Client{
		Transport: recallVisitRoundTripper(func(request *http.Request) (*http.Response, error) {
			captured = request
			require.NoError(t, json.NewDecoder(request.Body).Decode(&payload))
			return &http.Response{
				StatusCode: http.StatusAccepted,
				Body:       io.NopCloser(strings.NewReader(`{"accepted":true}`)),
				Header:     make(http.Header),
			}, nil
		}),
	}
	now := time.Date(2026, time.July, 31, 8, 0, 0, 0, time.UTC)
	service := newRecallVisitService(
		config.RecallSSOConfig{
			BaseURL:        "https://recall.righttoken.ai/",
			InternalSecret: strings.Repeat("s", 32),
		},
		client,
		func() time.Time { return now },
		func() string { return "c6a7a796-33c4-4cb3-9c0a-4504165d8c80" },
	)

	err := service.Track(context.Background(), RecallVisitEvent{
		VisitorID: strings.Repeat("v", 43),
		IP:        "203.0.113.8",
		Path:      "/pricing",
	})

	require.NoError(t, err)
	require.Equal(t, "https://recall.righttoken.ai/api/internal/righttoken/visits", captured.URL.String())
	require.Equal(t, "Bearer "+strings.Repeat("s", 32), captured.Header.Get("Authorization"))
	require.Equal(t, "c6a7a796-33c4-4cb3-9c0a-4504165d8c80", payload["eventId"])
	require.Equal(t, now.Format(time.RFC3339Nano), payload["occurredAt"])
	require.Equal(t, strings.Repeat("v", 43), payload["visitorId"])
	require.Equal(t, "203.0.113.8", payload["ip"])
	require.Equal(t, "/pricing", payload["path"])
}

func TestRecallVisitServiceFailsClosedWhenUnconfigured(t *testing.T) {
	service := NewRecallVisitService(&config.Config{})

	err := service.Track(context.Background(), RecallVisitEvent{
		VisitorID: strings.Repeat("v", 43),
		IP:        "203.0.113.8",
		Path:      "/",
	})

	require.ErrorIs(t, err, ErrRecallVisitUnavailable)
}
