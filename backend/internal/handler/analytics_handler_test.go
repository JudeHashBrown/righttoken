package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type recallVisitTrackerStub struct {
	event service.RecallVisitEvent
	err   error
}

func (tracker *recallVisitTrackerStub) Track(_ context.Context, event service.RecallVisitEvent) error {
	tracker.event = event
	return tracker.err
}

func setupAnalyticsRouter(tracker recallVisitTracker) *gin.Engine {
	return setupAnalyticsRouterWithTrustedProxies(tracker, nil)
}

func setupAnalyticsRouterWithTrustedProxies(tracker recallVisitTracker, trustedProxies []string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	requireNoError := router.SetTrustedProxies(trustedProxies)
	if requireNoError != nil {
		panic(requireNoError)
	}
	router.POST("/api/v1/analytics/visit", newAnalyticsHandler(tracker).Visit)
	return router
}

func performVisitRequest(router *gin.Engine, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, "/api/v1/analytics/visit", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.RemoteAddr = "203.0.113.8:4321"
	if cookie != nil {
		request.AddCookie(cookie)
	}
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	return recorder
}

func TestAnalyticsVisitCreatesAndReusesPrivateVisitorCookie(t *testing.T) {
	tracker := &recallVisitTrackerStub{}
	router := setupAnalyticsRouter(tracker)

	request := httptest.NewRequest(http.MethodPost, "/api/v1/analytics/visit", strings.NewReader(`{"path":"/pricing?coupon=secret#checkout"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Forwarded-For", "198.51.100.24")
	request.RemoteAddr = "203.0.113.8:4321"
	first := httptest.NewRecorder()
	router.ServeHTTP(first, request)

	require.Equal(t, http.StatusNoContent, first.Code)
	require.Equal(t, "203.0.113.8", tracker.event.IP)
	require.Equal(t, "/pricing", tracker.event.Path)
	cookies := first.Result().Cookies()
	require.Len(t, cookies, 1)
	require.Equal(t, "rt_vid", cookies[0].Name)
	require.True(t, cookies[0].HttpOnly)
	require.Equal(t, http.SameSiteLaxMode, cookies[0].SameSite)
	require.Len(t, tracker.event.VisitorID, 43)
	firstVisitorID := tracker.event.VisitorID

	second := performVisitRequest(router, `{"path":"/dashboard"}`, cookies[0])

	require.Equal(t, http.StatusNoContent, second.Code)
	require.Equal(t, firstVisitorID, tracker.event.VisitorID)
	require.Empty(t, second.Header().Get("Set-Cookie"))
}

func TestAnalyticsVisitUsesForwardedClientIPFromTrustedProxy(t *testing.T) {
	tracker := &recallVisitTrackerStub{}
	router := setupAnalyticsRouterWithTrustedProxies(tracker, []string{"192.0.2.10"})
	request := httptest.NewRequest(http.MethodPost, "/api/v1/analytics/visit", strings.NewReader(`{"path":"/"}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Forwarded-For", "198.51.100.24, 192.0.2.10")
	request.RemoteAddr = "192.0.2.10:4321"
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
	require.Equal(t, "198.51.100.24", tracker.event.IP)
}

func TestAnalyticsVisitNeverBreaksBrowsing(t *testing.T) {
	tracker := &recallVisitTrackerStub{err: errors.New("recall unavailable")}
	router := setupAnalyticsRouter(tracker)

	upstreamFailure := performVisitRequest(router, `{"path":"/"}`, nil)
	invalidBody := performVisitRequest(router, `{"path":"https://evil.example"}`, nil)

	require.Equal(t, http.StatusNoContent, upstreamFailure.Code)
	require.Equal(t, http.StatusNoContent, invalidBody.Code)
}
