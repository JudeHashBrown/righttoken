package routes

import (
	"github.com/Wei-Shaw/sub2api/internal/handler"
	"github.com/gin-gonic/gin"
)

func RegisterAnalyticsRoutes(
	v1 *gin.RouterGroup,
	handlers *handler.Handlers,
) {
	analytics := v1.Group("/analytics")
	analytics.POST("/visit", handlers.Analytics.Visit)
}
