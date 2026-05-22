// Package service — OpenAI-compatible (Qwen / DeepSeek / Moonshot / ...)
// passthrough gateway. The upstream already speaks OpenAI Chat Completions
// natively, so we swap the auth header and forward the body, while parsing
// the response just enough to record token usage and bill.
//
// Day-3b: full billing parity with OpenAI/Anthropic paths — rate multiplier,
// LiteLLM/channel pricing, balance deduction, API key quota and rate-limit
// usage updates, subscription window maintenance.
package service

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/Wei-Shaw/sub2api/internal/pkg/logger"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

// CompatForwardResult captures the bits of an upstream response we care about
// after a passthrough call. Token counters feed RecordCompatUsage downstream.
type CompatForwardResult struct {
	StatusCode    int
	Stream        bool
	InputTokens   int
	OutputTokens  int
	TotalTokens   int
	Model         string // model echoed by upstream (may differ from requested in case mapping)
	RequestID     string
	Duration      time.Duration
	FirstTokenMs  *int
	BytesReceived int
}

// ForwardChatCompletionsPassthrough forwards a Chat Completions request body
// to the account's configured upstream, replacing only the auth header. On
// success it parses usage tokens out of the response (non-stream JSON or SSE
// final-chunk) and returns a result for the caller to record + bill.
//
// This is the hot path for openai_compat-family platforms (PlatformQwen,
// PlatformOpenAICompat).
func (s *OpenAIGatewayService) ForwardChatCompletionsPassthrough(
	ctx context.Context,
	c *gin.Context,
	apiKey *APIKey,
	account *Account,
	body []byte,
) (*CompatForwardResult, error) {
	_ = apiKey // kept in signature for symmetry with billing-aware callers
	baseURL := account.GetCompatBaseURL()
	if baseURL == "" {
		return nil, fmt.Errorf("account %d missing credentials.base_url", account.ID)
	}
	apiKeySecret := account.GetCompatAPIKey()
	if apiKeySecret == "" {
		return nil, fmt.Errorf("account %d missing credentials.api_key", account.ID)
	}

	upstreamURL := buildCompatChatCompletionsURL(baseURL)

	isStream := gjson.GetBytes(body, "stream").Bool()
	// Force upstream to include usage in the final SSE chunk so we can bill it.
	// OpenAI spec: "stream_options.include_usage": true. yqg6 / DashScope honor this.
	if isStream {
		if mutated, err := sjson.SetBytes(body, "stream_options.include_usage", true); err == nil {
			body = mutated
		}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, upstreamURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build upstream request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKeySecret)
	req.Header.Set("Content-Type", "application/json")
	if accept := c.Request.Header.Get("Accept"); accept != "" {
		req.Header.Set("Accept", accept)
	}
	if ua := c.Request.Header.Get("User-Agent"); ua != "" {
		req.Header.Set("User-Agent", ua)
	}

	proxyURL := ""
	if account.ProxyID != nil {
		_ = account.ProxyID
	}

	startTime := time.Now()
	resp, err := s.httpUpstream.Do(req, proxyURL, account.ID, account.Concurrency)
	if err != nil {
		return nil, fmt.Errorf("upstream call: %w", err)
	}
	defer resp.Body.Close()

	result := &CompatForwardResult{
		StatusCode: resp.StatusCode,
		Stream:     isStream,
	}

	// Copy response headers (excluding hop-by-hop) before WriteHeader.
	for key, values := range resp.Header {
		if isHopByHopHeader(key) {
			continue
		}
		for _, v := range values {
			c.Writer.Header().Add(key, v)
		}
	}
	c.Writer.WriteHeader(resp.StatusCode)

	// Upstream error → don't parse usage, just stream bytes through.
	if resp.StatusCode >= 400 {
		n, _ := io.Copy(c.Writer, resp.Body)
		result.BytesReceived = int(n)
		result.Duration = time.Since(startTime)
		if flusher, ok := c.Writer.(http.Flusher); ok {
			flusher.Flush()
		}
		return result, nil
	}

	if isStream {
		s.streamCompatResponse(c, resp.Body, result, startTime)
	} else {
		if err := s.bufferCompatResponse(c, resp.Body, result); err != nil {
			return result, err
		}
	}
	result.Duration = time.Since(startTime)
	return result, nil
}

