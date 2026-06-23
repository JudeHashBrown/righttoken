package service

import (
	"context"
	"crypto/rand"
	"errors"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/pkg/logger"
)

const (
	inviteCodeLength      = 8
	inviteCodeAlphabet    = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // 去掉容易混淆的 I/O/1/0
	inviteCodeMaxAttempts = 5
	referralRuleCacheTTL  = 5 * time.Minute
)

// ReferralService 二级分销业务服务
type ReferralService struct {
	userRepo       UserRepository
	commissionRepo ReferralCommissionRepository
	ruleRepo       ReferralCommissionRuleRepository
	settingService *SettingService

	mu        sync.RWMutex
	ruleCache map[int8]ruleCacheEntry
}

type ruleCacheEntry struct {
	rule      *ReferralCommissionRule
	expiresAt time.Time
}

func NewReferralService(userRepo UserRepository, commissionRepo ReferralCommissionRepository, ruleRepo ReferralCommissionRuleRepository, settingService *SettingService) *ReferralService {
	return &ReferralService{
		userRepo:       userRepo,
		commissionRepo: commissionRepo,
		ruleRepo:       ruleRepo,
		settingService: settingService,
		ruleCache:      map[int8]ruleCacheEntry{},
	}
}

// GenerateInviteCode 生成并写入用户邀请码（碰撞时重试）。
func (s *ReferralService) GenerateInviteCode(ctx context.Context, userID int64) (string, error) {
	for attempt := 0; attempt < inviteCodeMaxAttempts; attempt++ {
		code, err := randomInviteCode()
		if err != nil {
			return "", ErrReferralCodeGenFailed.WithCause(err)
		}
		err = s.userRepo.SetInviteCode(ctx, userID, code)
		if err == nil {
			return code, nil
		}
		// 唯一冲突 → 重试
		if isLikelyUniqueConflict(err) {
			continue
		}
		return "", err
	}
	return "", ErrReferralCodeGenFailed
}

// EnsureInviteCode 如果用户已有邀请码则返回；否则生成。
func (s *ReferralService) EnsureInviteCode(ctx context.Context, user *User) (string, error) {
	if user.InviteCode != nil && *user.InviteCode != "" {
		return *user.InviteCode, nil
	}
	return s.GenerateInviteCode(ctx, user.ID)
}

// ResolveInviterByCode 邀请码 → 邀请人 user。空码返回 nil, nil（不报错）。
func (s *ReferralService) ResolveInviterByCode(ctx context.Context, code string) (*User, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if code == "" {
		return nil, nil
	}
	inviter, err := s.userRepo.GetByInviteCode(ctx, code)
	if err != nil {
		return nil, err
	}
	return inviter, nil
}

// ValidateNewRegistration E1：禁止邀请人邮箱前缀 == 新注册邮箱前缀。
func (s *ReferralService) ValidateNewRegistration(inviter *User, newEmail string) error {
	if inviter == nil {
		return nil
	}
	if emailPrefixForFraudCheck(inviter.Email) == emailPrefixForFraudCheck(newEmail) {
		return ErrReferralSelfBlocked
	}
	return nil
}

// ValidateEmailChange 用户改邮箱时复查 E1：若该用户已绑定邀请人，新邮箱前缀不能与邀请人重合。
// 没绑定邀请人则直接放行。
func (s *ReferralService) ValidateEmailChange(ctx context.Context, userID int64, newEmail string) error {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if user.InviterID == nil {
		return nil
	}
	inviter, err := s.userRepo.GetByID(ctx, *user.InviterID)
	if err != nil {
		return err
	}
	return s.ValidateNewRegistration(inviter, newEmail)
}

// emailPrefixForFraudCheck 取邮箱 local-part（小写、去掉 +xxx 后缀）。
func emailPrefixForFraudCheck(email string) string {
	at := strings.IndexByte(email, '@')
	local := email
	if at > 0 {
		local = email[:at]
	}
	local = strings.ToLower(strings.TrimSpace(local))
	if plus := strings.IndexByte(local, '+'); plus >= 0 {
		local = local[:plus]
	}
	return local
}

// activeRate 取某 tier 当前生效费率（带 5 分钟缓存）。
func (s *ReferralService) activeRate(ctx context.Context, tier int8) (*ReferralCommissionRule, error) {
	s.mu.RLock()
	if e, ok := s.ruleCache[tier]; ok && time.Now().Before(e.expiresAt) {
		s.mu.RUnlock()
		return e.rule, nil
	}
	s.mu.RUnlock()

	rule, err := s.ruleRepo.GetActive(ctx, tier)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.ruleCache[tier] = ruleCacheEntry{rule: rule, expiresAt: time.Now().Add(referralRuleCacheTTL)}
	s.mu.Unlock()
	return rule, nil
}

