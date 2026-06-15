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

// AccrueCommission 在 usage_log 落盘后异步调用：
//  1. 查 downline.inviter_id（Lv1）
//  2. Lv1 写一条；再查 inviter.inviter_id（Lv2），写第二条
//
// 任何错误都只记录日志、不上抛——主计费流程不受影响。
// 每一层都会单独检查 inviter.IsReferralPartner，未开启邀请功能的用户不会累计奖励。
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

	// Lv1：downline.inviter
	lv1ID := *downline.InviterID
	lv1User, err := s.userRepo.GetByID(ctx, lv1ID)
	if err != nil || lv1User == nil {
		return
	}
	if lv1User.IsReferralPartner {
		s.writeCommission(ctx, lv1ID, downlineUserID, ReferralTierLv1, requestID, baseAmountUSD)
	}

	// Lv2：lv1.inviter（无论 Lv1 是否开通邀请功能，都要继续追溯到 Lv2 的 inviter）
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
		s.writeCommission(ctx, lv2ID, downlineUserID, ReferralTierLv2, requestID, baseAmountUSD)
	}
}

func (s *ReferralService) writeCommission(ctx context.Context, inviterID, downlineID int64, tier int8, requestID string, base float64) {
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
		SourceRequestID:  requestID,
		BaseAmount:       base,
		Rate:             rule.Rate,
		CommissionAmount: amount,
	})
	if err != nil {
		logger.LegacyPrintf("service.referral", "write commission tier=%d req=%s inviter=%d failed: %v", tier, requestID, inviterID, err)
	}
}

// GetDashboard 用户视角：邀请码 + 两级抽佣聚合 + Lv1 明细 + Lv2 汇总。
type ReferralDashboard struct {
	InviteCode string             `json:"invite_code"`
	Lv1Rate    float64            `json:"lv1_rate"`
	Lv2Rate    float64            `json:"lv2_rate"`
	Lv1Summary CommissionSummary  `json:"lv1_summary"`
	Lv2Summary DownlineSummaryLv2 `json:"lv2_summary"`
	Lv1Rows    []DownlineRowLv1   `json:"lv1_rows"`
}

func (s *ReferralService) GetDashboard(ctx context.Context, user *User) (*ReferralDashboard, error) {
	if !user.IsReferralPartner {
		return nil, ErrReferralFeatureDisabled
	}
	code, err := s.EnsureInviteCode(ctx, user)
	if err != nil {
		return nil, err
	}

	lv1Rate, _ := s.activeRate(ctx, ReferralTierLv1)
	lv2Rate, _ := s.activeRate(ctx, ReferralTierLv2)

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
		InviteCode: code,
		Lv1Rows:    lv1Rows,
		Lv1Summary: summaries[ReferralTierLv1],
		Lv2Summary: *lv2Summary,
	}
	if lv1Rate != nil {
		out.Lv1Rate = lv1Rate.Rate
	}
	if lv2Rate != nil {
		out.Lv2Rate = lv2Rate.Rate
	}
	return out, nil
}

// ListMyCommissions 用户视角：分页查自己的抽佣明细。
func (s *ReferralService) ListMyCommissions(ctx context.Context, userID int64, status string, offset, limit int) ([]ReferralCommission, int64, error) {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, 0, err
	}
	if !user.IsReferralPartner {
		return nil, 0, ErrReferralFeatureDisabled
	}
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
	rate := s.settingService.GetReferralFirstRechargeBonusRate(ctx)
	if rate <= 1.0 {
		return 0
	}
	// 预检：先 read（不强求精确，CAS 是真正的守门）
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil || user == nil || user.InviterID == nil || user.ReferralBonusClaimedAt != nil {
		return 0
	}
	claimed, err := s.userRepo.ClaimFirstRechargeBonus(ctx, userID)
	if err != nil {
		logger.LegacyPrintf("service.referral", "ClaimFirstRechargeBonus CAS failed user=%d: %v", userID, err)
		return 0
	}
	if !claimed {
		return 0
	}
	bonusUSD := baseUSD * (rate - 1.0)
	logger.LegacyPrintf("service.referral", "first recharge bonus claimed: user=%d baseUSD=%.4f rate=%.2f bonusUSD=%.4f", userID, baseUSD, rate, bonusUSD)
	return bonusUSD
}