// bufferCompatResponse reads the whole non-stream body, parses usage and
// echoes bytes to the client.
func (s *OpenAIGatewayService) bufferCompatResponse(
	c *gin.Context,
	body io.Reader,
	result *CompatForwardResult,
) error {
	respBytes, err := io.ReadAll(body)
	if err != nil {
		return fmt.Errorf("read upstream body: %w", err)
	}
	result.BytesReceived = len(respBytes)

	if usage := gjson.GetBytes(respBytes, "usage"); usage.Exists() {
		result.InputTokens = int(gjson.GetBytes(respBytes, "usage.prompt_tokens").Int())
		result.OutputTokens = int(gjson.GetBytes(respBytes, "usage.completion_tokens").Int())
		result.TotalTokens = int(gjson.GetBytes(respBytes, "usage.total_tokens").Int())
	}
	if m := gjson.GetBytes(respBytes, "model").String(); m != "" {
		result.Model = m
	}
	if id := gjson.GetBytes(respBytes, "id").String(); id != "" {
		result.RequestID = id
	}

	if _, err := c.Writer.Write(respBytes); err != nil {
		return fmt.Errorf("write client body: %w", err)
	}
	if flusher, ok := c.Writer.(http.Flusher); ok {
		flusher.Flush()
	}
	return nil
}

// streamCompatResponse tees each SSE line from the upstream to the client
// while accumulating usage from any data: chunks. Tolerates the final
// data: [DONE] terminator and missing-usage cases (records 0/0).
func (s *OpenAIGatewayService) streamCompatResponse(
	c *gin.Context,
	body io.Reader,
	result *CompatForwardResult,
	startTime time.Time,
) {
	reader := bufio.NewReaderSize(body, 64*1024)
	flusher, _ := c.Writer.(http.Flusher)
	var firstTokenAt time.Time

	for {
		line, readErr := reader.ReadBytes('\n')
		if len(line) > 0 {
			if _, werr := c.Writer.Write(line); werr != nil {
				// Client disconnected mid-stream — finish parsing what we have.
				_, _ = io.Copy(io.Discard, body)
				break
			}
			result.BytesReceived += len(line)
			if flusher != nil {
				flusher.Flush()
			}

			trimmed := bytes.TrimRight(line, "\r\n")
			if bytes.HasPrefix(trimmed, []byte("data: ")) {
				payload := bytes.TrimPrefix(trimmed, []byte("data: "))
				if !bytes.Equal(payload, []byte("[DONE]")) && len(payload) > 0 {
					if firstTokenAt.IsZero() {
						if delta := gjson.GetBytes(payload, "choices.0.delta.content"); delta.Exists() && delta.String() != "" {
							firstTokenAt = time.Now()
						}
					}
					if u := gjson.GetBytes(payload, "usage"); u.Exists() && u.Type == gjson.JSON {
						result.InputTokens = int(gjson.GetBytes(payload, "usage.prompt_tokens").Int())
						result.OutputTokens = int(gjson.GetBytes(payload, "usage.completion_tokens").Int())
						result.TotalTokens = int(gjson.GetBytes(payload, "usage.total_tokens").Int())
					}
					if result.Model == "" {
						if m := gjson.GetBytes(payload, "model").String(); m != "" {
							result.Model = m
						}
					}
					if result.RequestID == "" {
						if id := gjson.GetBytes(payload, "id").String(); id != "" {
							result.RequestID = id
						}
					}
				}
			}
		}
		if readErr != nil {
			break
		}
	}
	if !firstTokenAt.IsZero() {
		ms := int(firstTokenAt.Sub(startTime).Milliseconds())
		result.FirstTokenMs = &ms
	}
}

