package admin

import (
	"strconv"
	"strings"

	"github.com/Wei-Shaw/sub2api/internal/pkg/response"
	middleware2 "github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"

	"github.com/gin-gonic/gin"
)

// ReferralAdminHandler 后台二级分销端点
type ReferralAdminHandler struct {
	referralService *service.ReferralService
}

func NewReferralAdminHandler(referralService *service.ReferralService) *ReferralAdminHandler {
	return &ReferralAdminHandler{referralService: referralService}
}

// ListRules 所有费率规则（含历史）
// GET /api/v1/admin/referral/rules
func (h *ReferralAdminHandler) ListRules(c *gin.Context) {
	rules, err := h.referralService.AdminListRules(c.Request.Context())
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, gin.H{"items": rules})
}

type updateRuleRequest struct {
	// 注意：float64 不能用 binding:"required"——会把 0 当作缺失。
	// 0 是合法值（允许暂停某层分销），范围由 service 层 AdminUpdateRate 校验 [0,1]。
	Rate float64 `json:"rate"`
}

// UpdateRule 修改某 tier 当前费率
// PUT /api/v1/admin/referral/rules/:tier
func (h *ReferralAdminHandler) UpdateRule(c *gin.Context) {
	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		response.Unauthorized(c, "Admin not authenticated")
		return
	}
	tierRaw, err := strconv.Atoi(c.Param("tier"))
	if err != nil || (tierRaw != 1 && tierRaw != 2) {
		response.BadRequest(c, "tier must be 1 or 2")
		return
	}
	var req updateRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}
	rule, err := h.referralService.AdminUpdateRate(c.Request.Context(), int8(tierRaw), req.Rate, subject.UserID)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, rule)
}

// ListCommissions 后台抽佣列表（可按 status / inviter_id 过滤）
// GET /api/v1/admin/referral/commissions
func (h *ReferralAdminHandler) ListCommissions(c *gin.Context) {
	filters := service.ListCommissionFilters{
		Status: strings.TrimSpace(c.Query("status")),
	}
	if raw := strings.TrimSpace(c.Query("inviter_id")); raw != "" {
		if id, err := strconv.ParseInt(raw, 10, 64); err == nil && id > 0 {
			filters.InviterID = &id
		}
	}
	if raw := strings.TrimSpace(c.Query("downline_id")); raw != "" {
		if id, err := strconv.ParseInt(raw, 10, 64); err == nil && id > 0 {
			filters.DownlineID = &id
		}
	}
	page, pageSize := parseAdminPagination(c, 50)
	items, total, err := h.referralService.AdminListCommissions(c.Request.Context(), filters, (page-1)*pageSize, pageSize)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, gin.H{
		"items":     items,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

type batchActionRequest struct {
	IDs  []int64 `json:"ids" binding:"required"`
	Note string  `json:"note"`
}

// MarkSettled 批量标记为已结算
// POST /api/v1/admin/referral/commissions/mark-settled
func (h *ReferralAdminHandler) MarkSettled(c *gin.Context) {
	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		response.Unauthorized(c, "Admin not authenticated")
		return
	}
	var req batchActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}
	n, err := h.referralService.AdminMarkSettled(c.Request.Context(), req.IDs, subject.UserID, req.Note)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, gin.H{"updated": n})
}

// MarkVoided 批量作废
// POST /api/v1/admin/referral/commissions/void
func (h *ReferralAdminHandler) MarkVoided(c *gin.Context) {
	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		response.Unauthorized(c, "Admin not authenticated")
		return
	}
	var req batchActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}
	n, err := h.referralService.AdminMarkVoided(c.Request.Context(), req.IDs, subject.UserID, req.Note)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, gin.H{"voided": n})
}

type setPartnerRequest struct {
	Enabled bool `json:"enabled"`
}

// SetUserReferralPartner 后台开关某用户的邀请功能
// PATCH /api/v1/admin/users/:id/referral-partner
func (h *ReferralAdminHandler) SetUserReferralPartner(c *gin.Context) {
	userID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || userID <= 0 {
		response.BadRequest(c, "invalid user id")
		return
	}
	var req setPartnerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request: "+err.Error())
		return
	}
	if err := h.referralService.AdminSetReferralPartner(c.Request.Context(), userID, req.Enabled); err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, gin.H{"id": userID, "is_referral_partner": req.Enabled})
}

func parseAdminPagination(c *gin.Context, defaultSize int) (int, int) {
	page, _ := strconv.Atoi(c.Query("page"))
	if page < 1 {
		page = 1
	}
	size, _ := strconv.Atoi(c.Query("page_size"))
	if size < 1 || size > 500 {
		size = defaultSize
	}
	return page, size
}
