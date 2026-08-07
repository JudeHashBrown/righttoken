package handler

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/pkg/ip"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
)

const (
	visitorCookieName = "rt_vid"
	visitorCookieAge  = 365 * 24 * 60 * 60
)

type recallVisitTracker interface {
	Track(context.Context, service.RecallVisitEvent) error
}

type AnalyticsHandler struct {
	tracker       recallVisitTracker
	now           func() time.Time
	warn          func(string)
	warningMu     sync.Mutex
	hasWarned     bool
	lastWarningAt time.Time
}

func NewAnalyticsHandler(tracker *service.RecallVisitService) *AnalyticsHandler {
	return newAnalyticsHandler(tracker)
}

func newAnalyticsHandler(tracker recallVisitTracker) *AnalyticsHandler {
	return newAnalyticsHandlerWithDiagnostics(tracker, time.Now, func(kind string) {
		slog.Warn("recall_visit_tracking_failed", "kind", kind)
	})
}

func newAnalyticsHandlerWithDiagnostics(
	tracker recallVisitTracker,
	now func() time.Time,
	warn func(string),
) *AnalyticsHandler {
	return &AnalyticsHandler{tracker: tracker, now: now, warn: warn}
}

func newVisitorID() (string, bool) {
	randomValue := make([]byte, 32)
	if _, err := rand.Read(randomValue); err != nil {
		return "", false
	}
	return base64.RawURLEncoding.EncodeToString(randomValue), true
}

func validVisitorID(value string) bool {
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	return err == nil && len(decoded) == 32
}

func normalizedVisitPath(rawPath string) (string, bool) {
	path := rawPath
	if separator := strings.IndexAny(path, "?#"); separator >= 0 {
		path = path[:separator]
	}
	if path == "" {
		path = "/"
	}
	if !strings.HasPrefix(path, "/") || len(path) > 500 {
		return "", false
	}
	return path, true
}

func requestUsesHTTPS(request *http.Request) bool {
	if request == nil {
		return false
	}
	return request.TLS != nil ||
		strings.EqualFold(
			strings.TrimSpace(request.Header.Get("X-Forwarded-Proto")),
			"https",
		)
}

func (handler *AnalyticsHandler) Visit(c *gin.Context) {
	var input struct {
		Path string `json:"path"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(c.Writer, c.Request.Body, 2<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		c.Status(http.StatusNoContent)
		return
	}
	path, ok := normalizedVisitPath(input.Path)
	if !ok {
		c.Status(http.StatusNoContent)
		return
	}

	visitorID, err := c.Cookie(visitorCookieName)
	if err != nil || !validVisitorID(visitorID) {
		var generated bool
		visitorID, generated = newVisitorID()
		if !generated {
			c.Status(http.StatusNoContent)
			return
		}
		http.SetCookie(c.Writer, &http.Cookie{
			Name:     visitorCookieName,
			Value:    visitorID,
			Path:     "/",
			MaxAge:   visitorCookieAge,
			HttpOnly: true,
			Secure:   requestUsesHTTPS(c.Request),
			SameSite: http.SameSiteLaxMode,
		})
	}

	if handler.tracker != nil {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2300*time.Millisecond)
		defer cancel()
		if err := handler.tracker.Track(ctx, service.RecallVisitEvent{
			VisitorID: visitorID,
			IP:        ip.GetTrustedClientIP(c),
			Path:      path,
		}); err != nil {
			handler.warnTrackingFailure(classifyRecallVisitTrackingError(err))
		}
	}
	c.Status(http.StatusNoContent)
}

func classifyRecallVisitTrackingError(err error) string {
	switch {
	case errors.Is(err, service.ErrRecallVisitUnavailable):
		return "unconfigured"
	case errors.Is(err, context.DeadlineExceeded), errors.Is(err, context.Canceled):
		return "timeout"
	default:
		return "forward_failed"
	}
}

func (handler *AnalyticsHandler) warnTrackingFailure(kind string) {
	now := handler.now()
	handler.warningMu.Lock()
	if handler.hasWarned && now.Sub(handler.lastWarningAt) < time.Minute {
		handler.warningMu.Unlock()
		return
	}
	handler.hasWarned = true
	handler.lastWarningAt = now
	handler.warningMu.Unlock()
	handler.warn(kind)
}