// CompatRecordUsageInput — billing input for RecordCompatUsage.
type CompatRecordUsageInput struct {
	Result         *CompatForwardResult
	APIKey         *APIKey
	User           *User
	Account        *Account
	Subscription   *UserSubscription
	RequestedModel string // client-requested model name (used for pricing lookup)
	UserAgent      string
	IPAddress      string
	APIKeyService  APIKeyQuotaUpdater
}

// RecordCompatUsage applies rate multiplier, computes cost from LiteLLM /
// channel pricing, writes a usage_log row and deducts the user's balance
// (or updates subscription usage). Mirrors OpenAIGatewayService.RecordUsage
// semantics for the openai_compat passthrough path.
//
// Zero-token results (upstream didn't return usage) are skipped: nothing was
// billable, nothing to log.
func (s *OpenAIGatewayService) RecordCompatUsage(ctx context.Context, input *CompatRecordUsageInput) error {
	if input == nil || input.Result == nil {
		return nil
	}
	result := input.Result

	if result.StatusCode >= 400 {
		return nil
	}
	if result.InputTokens == 0 && result.OutputTokens == 0 {
		return nil
	}

	apiKey := input.APIKey
	user := input.User
	account := input.Account
	subscription := input.Subscription
	if apiKey == nil || user == nil || account == nil {
		return nil
	}

	// 1. Rate multiplier (group base × user-group override).
	multiplier := 1.0
	if s.cfg != nil {
		multiplier = s.cfg.Default.RateMultiplier
	}
	if apiKey.GroupID != nil && apiKey.Group != nil {
		resolver := s.userGroupRateResolver
		if resolver == nil {
			resolver = newUserGroupRateResolver(nil, nil, resolveUserGroupRateCacheTTL(s.cfg), nil, "service.openai_compat")
		}
		multiplier = resolver.Resolve(ctx, user.ID, *apiKey.GroupID, apiKey.Group.RateMultiplier)
	}

	// 2. Cost calculation via LiteLLM JSON / channel override.
	tokens := UsageTokens{
		InputTokens:  result.InputTokens,
		OutputTokens: result.OutputTokens,
	}
	billingModel := input.RequestedModel
	if billingModel == "" {
		billingModel = result.Model
	}

	var cost *CostBreakdown
	var costErr error
	if s.resolver != nil && apiKey.Group != nil {
		gid := apiKey.Group.ID
		cost, costErr = s.billingService.CalculateCostUnified(CostInput{
			Ctx:            ctx,
			Model:          billingModel,
			GroupID:        &gid,
			Tokens:         tokens,
			RequestCount:   1,
			RateMultiplier: multiplier,
			Resolver:       s.resolver,
		})
	} else {
		cost, costErr = s.billingService.CalculateCostWithServiceTier(billingModel, tokens, multiplier, "")
	}
	if costErr != nil {
		// Pricing not found → log a zero-cost row so the call still shows in usage
		// records. Admin can backfill pricing via JSON or channel config.
		cost = &CostBreakdown{ActualCost: 0, BillingMode: string(BillingModeToken)}
		logger.LegacyPrintf("service.openai_compat", "pricing lookup failed for model=%s: %v (logging at zero cost)", billingModel, costErr)
	}

	// 3. Determine billing type (balance vs subscription).
	isSubscriptionBilling := subscription != nil && apiKey.Group != nil && apiKey.Group.IsSubscriptionType()
	billingType := BillingTypeBalance
	if isSubscriptionBilling {
		billingType = BillingTypeSubscription
	}

	// 4. Build usage_log row.
	durationMs := int(result.Duration.Milliseconds())
	accountRateMultiplier := account.BillingRateMultiplier()
	requestID := result.RequestID

	requestType := RequestTypeSync
	if result.Stream {
		requestType = RequestTypeStream
	}

	usageLog := &UsageLog{
		UserID:         user.ID,
		APIKeyID:       apiKey.ID,
		AccountID:      account.ID,
		RequestID:      requestID,
		Model:          billingModel,
		RequestedModel: input.RequestedModel,
		InputTokens:    result.InputTokens,
		OutputTokens:   result.OutputTokens,
	}
	if cost != nil {
		usageLog.InputCost = cost.InputCost
		usageLog.OutputCost = cost.OutputCost
		usageLog.TotalCost = cost.TotalCost
		usageLog.ActualCost = cost.ActualCost
	}
	usageLog.RateMultiplier = multiplier
	usageLog.AccountRateMultiplier = &accountRateMultiplier
	usageLog.BillingType = billingType
	usageLog.RequestType = requestType
	usageLog.Stream = result.Stream
	usageLog.DurationMs = &durationMs
	usageLog.FirstTokenMs = result.FirstTokenMs
	usageLog.CreatedAt = time.Now()
	usageLog.SyncRequestTypeAndLegacyFields()

	billingMode := string(BillingModeToken)
	if cost != nil && cost.BillingMode != "" {
		billingMode = cost.BillingMode
	}
	usageLog.BillingMode = &billingMode

	if input.UserAgent != "" {
		usageLog.UserAgent = &input.UserAgent
	}
	if input.IPAddress != "" {
		usageLog.IPAddress = &input.IPAddress
	}
	if apiKey.GroupID != nil {
		usageLog.GroupID = apiKey.GroupID
	}
	if subscription != nil {
		usageLog.SubscriptionID = &subscription.ID
	}

	// 5. SimpleMode → log only, no billing.
	if s.cfg != nil && s.cfg.RunMode == config.RunModeSimple {
		writeUsageLogBestEffort(ctx, s.usageLogRepo, usageLog, "service.openai_compat")
		if s.deferredService != nil {
			s.deferredService.ScheduleLastUsedUpdate(account.ID)
		}
		return nil
	}

	// 6. Billing pass (deducts balance / subscription usage, updates API key
	//    quota + rate-limit usage, schedules account last-used).
	if _, billingErr := applyUsageBilling(ctx, requestID, usageLog, &postUsageBillingParams{
		Cost:                  cost,
		User:                  user,
		APIKey:                apiKey,
		Account:               account,
		Subscription:          subscription,
		IsSubscriptionBill:    isSubscriptionBilling,
		AccountRateMultiplier: accountRateMultiplier,
		APIKeyService:         input.APIKeyService,
	}, s.billingDeps(), s.usageBillingRepo); billingErr != nil {
		return billingErr
	}

	writeUsageLogBestEffort(ctx, s.usageLogRepo, usageLog, "service.openai_compat")
	return nil
}

