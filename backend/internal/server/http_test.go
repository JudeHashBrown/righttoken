package server

import (
	"bytes"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestConfigureTrustedProxiesDisablesAllTrustAfterInvalidConfiguration(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	var logs bytes.Buffer
	originalOutput := log.Writer()
	log.SetOutput(&logs)
	t.Cleanup(func() { log.SetOutput(originalOutput) })

	configureTrustedProxies(router, []string{"192.0.2.10", "sensitive-invalid-proxy"})
	router.GET("/client-ip", func(c *gin.Context) {
		c.String(http.StatusOK, c.ClientIP())
	})
	request := httptest.NewRequest(http.MethodGet, "/client-ip", nil)
	request.RemoteAddr = "192.0.2.10:4321"
	request.Header.Set("X-Forwarded-For", "198.51.100.24")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, "192.0.2.10", strings.TrimSpace(response.Body.String()))
	require.Contains(t, logs.String(), "trusted proxy configuration is invalid; proxy trust disabled")
	require.NotContains(t, logs.String(), "sensitive-invalid-proxy")
}

func TestProvideHTTPServerEnablesNativeH2C(t *testing.T) {
	cfg := &config.Config{
		Server: config.ServerConfig{
			Host: "127.0.0.1",
			Port: 8080,
			H2C: config.H2CConfig{
				Enabled:                      true,
				MaxConcurrentStreams:         50,
				MaxReadFrameSize:             1 << 20,
				MaxUploadBufferPerConnection: 2 << 20,
				MaxUploadBufferPerStream:     512 << 10,
			},
		},
	}

	server := ProvideHTTPServer(cfg, gin.New())

	require.NotNil(t, server.Protocols)
	require.True(t, server.Protocols.HTTP1())
	require.True(t, server.Protocols.UnencryptedHTTP2())
	require.NotNil(t, server.HTTP2)
	require.Equal(t, 50, server.HTTP2.MaxConcurrentStreams)
	require.Equal(t, 1<<20, server.HTTP2.MaxReadFrameSize)
	require.Equal(t, 2<<20, server.HTTP2.MaxReceiveBufferPerConnection)
	require.Equal(t, 512<<10, server.HTTP2.MaxReceiveBufferPerStream)
}

func TestProvideHTTPServerLeavesH2CDisabledByDefault(t *testing.T) {
	server := ProvideHTTPServer(&config.Config{}, gin.New())

	require.Nil(t, server.Protocols)
	require.Nil(t, server.HTTP2)
}
