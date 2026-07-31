package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/google/uuid"
)

var ErrRecallVisitUnavailable = errors.New("recall visit tracking is unavailable")

type RecallVisitEvent struct {
	VisitorID string
	IP        string
	Path      string
}

type recallVisitHTTPClient interface {
	Do(request *http.Request) (*http.Response, error)
}

type RecallVisitService struct {
	cfg        config.RecallSSOConfig
	httpClient recallVisitHTTPClient
	now        func() time.Time
	newEventID func() string
}

func NewRecallVisitService(cfg *config.Config) *RecallVisitService {
	recallCfg := config.RecallSSOConfig{}
	if cfg != nil {
		recallCfg = cfg.RecallSSO
	}
	return newRecallVisitService(
		recallCfg,
		&http.Client{Timeout: 2 * time.Second},
		time.Now,
		uuid.NewString,
	)
}

func newRecallVisitService(
	cfg config.RecallSSOConfig,
	httpClient recallVisitHTTPClient,
	now func() time.Time,
	newEventID func() string,
) *RecallVisitService {
	return &RecallVisitService{
		cfg:        cfg,
		httpClient: httpClient,
		now:        now,
		newEventID: newEventID,
	}
}

func (service *RecallVisitService) configured() bool {
	return service != nil &&
		strings.TrimSpace(service.cfg.BaseURL) != "" &&
		len(strings.TrimSpace(service.cfg.InternalSecret)) >= 32
}

func (service *RecallVisitService) Track(
	ctx context.Context,
	event RecallVisitEvent,
) error {
	if !service.configured() ||
		strings.TrimSpace(event.VisitorID) == "" ||
		strings.TrimSpace(event.IP) == "" ||
		!strings.HasPrefix(event.Path, "/") {
		return ErrRecallVisitUnavailable
	}

	payload, err := json.Marshal(map[string]string{
		"eventId":    service.newEventID(),
		"occurredAt": service.now().UTC().Format(time.RFC3339Nano),
		"visitorId":  event.VisitorID,
		"ip":         event.IP,
		"path":       event.Path,
	})
	if err != nil {
		return fmt.Errorf("encode recall visit request: %w", err)
	}

	endpoint := strings.TrimRight(service.cfg.BaseURL, "/") +
		"/api/internal/righttoken/visits"
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		endpoint,
		bytes.NewReader(payload),
	)
	if err != nil {
		return fmt.Errorf("create recall visit request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+service.cfg.InternalSecret)
	request.Header.Set("Content-Type", "application/json")

	response, err := service.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("send recall visit request: %w", err)
	}
	defer func() {
		_ = response.Body.Close()
	}()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4<<10))
	if response.StatusCode < http.StatusOK ||
		response.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf(
			"send recall visit request: status %d",
			response.StatusCode,
		)
	}
	return nil
}
