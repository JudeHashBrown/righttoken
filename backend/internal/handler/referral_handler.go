package handler

import (
	"strconv"
	"strings"

	"github.com/Wei-Shaw/sub2api/internal/pkg/response"
	middleware2 "github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"

	"github.com/gin-gonic/gin"
)

// ReferralHandler 用户端二级分销端点
type ReferralHandler struct {
	referralService *service.ReferralService
	userService     *service.UserService
}

func NewReferralHandler(referralService *service.ReferralService, userService *service.UserService) *ReferralHandler {
	return &ReferralHandler{
		referralService: referralService,
		userService:     userService,
	}
}

// Dashboard 返回邀请码 + 两级费率 + Lv1 明细 + Lv2 聚合
// GET /api/v1/referral/dashboard
func (h *ReferralHandler) Dashboard(c *gin.Context) {
	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}
	user, err := h.userService.GetByID(c.Request.Context(), subject.UserID)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	dashboard, err := h.referralService.GetDashboard(c.Request.Context(), user)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, dashboard)
}

// FirstRechargeEligibility 查询当前用户的首充奖励资格（用于充值页 banner）
// GET /api/v1/referral/first-recharge-eligibility
func (h *ReferralHandler) FirstRechargeEligibility(c *gin.Context) {
	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}
	result, err := h.referralService.GetFirstRechargeEligibility(c.Request.Context(), subject.UserID)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	response.Success(c, result)
}

// ListMyCommissions 分页查我自己的抽佣明细
// GET /api/v1/referral/commissions?status=&page=&page_size=
func (h *ReferralHandler) ListMyCommissions(c *gin.Context) {
	subject, ok := middleware2.GetAuthSubjectFromContext(c)
	if !ok {
		response.Unauthorized(c, "User not authenticated")
		return
	}
	status := strings.TrimSpace(c.Query("status"))
	page, pageSize := parsePagination(c, 50)

	items, total, err := h.referralService.ListMyCommissions(c.Request.Context(), subject.UserID, status, (page-1)*pageSize, pageSize)
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

func parsePagination(c *gin.Context, defaultSize int) (int, int) {
	page, _ := strconv.Atoi(c.Query("page"))
	if page < 1 {
		page = 1
	}
	size, _ := strconv.Atoi(c.Query("page_size"))
	if size < 1 || size > 200 {
		size = defaultSize
	}
	return page, size
}