// InvalidateRuleCache 在 admin 改费率后调用。
func (s *ReferralService) InvalidateRuleCache() {
	s.mu.Lock()
	s.ruleCache = map[int8]ruleCacheEntry{}
	s.mu.Unlock()
}

// AccrueCommission 在 usage_log 落盘后异步调用，按 3 维独立判断：
//  1. 首充返点（first_recharge）：任何邀请人都拿；封顶 = downline.first_recharge_amount_usd × inviter_rate。
//  2. 代理一级（agent_lv1）：仅 Lv1 inviter 是代理时拿；按 commission_rules tier=1 实时累计，无封顶。
//  3. 代理二级（agent_lv2）：跨过非代理 Lv1，只要 Lv2 祖先是代理就拿；按 commission_rules tier=2 累计。
//
// 任何错误都只记录日志、不上抛——主计费流程不受影响。
func (s *ReferralService) AccrueCommission(ctx context.Context, downlineUserID int64, requestID string, baseAmountUSD float64) {
	if requestID == "" || baseAmountUSD <= 0 {
		return
	}
	defer func() {
		if r := recover(); r != nil {
			logger.LegacyPrintf("service.referral", "panic in AccrueCommission(downline=%d req=%s): %v", downlineUserID, requestID, r)
		}
	}()

	downline, err := s.userRepo.GetByID(ctx, downlineUserID)
	if err != nil || downline == nil || downline.InviterID == nil {
		return
	}

	// Lv1：downline.inviter（直接邀请人）
	lv1ID := *downline.InviterID
	lv1User, err := s.userRepo.GetByID(ctx, lv1ID)
	if err != nil || lv1User == nil {
		return
	}

	// 维度1：首充返点 — 直接邀请人无条件拿（封顶 cap 由 downline 首充原值控制）
	s.writeFirstRechargeCommission(ctx, lv1ID, downline, requestID, baseAmountUSD)

	// 维度2：代理一级 — 仅 Lv1 是代理时拿
	if lv1User.IsReferralPartner {
		s.writeAgentCommission(ctx, lv1ID, downlineUserID, ReferralTierLv1, ReferralCommissionKindAgentLv1, requestID, baseAmountUSD)
	}

	// 维度3：代理二级 — 跨过非代理 Lv1，只要 Lv2 是代理就拿
	if lv1User.InviterID == nil {
		return
	}
	lv2ID := *lv1User.InviterID
	if lv2ID == downlineUserID {
		// 安全：lv2 与 downline 必须不同（否则形成环；DB 层 CHECK 也有兜底）
		return
	}
	lv2User, err := s.userRepo.GetByID(ctx, lv2ID)
	if err != nil || lv2User == nil {
		return
	}
	if lv2User.IsReferralPartner {
		s.writeAgentCommission(ctx, lv2ID, downlineUserID, ReferralTierLv2, ReferralCommissionKindAgentLv2, requestID, baseAmountUSD)
	}
}

// writeFirstRechargeCommission 写普通邀请人首充返点（kind=first_recharge）。
// 封顶 cap = downline.first_recharge_amount_usd × inviter_rate；已发累计 >= cap 时静默跳过。
// cap 用 downline.first_recharge_inviter_bonus_paid 字段缓存，原子加保证不超发。
func (s *ReferralService) writeFirstRechargeCommission(ctx context.Context, inviterID int64, downline *User, requestID string, base float64) {
	if downline == nil || downline.FirstRechargeAmountUsd <= 0 {
		// downline 还没首充（或迁移前数据），跳过
		return
	}
	if s.settingService == nil {
		return
	}
	rate := s.settingService.GetReferralFirstRechargeInviterRate(ctx)
	if rate <= 0 {
		return
	}
	bonusCap := downline.FirstRechargeAmountUsd * rate
	if downline.FirstRechargeInviterBonusPaid >= bonusCap {
		return
	}
	amount := base * rate
	remaining := bonusCap - downline.FirstRechargeInviterBonusPaid
	if amount > remaining {
		amount = remaining
	}
	if amount <= 0 {
		return
	}
	commission, created, err := s.commissionRepo.CreateIfAbsent(ctx, &CreateCommissionInput{
		InviterID:        inviterID,
		DownlineID:       downline.ID,
		Tier:             ReferralTierLv1,
		Kind:             ReferralCommissionKindFirstRecharge,
		SourceRequestID:  requestID,
		BaseAmount:       base,
		Rate:             rate,
		CommissionAmount: amount,
	})
	if err != nil {
		logger.LegacyPrintf("service.referral", "write first_recharge commission req=%s inviter=%d failed: %v", requestID, inviterID, err)
		return
	}
	if !created || commission == nil {
		// 幂等：同一 request_id 已写过，不重复加 cap
		return
	}
	// 同步 user.first_recharge_inviter_bonus_paid 字段（不在事务里，最终一致）
	if _, err := s.userRepo.AdjustFirstRechargeInviterBonusPaid(ctx, downline.ID, amount); err != nil {
		logger.LegacyPrintf("service.referral", "adjust first_recharge cap failed downline=%d delta=%.6f: %v", downline.ID, amount, err)
	}
}

