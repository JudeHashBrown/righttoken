package server

import (
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

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
