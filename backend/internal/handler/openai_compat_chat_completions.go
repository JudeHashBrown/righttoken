package handler

import (
	"context"
	"errors"
	"net/http"

	pkghttputil "github.com/Wei-Shaw/sub2api/internal/pkg/httputil"
	middleware2 "github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	"go.uber.org/zap"
)

// ChatCompletionsCompat handles /v1/chat/completions for openai_compat-family
// platforms (Qwen, DeepSeek, Moonshot, ...). The upstream already speaks OpenAI
// Chat Completions natively, so the gateway does a thin passthrough — auth
// header replaced, request body forwarded verbatim, response streamed back.
//
// Day-1 MVP: no failover, no usage recording, no channel-level model mapping.
// First job is end-to-end verification via curl. Production features land in
// Days 2-3.
func (h *OpenAIGatewayHandler) ChatCompletionsCompat(c *gin.Context) {
	streamStarted := false
	defer h.recoverResponsesPanic(c, &streamStarted)

	apiKey, ok := middleware2.GetAPIKeyFromContext(c)
	if !ok {
		h.errorResponse(c, http.StatusUnauthorized, "authentication_error", "Invalid API key")
		return
	}

	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		h.errorResponse(c, http.StatusInternalServerError, "api_error", "User context not found")
		return
	}

	reqLog := requestLogger(
		c,
		"handler.openai_gateway.chat_completions_compat",
		zap.Int64("user_id", subject.UserID),
		zap.Int64("api_key_id", apiKey.ID),
		zap.Any("group_id", apiKey.GroupID),
	)

	body, err := pkghttputil.ReadRequestBodyWithPrealloc(c.Request)
	if err != nil {
		if maxErr, ok := extractMaxBytesError(err); ok {
			h.errorResponse(c, http.StatusRequestEntityTooLarge, "invalid_request_error", buildBodyTooLargeMessage(maxErr.Limit))
			return
		}
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Failed to read request body")
		return
	}
	if len(body) == 0 {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Request body is empty")
		return
	}
	if !gjson.ValidBytes(body) {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "Failed to parse request body")
		return
	}

	modelResult := gjson.GetBytes(body, "model")
	if !modelResult.Exists() || modelResult.Type != gjson.String || modelResult.String() == "" {
		h.errorResponse(c, http.StatusBadRequest, "invalid_request_error", "model is required")
		return
	}
	reqModel := modelResult.String()

	if apiKey.GroupID == nil {
		h.errorResponse(c, http.StatusForbidden, "permission_error", "API key is not assigned to a group")
		return
	}

	account, err := h.gatewayService.SelectCompatAccount(c.Request.Context(), *apiKey.GroupID)
	if err != nil {
		reqLog.Warn("openai_compat.account_select_failed", zap.Error(err))
		h.errorResponse(c, http.StatusServiceUnavailable, "api_error", "No available accounts")
		return
	}

	reqLog = reqLog.With(
		zap.String("model", reqModel),
		zap.Int64("account_id", account.ID),
		zap.String("provider_label", account.GetProviderLabel()),
	)
	reqLog.Debug("openai_compat.forwarding")

	streamStarted = true
	result, err := h.gatewayService.ForwardChatCompletionsPassthrough(c.Request.Context(), c, apiKey, account, body)
	if err != nil {
		// If nothing has been written yet, surface a clean error. Once any byte
		// has hit the wire (header or body chunk), the upstream's own response
		// is whatever the client sees.
		if c.Writer.Size() <= 0 {
			h.errorResponse(c, http.StatusBadGateway, "api_error", "Upstream request failed")
		}
		// Use errors.Is for context cancellation classification later.
		_ = errors.Is
		reqLog.Warn("openai_compat.forward_failed", zap.Error(err))
		return
	}
	if result == nil {
		return
	}
	reqLog.Debug("openai_compat.request_completed",
		zap.Int("status", result.StatusCode),
		zap.Int("input_tokens", result.InputTokens),
		zap.Int("output_tokens", result.OutputTokens),
		zap.Bool("stream", result.Stream),
		zap.Duration("duration", result.Duration),
	)

	subscription, _ := middleware2.GetSubscriptionFromContext(c)

	recordCtx := c.Request.Context()
	if result.Stream {
		// Stream response already flushed to client; detach billing from the
		// request context so a client disconnect doesn't cancel deduction.
		recordCtx = context.WithoutCancel(recordCtx)
	}

	if recordErr := h.gatewayService.RecordCompatUsage(recordCtx, &service.CompatRecordUsageInput{
		Result:         result,
		APIKey:         apiKey,
		User:           apiKey.User,
		Account:        account,
		Subscription:   subscription,
		RequestedModel: reqModel,
		UserAgent:      c.Request.UserAgent(),
		IPAddress:      c.ClientIP(),
		APIKeyService:  h.apiKeyService,
	}); recordErr != nil {
		reqLog.Warn("openai_compat.record_usage_failed", zap.Error(recordErr))
	}
}