// writeAgentCommission 写代理返点（agent_lv1 / agent_lv2）；rate 从 commission_rules 实时取。
func (s *ReferralService) writeAgentCommission(ctx context.Context, inviterID, downlineID int64, tier int8, kind, requestID string, base float64) {
	rule, err := s.activeRate(ctx, tier)
	if err != nil || rule == nil {
		logger.LegacyPrintf("service.referral", "no active rule for tier=%d req=%s: %v", tier, requestID, err)
		return
	}
	if rule.Rate <= 0 {
		return
	}
	amount := base * rule.Rate
	_, _, err = s.commissionRepo.CreateIfAbsent(ctx, &CreateCommissionInput{
		InviterID:        inviterID,
		DownlineID:       downlineID,
		Tier:             tier,
		Kind:             kind,
		SourceRequestID:  requestID,
		BaseAmount:       base,
		Rate:             rule.Rate,
		CommissionAmount: amount,
	})
	if err != nil {
		logger.LegacyPrintf("service.referral", "write agent commission tier=%d req=%s inviter=%d failed: %v", tier, requestID, inviterID, err)
	}
}

// ReverseCommissionsForRefund 在订单退款成功后调用：按 created_at DESC void 该 downline 的 pending commission，
// 累计 base_amount 达到 refundUSD 即停。被 void 的 first_recharge commission 会同步还原
// downline.first_recharge_inviter_bonus_paid 字段，保证 cap 后续还能继续累。
// 已 settled 的 commission（已经付给代理）不会动 — 由 admin 在结算前确保无大额退款。
//
// 任何错误都只记录日志、不上抛——退款主流程不受影响。
func (s *ReferralService) ReverseCommissionsForRefund(ctx context.Context, downlineID int64, refundUSD float64) {
	if downlineID == 0 || refundUSD <= 0 {
		return
	}
	defer func() {
		if r := recover(); r != nil {
			logger.LegacyPrintf("service.referral", "panic in ReverseCommissionsForRefund(downline=%d refund=%.4f): %v", downlineID, refundUSD, r)
		}
	}()

	voided, err := s.commissionRepo.VoidPendingByDownline(ctx, downlineID, refundUSD, "refund reversal")
	if err != nil {
		logger.LegacyPrintf("service.referral", "VoidPendingByDownline downline=%d refund=%.4f failed: %v", downlineID, refundUSD, err)
		return
	}
	if len(voided) == 0 {
		return
	}

	// 回滚 first_recharge cap：把被 void 的首充返点累计减回去。
	var capRollback float64
	for _, c := range voided {
		if c.Kind == ReferralCommissionKindFirstRecharge {
			capRollback += c.CommissionAmount
		}
	}
	if capRollback > 0 {
		if _, err := s.userRepo.AdjustFirstRechargeInviterBonusPaid(ctx, downlineID, -capRollback); err != nil {
			logger.LegacyPrintf("service.referral", "rollback first_recharge cap failed downline=%d delta=-%.6f: %v", downlineID, capRollback, err)
		}
	}
	logger.LegacyPrintf("service.referral", "reverse commissions downline=%d refund=%.4f voided=%d cap_rollback=%.6f", downlineID, refundUSD, len(voided), capRollback)
}

// GetDashboard 用户视角：邀请码 + 三维度费率 + 抽佣聚合 + Lv1 明细 + Lv2 汇总。
// 对所有登录用户开放（普通邀请人也能看自己的首充返点）；IsReferralPartner=false 时
// 代理相关字段虽然返回但金额一般为 0，前端据 IsReferralPartner 决定是否展示代理区块。
type ReferralDashboard struct {
	InviteCode        string             `json:"invite_code"`
	IsReferralPartner bool               `json:"is_referral_partner"`
	FirstRechargeRate float64            `json:"first_recharge_rate"` // 0.05 = 5%
	Lv1Rate           float64            `json:"lv1_rate"`
	Lv2Rate           float64            `json:"lv2_rate"`
	Lv1Summary        CommissionSummary  `json:"lv1_summary"`
	Lv2Summary        DownlineSummaryLv2 `json:"lv2_summary"`
	Lv1Rows           []DownlineRowLv1   `json:"lv1_rows"`
}

