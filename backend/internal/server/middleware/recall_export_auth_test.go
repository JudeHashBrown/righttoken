//go:build unit

package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestRecallExportAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)

	newRouter := func(secret string) *gin.Engine {
		router := gin.New()
		router.Use(RecallExportAuth(secret))
		router.GET("/users", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"ok": true})
		})
		return router
	}

	tests := []struct {
		name       string
		secret     string
		header     string
		wantStatus int
	}{
		{
			name:       "fails closed when server secret is empty",
			secret:     "",
			header:     "Bearer test-recall-secret-at-least-32-bytes",
			wantStatus: http.StatusServiceUnavailable,
		},
		{
			name:       "fails closed when server secret is too short",
			secret:     "short",
			header:     "Bearer short",
			wantStatus: http.StatusServiceUnavailable,
		},
		{
			name:       "rejects missing authorization",
			secret:     "test-recall-secret-at-least-32-bytes",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "rejects malformed authorization",
			secret:     "test-recall-secret-at-least-32-bytes",
			header:     "Basic test-recall-secret-at-least-32-bytes",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "rejects wrong bearer secret",
			secret:     "test-recall-secret-at-least-32-bytes",
			header:     "Bearer wrong-recall-secret-at-least-32-bytes",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "allows matching bearer secret",
			secret:     "test-recall-secret-at-least-32-bytes",
			header:     "Bearer test-recall-secret-at-least-32-bytes",
			wantStatus: http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/users", nil)
			if tt.header != "" {
				request.Header.Set("Authorization", tt.header)
			}
			response := httptest.NewRecorder()

			newRouter(tt.secret).ServeHTTP(response, request)

			require.Equal(t, tt.wantStatus, response.Code)
			if tt.secret != "" {
				require.NotContains(t, response.Body.String(), tt.secret)
			}
			require.NotContains(t, response.Body.String(), "wrong-recall-secret")
		})
	}
}
