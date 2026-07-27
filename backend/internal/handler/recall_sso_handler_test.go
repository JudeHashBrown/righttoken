package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type recallSSOUserStub struct {
	user *service.User
	err  error
}

func (s recallSSOUserStub) GetByID(context.Context, int64) (*service.User, error) {
	return s.user, s.err
}

type recallSSOServiceStub struct {
	allowed  bool
	checkErr error
	loginURL string
	loginErr error
}

func (s recallSSOServiceStub) CheckAccess(context.Context, *service.User) (bool, error) {
	return s.allowed, s.checkErr
}

func (s recallSSOServiceStub) CreateLoginURL(*service.User, string) (string, error) {
	return s.loginURL, s.loginErr
}

func setupRecallSSORouter(
	user recallSSOUser,
	sso recallSSO,
) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set(string(middleware.ContextKeyUser), middleware.AuthSubject{UserID: 42})
		c.Next()
	})
	handler := newRecallSSOHandler(user, sso)
	router.GET("/api/v1/user/recall/access", handler.Access)
	router.POST("/api/v1/user/recall/sso", handler.Start)
	return router
}

func decodeRecallSSOResponse(t *testing.T, recorder *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &body))
	return body
}

func TestRecallSSOHandlerAccess(t *testing.T) {
	router := setupRecallSSORouter(
		recallSSOUserStub{user: &service.User{ID: 42, Email: "operator@example.com"}},
		recallSSOServiceStub{allowed: true},
	)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/user/recall/access", nil)
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	body := decodeRecallSSOResponse(t, recorder)
	data, ok := body["data"].(map[string]any)
	require.True(t, ok)
	allowed, ok := data["allowed"].(bool)
	require.True(t, ok)
	require.True(t, allowed)
}

func TestRecallSSOHandlerStartReturnsLoginURL(t *testing.T) {
	router := setupRecallSSORouter(
		recallSSOUserStub{user: &service.User{ID: 42, Email: "operator@example.com"}},
		recallSSOServiceStub{
			allowed:  true,
			loginURL: "https://recall.righttoken.ai/api/auth/righttoken/callback?ticket=redacted",
		},
	)
	request := httptest.NewRequest(http.MethodPost, "/api/v1/user/recall/sso?next=%2Fdashboard", nil)
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code)
	body := decodeRecallSSOResponse(t, recorder)
	data, ok := body["data"].(map[string]any)
	require.True(t, ok)
	loginURL, ok := data["url"].(string)
	require.True(t, ok)
	require.Equal(
		t,
		"https://recall.righttoken.ai/api/auth/righttoken/callback?ticket=redacted",
		loginURL,
	)
}

func TestRecallSSOHandlerDeniesUnknownAndFailsClosed(t *testing.T) {
	deniedRouter := setupRecallSSORouter(
		recallSSOUserStub{user: &service.User{ID: 42, Email: "operator@example.com"}},
		recallSSOServiceStub{allowed: false},
	)
	deniedRequest := httptest.NewRequest(http.MethodPost, "/api/v1/user/recall/sso", nil)
	deniedRecorder := httptest.NewRecorder()
	deniedRouter.ServeHTTP(deniedRecorder, deniedRequest)
	require.Equal(t, http.StatusForbidden, deniedRecorder.Code)

	unavailableRouter := setupRecallSSORouter(
		recallSSOUserStub{user: &service.User{ID: 42, Email: "operator@example.com"}},
		recallSSOServiceStub{checkErr: errors.New("private upstream error")},
	)
	unavailableRequest := httptest.NewRequest(http.MethodGet, "/api/v1/user/recall/access", nil)
	unavailableRecorder := httptest.NewRecorder()
	unavailableRouter.ServeHTTP(unavailableRecorder, unavailableRequest)
	require.Equal(t, http.StatusServiceUnavailable, unavailableRecorder.Code)
	require.NotContains(t, unavailableRecorder.Body.String(), "private upstream error")
}