func (s *ReferralService) GetDashboard(ctx context.Context, user *User) (*ReferralDashboard, error) {
	code, err := s.EnsureInviteCode(ctx, user)
	if err != nil {
		return nil, err
	}

	lv1Rate, _ := s.activeRate(ctx, ReferralTierLv1)
	lv2Rate, _ := s.activeRate(ctx, ReferralTierLv2)
	var firstRechargeRate float64
	if s.settingService != nil {
		firstRechargeRate = s.settingService.GetReferralFirstRechargeInviterRate(ctx)
	}

	summaries, err := s.commissionRepo.SummaryByInviter(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	lv1Rows, err := s.commissionRepo.Lv1Downlines(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	lv2Summary, err := s.commissionRepo.Lv2Summary(ctx, user.ID)
	if err != nil {
		return nil, err
	}

	out := &ReferralDashboard{
		InviteCode:        code,
		IsReferralPartner: user.IsReferralPartner,
		FirstRechargeRate: firstRechargeRate,
		Lv1Rows:           lv1Rows,
		Lv1Summary:        summaries[ReferralTierLv1],
		Lv2Summary:        *lv2Summary,
	}
	if lv1Rate != nil {
		out.Lv1Rate = lv1Rate.Rate
	}
	if lv2Rate != nil {
		out.Lv2Rate = lv2Rate.Rate
	}
	return out, nil
}

// ListMyCommissions 用户视角：分页查自己的抽佣明细（含 first_recharge / agent_lv1 / agent_lv2）。
// 对所有登录用户开放，普通邀请人也能看到自己的首充返点明细。
func (s *ReferralService) ListMyCommissions(ctx context.Context, userID int64, status string, offset, limit int) ([]ReferralCommission, int64, error) {
	return s.commissionRepo.List(ctx, ListCommissionFilters{
		InviterID:               &userID,
		Status:                  status,
		ExcludeDeletedDownlines: true,
	}, offset, limit)
}

// AdminSetReferralPartner 管理员开启/关闭某用户的邀请功能。
// 关闭时如果用户还有 pending 奖励则拒绝（守门）。
func (s *ReferralService) AdminSetReferralPartner(ctx context.Context, userID int64, enabled bool) error {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if user.IsReferralPartner == enabled {
		// 状态相同，无需更新
		return nil
	}
	if !enabled {
		// 关闭前检查是否有未发放奖励
		pendingCount, err := s.commissionRepo.CountPendingByInviter(ctx, userID)
		if err != nil {
			return err
		}
		if pendingCount > 0 {
			return ErrReferralPartnerHasPending
		}
	}
	if err := s.userRepo.SetReferralPartner(ctx, userID, enabled); err != nil {
		return err
	}
	// 开通时顺手生成邀请码（如果没有）
	if enabled {
		if user.InviteCode == nil || *user.InviteCode == "" {
			_, _ = s.GenerateInviteCode(ctx, userID)
		}
	}
	return nil
}

// AdminListCommissions 后台：全表分页/过滤。
// admin 视角总是附加邮箱，便于知道发钱给谁。
func (s *ReferralService) AdminListCommissions(ctx context.Context, filters ListCommissionFilters, offset, limit int) ([]ReferralCommission, int64, error) {
	filters.IncludeUserEmails = true
	return s.commissionRepo.List(ctx, filters, offset, limit)
}

// AdminListRules 后台：所有规则历史。
func (s *ReferralService) AdminListRules(ctx context.Context) ([]ReferralCommissionRule, error) {
	return s.ruleRepo.List(ctx)
}

// AdminUpdateRate 后台：修改某层级费率。
func (s *ReferralService) AdminUpdateRate(ctx context.Context, tier int8, newRate float64, adminID int64) (*ReferralCommissionRule, error) {
	if tier != ReferralTierLv1 && tier != ReferralTierLv2 {
		return nil, ErrReferralRuleNotFound
	}
	if newRate < 0 || newRate > 1 {
		return nil, errors.New("rate out of range [0,1]")
	}
	rule, err := s.ruleRepo.UpdateActive(ctx, tier, newRate, &adminID)
	if err != nil {
		return nil, err
	}
	s.InvalidateRuleCache()
	return rule, nil
}

func (s *ReferralService) AdminMarkSettled(ctx context.Context, ids []int64, adminID int64, note string) (int, error) {
	return s.commissionRepo.MarkSettled(ctx, ids, adminID, note)
}

func (s *ReferralService) AdminMarkVoided(ctx context.Context, ids []int64, adminID int64, note string) (int, error) {
	return s.commissionRepo.MarkVoided(ctx, ids, adminID, note)
}

func randomInviteCode() (string, error) {
	max := big.NewInt(int64(len(inviteCodeAlphabet)))
	out := make([]byte, inviteCodeLength)
	for i := 0; i < inviteCodeLength; i++ {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		out[i] = inviteCodeAlphabet[n.Int64()]
	}
	return string(out), nil
}

// isLikelyUniqueConflict 检测唯一约束冲突（无需依赖 repository 包的私有 helper）。
func isLikelyUniqueConflict(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "duplicate key") ||
		strings.Contains(s, "UNIQUE constraint") ||
		strings.Contains(s, "unique constraint")
}

// FirstRechargeEligibility 首充奖励资格查询结果（前端 banner 显示用）
type FirstRechargeEligibility struct {
	Eligible  bool    `json:"eligible"`
	BonusRate float64 `json:"bonus_rate"` // 1.05 表示 +5%
}

// GetFirstRechargeEligibility 查询当前用户是否有资格领取首充奖励。
// 资格条件：1) 有 inviter_id（注册时绑了有效邀请码）；2) 未领取过；3) 倍率 > 1.0。
func (s *ReferralService) GetFirstRechargeEligibility(ctx context.Context, userID int64) (*FirstRechargeEligibility, error) {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	rate := 1.0
	if s.settingService != nil {
		rate = s.settingService.GetReferralFirstRechargeBonusRate(ctx)
	}
	eligible := user.InviterID != nil && user.ReferralBonusClaimedAt == nil && rate > 1.0
	return &FirstRechargeEligibility{Eligible: eligible, BonusRate: rate}, nil
}

// ClaimFirstRechargeBonus 由支付完成回调调用：CAS 标记 + 计算奖励 USD 金额。
// 不符合条件或已领过返回 0，否则返回额外 USD 金额（baseUSD × (rate - 1)）。
// 任何错误都返回 0 + 记录日志，不中断主支付流程。
//
// 同时把首充原值写入 user.first_recharge_amount_usd，作为普通邀请人首充返点
// 封顶 cap = baseUSD × inviter_rate 的基数（即使 bonusRate <= 1.0 即奖励关闭，
// 只要被邀请人存在，仍需写 cap 让 inviter 拿首充返点）。
func (s *ReferralService) ClaimFirstRechargeBonus(ctx context.Context, userID int64, baseUSD float64) float64 {
	if baseUSD <= 0 {
		return 0
	}
	defer func() {
		if r := recover(); r != nil {
			logger.LegacyPrintf("service.referral", "panic in ClaimFirstRechargeBonus(user=%d): %v", userID, r)
		}
	}()
	if s.settingService == nil {
		return 0
	}
	// 预检：先 read（不强求精确，CAS 是真正的守门）
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil || user == nil || user.InviterID == nil || user.ReferralBonusClaimedAt != nil {
		return 0
	}

	bonusRate := s.settingService.GetReferralFirstRechargeBonusRate(ctx)
	claimed, err := s.userRepo.ClaimFirstRechargeBonus(ctx, userID)
	if err != nil {
		logger.LegacyPrintf("service.referral", "ClaimFirstRechargeBonus CAS failed user=%d: %v", userID, err)
		return 0
	}
	if !claimed {
		return 0
	}
	// 首充原值写入，作为普通邀请人首充返点封顶 cap 的基数。
	// 写入失败仅记录日志，不影响奖励发放（cap 默认 0 = 不发首充返点，不会超发）。
	if err := s.userRepo.SetFirstRechargeAmount(ctx, userID, baseUSD); err != nil {
		logger.LegacyPrintf("service.referral", "set first_recharge_amount_usd failed user=%d base=%.4f: %v", userID, baseUSD, err)
	}

	if bonusRate <= 1.0 {
		return 0
	}
	bonusUSD := baseUSD * (bonusRate - 1.0)
	logger.LegacyPrintf("service.referral", "first recharge bonus claimed: user=%d baseUSD=%.4f rate=%.2f bonusUSD=%.4f", userID, baseUSD, bonusRate, bonusUSD)
	return bonusUSD
}
