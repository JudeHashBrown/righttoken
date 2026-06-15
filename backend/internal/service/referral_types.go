package service

import (
	"context"
	"time"

	infraerrors "github.com/Wei-Shaw/sub2api/internal/pkg/errors"
)

const (
	ReferralTierLv1 int8 = 1
	ReferralTierLv2 int8 = 2

	ReferralCommissionStatusPending = "pending"
	ReferralCommissionStatusSettled = "settled"
	ReferralCommissionStatusVoided  = "voided"
)

var (
	ErrReferralCodeNotFound        = infraerrors.NotFound("REFERRAL_CODE_NOT_FOUND", "referral code not found")
	ErrReferralSelfBlocked         = infraerrors.BadRequest("REFERRAL_SELF_BLOCKED", "cannot refer yourself")
	ErrReferralRuleNotFound        = infraerrors.NotFound("REFERRAL_RULE_NOT_FOUND", "referral rule not found")
	ErrReferralCommissionMissing   = infraerrors.NotFound("REFERRAL_COMMISSION_NOT_FOUND", "referral commission not found")
	ErrReferralCodeGenFailed       = infraerrors.InternalServer("REFERRAL_CODE_GEN_FAILED", "failed to generate invite code")
	ErrReferralFeatureDisabled     = infraerrors.Forbidden("REFERRAL_FEATURE_DISABLED", "referral feature is not enabled for this user")
	ErrReferralPartnerHasPending   = infraerrors.Conflict("REFERRAL_PARTNER_HAS_PENDING", "user has pending commissions and cannot be disabled")
)

// ReferralCommissionRule 抽佣比例规则
type ReferralCommissionRule struct {
	ID               int64      `json:"id"`
	Tier             int8       `json:"tier"`
	Rate             float64    `json:"rate"`
	EffectiveFrom    time.Time  `json:"effective_from"`
	EffectiveUntil   *time.Time `json:"effective_until"`
	CreatedByAdminID *int64     `json:"created_by_admin_id"`
	CreatedAt        time.Time  `json:"created_at"`
}

// ReferralCommission 抽佣明细
type ReferralCommission struct {
	ID               int64      `json:"id"`
	InviterID        int64      `json:"inviter_id"`
	DownlineID       int64      `json:"downline_id"`
	Tier             int8       `json:"tier"`
	SourceRequestID  string     `json:"source_request_id"`
	BaseAmount       float64    `json:"base_amount"`
	Rate             float64    `json:"rate"`
	CommissionAmount float64    `json:"commission_amount"`
	Status           string     `json:"status"`
	SettledAt        *time.Time `json:"settled_at"`
	SettledByAdminID *int64     `json:"settled_by_admin_id"`
	SettledNote      *string    `json:"settled_note"`
	CreatedAt        time.Time  `json:"created_at"`

	// 仅 admin 列表附加（用户视角不返回），便于后台知道发钱给谁、来自谁的消费。
	InviterEmail  string `json:"inviter_email,omitempty"`
	DownlineEmail string `json:"downline_email,omitempty"`
}

// ReferralCommissionRuleRepository 费率规则仓储
type ReferralCommissionRuleRepository interface {
	GetActive(ctx context.Context, tier int8) (*ReferralCommissionRule, error)
	List(ctx context.Context) ([]ReferralCommissionRule, error)
	// UpdateActive 在事务内：关闭旧的「生效中」规则，插入新规则。
	UpdateActive(ctx context.Context, tier int8, newRate float64, adminID *int64) (*ReferralCommissionRule, error)
}

// CreateCommissionInput 抽佣记录创建参数
type CreateCommissionInput struct {
	InviterID        int64
	DownlineID       int64
	Tier             int8
	SourceRequestID  string
	BaseAmount       float64
	Rate             float64
	CommissionAmount float64
}

// ListCommissionFilters 抽佣明细过滤参数
type ListCommissionFilters struct {
	InviterID  *int64 // 过滤为特定上线（用户端只查自己）
	DownlineID *int64
	Status     string
	// ExcludeDeletedDownlines 仅用户视角设置：跳过软删下线产生的佣金，
	// 保持与 dashboard 卡片汇总（SummaryByInviter / Lv1Downlines / Lv2Summary）口径一致。
	// admin 视角不设，可看全部（含已注销下线的历史记录）。
	ExcludeDeletedDownlines bool
	// IncludeUserEmails 仅 admin 视角设：返回每条佣金的 inviter_email + downline_email。
	IncludeUserEmails bool
}

// CommissionSummary 抽佣聚合（按 tier）
type CommissionSummary struct {
	Tier          int8    `json:"tier"`
	PendingAmount float64 `json:"pending_amount"`
	SettledAmount float64 `json:"settled_amount"`
	VoidedAmount  float64 `json:"voided_amount"`
	PendingCount  int64   `json:"pending_count"`
	SettledCount  int64   `json:"settled_count"`
	VoidedCount   int64   `json:"voided_count"`
}

// DownlineRowLv1 Lv1 下线单行统计
type DownlineRowLv1 struct {
	DownlineID      int64     `json:"downline_id"`
	DownlineEmail   string    `json:"downline_email"` // 已脱敏
	JoinedAt        time.Time `json:"joined_at"`
	TotalUsage      float64   `json:"total_usage"` // 该下线累计贡献的消费金额
	PendingAmount   float64   `json:"pending_amount"`
	SettledAmount   float64   `json:"settled_amount"`
	TotalCommission float64   `json:"total_commission"` // 不含 voided
}

// DownlineSummaryLv2 Lv2 仅聚合
type DownlineSummaryLv2 struct {
	DownlineCount   int64   `json:"downline_count"`
	PendingAmount   float64 `json:"pending_amount"`
	SettledAmount   float64 `json:"settled_amount"`
	TotalCommission float64 `json:"total_commission"`
}

// ReferralCommissionRepository 抽佣明细仓储
type ReferralCommissionRepository interface {
	// CreateIfAbsent 如果 (source_request_id, tier) 已存在则不报错（幂等）。
	CreateIfAbsent(ctx context.Context, in *CreateCommissionInput) (*ReferralCommission, bool, error)
	GetByID(ctx context.Context, id int64) (*ReferralCommission, error)

	List(ctx context.Context, filters ListCommissionFilters, offset, limit int) ([]ReferralCommission, int64, error)
	SummaryByInviter(ctx context.Context, inviterID int64) (map[int8]CommissionSummary, error)

	// Lv1 视角：每个直接下线的聚合
	Lv1Downlines(ctx context.Context, inviterID int64) ([]DownlineRowLv1, error)
	// Lv2 视角：整体聚合
	Lv2Summary(ctx context.Context, inviterID int64) (*DownlineSummaryLv2, error)

	MarkSettled(ctx context.Context, ids []int64, adminID int64, note string) (int, error)
	MarkVoided(ctx context.Context, ids []int64, adminID int64, note string) (int, error)

	// CountPendingByInviter 返回某 inviter 名下处于 pending 的奖励条数（关闭邀请功能时守门用）。
	CountPendingByInviter(ctx context.Context, inviterID int64) (int64, error)
}
