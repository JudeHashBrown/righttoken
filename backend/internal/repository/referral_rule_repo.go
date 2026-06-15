package repository

import (
	"context"
	"time"

	dbent "github.com/Wei-Shaw/sub2api/ent"
	"github.com/Wei-Shaw/sub2api/ent/referralcommissionrule"
	"github.com/Wei-Shaw/sub2api/internal/service"
)

type referralRuleRepository struct {
	client *dbent.Client
}

func NewReferralRuleRepository(client *dbent.Client) service.ReferralCommissionRuleRepository {
	return &referralRuleRepository{client: client}
}

func (r *referralRuleRepository) GetActive(ctx context.Context, tier int8) (*service.ReferralCommissionRule, error) {
	m, err := r.client.ReferralCommissionRule.Query().
		Where(
			referralcommissionrule.TierEQ(tier),
			referralcommissionrule.EffectiveUntilIsNil(),
		).
		Only(ctx)
	if err != nil {
		return nil, translatePersistenceError(err, service.ErrReferralRuleNotFound, nil)
	}
	return referralRuleEntityToService(m), nil
}

func (r *referralRuleRepository) List(ctx context.Context) ([]service.ReferralCommissionRule, error) {
	rows, err := r.client.ReferralCommissionRule.Query().
		Order(dbent.Desc(referralcommissionrule.FieldEffectiveFrom)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]service.ReferralCommissionRule, 0, len(rows))
	for _, m := range rows {
		if v := referralRuleEntityToService(m); v != nil {
			out = append(out, *v)
		}
	}
	return out, nil
}

// UpdateActive 关闭当前生效中的规则，写入新规则（同事务）。
func (r *referralRuleRepository) UpdateActive(ctx context.Context, tier int8, newRate float64, adminID *int64) (*service.ReferralCommissionRule, error) {
	tx, err := r.client.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	now := time.Now()

	// 关闭旧规则（同 tier 当前生效中）
	if _, err := tx.Client().ReferralCommissionRule.Update().
		Where(
			referralcommissionrule.TierEQ(tier),
			referralcommissionrule.EffectiveUntilIsNil(),
		).
		SetEffectiveUntil(now).
		Save(ctx); err != nil {
		return nil, err
	}

	builder := tx.Client().ReferralCommissionRule.Create().
		SetTier(tier).
		SetRate(newRate).
		SetEffectiveFrom(now)
	if adminID != nil {
		builder = builder.SetCreatedByAdminID(*adminID)
	}
	created, err := builder.Save(ctx)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return referralRuleEntityToService(created), nil
}

func referralRuleEntityToService(m *dbent.ReferralCommissionRule) *service.ReferralCommissionRule {
	if m == nil {
		return nil
	}
	return &service.ReferralCommissionRule{
		ID:               m.ID,
		Tier:             m.Tier,
		Rate:             m.Rate,
		EffectiveFrom:    m.EffectiveFrom,
		EffectiveUntil:   m.EffectiveUntil,
		CreatedByAdminID: m.CreatedByAdminID,
		CreatedAt:        m.CreatedAt,
	}
}
