package middleware

import (
	"crypto/sha256"
	"crypto/subtle"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// RecallExportAuth protects the read-only recall export endpoint with a
// dedicated internal Bearer secret. An empty server secret fails closed.
func RecallExportAuth(secret string) gin.HandlerFunc {
	expected := []byte(strings.TrimSpace(secret))
	expectedDigest := sha256.Sum256(expected)

	return func(c *gin.Context) {
		if len(expected) < 32 {
			AbortWithError(
				c,
				http.StatusServiceUnavailable,
				"RECALL_EXPORT_UNAVAILABLE",
				"Recall export is unavailable",
			)
			return
		}

		authorization := strings.TrimSpace(c.GetHeader("Authorization"))
		scheme, token, found := strings.Cut(authorization, " ")
		token = strings.TrimSpace(token)
		if !found ||
			!strings.EqualFold(strings.TrimSpace(scheme), "Bearer") ||
			token == "" ||
			subtle.ConstantTimeCompare(
				sha256Digest(token),
				expectedDigest[:],
			) != 1 {
			AbortWithError(
				c,
				http.StatusUnauthorized,
				"UNAUTHORIZED",
				"Authorization required",
			)
			return
		}

		c.Next()
	}
}

func sha256Digest(value string) []byte {
	digest := sha256.Sum256([]byte(value))
	return digest[:]
}