// SelectCompatAccount picks the first active + schedulable openai_compat
// account from the group. Naive selection — no load balancing, no sticky
// session, no failover. Sufficient for MVP; the production path should
// reuse the scheduler infrastructure.
func (s *OpenAIGatewayService) SelectCompatAccount(
	ctx context.Context,
	groupID int64,
) (*Account, error) {
	accounts, err := s.accountRepo.ListByGroup(ctx, groupID)
	if err != nil {
		return nil, fmt.Errorf("list accounts in group %d: %w", groupID, err)
	}
	for i := range accounts {
		a := &accounts[i]
		if !a.IsOpenAICompat() {
			continue
		}
		if !a.IsSchedulable() {
			continue
		}
		return a, nil
	}
	return nil, fmt.Errorf("no schedulable openai_compat account in group %d", groupID)
}

// buildCompatChatCompletionsURL turns a base URL into the full chat completions
// endpoint. Accepts either a bare base ("https://dashscope.aliyuncs.com/compatible-mode"),
// a base already ending in "/v1", or a fully-qualified path.
func buildCompatChatCompletionsURL(base string) string {
	normalized := strings.TrimRight(strings.TrimSpace(base), "/")
	if strings.HasSuffix(normalized, "/chat/completions") {
		return normalized
	}
	if strings.HasSuffix(normalized, "/v1") {
		return normalized + "/chat/completions"
	}
	return normalized + "/v1/chat/completions"
}

func isHopByHopHeader(name string) bool {
	switch strings.ToLower(name) {
	case "connection",
		"keep-alive",
		"proxy-authenticate",
		"proxy-authorization",
		"te",
		"trailer",
		"transfer-encoding",
		"upgrade":
		return true
	}
	return false
}
