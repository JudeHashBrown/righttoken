package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	entsql "entgo.io/ent/dialect/sql"
	dbent "github.com/Wei-Shaw/sub2api/ent"
	"github.com/Wei-Shaw/sub2api/ent/referralcommission"
	dbuser "github.com/Wei-Shaw/sub2api/ent/user"
	"github.com/Wei-Shaw/sub2api/internal/service"
)

type referralCommissionRepository struct {
	client *dbent.Client
	sql    sqlExecutor
}

func NewReferralCommissionRepository(client *dbent.Client, sqlDB *sql.DB) service.ReferralCommissionRepository {
	return &referralCommissionRepository{client: client, sql: sqlDB}
}

func (r *referralCommissionRepository) CreateIfAbsent(ctx context.Context, in *service.CreateCommissionInput) (*service.ReferralCommission, bool, error) {
	client := clientFromContext(ctx, r.client)
	created, err := client.ReferralCommission.Create().
		SetInviterID(in.InviterID).
		SetDownlineID(in.DownlineID).
		SetTier(in.Tier).
		SetSourceRequestID(in.SourceRequestID).
		SetBaseAmount(in.BaseAmount).
		SetRate(in.Rate).
		SetCommissionAmount(in.CommissionAmount).
		SetStatus(service.ReferralCommissionStatusPending).
		Save(ctx)
	if err != nil {
		if isUniqueConstraintViolation(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return commissionEntityToService(created), true, nil
}

func (r *referralCommissionRepository) GetByID(ctx context.Context, id int64) (*service.ReferralCommission, error) {
	m, err := r.client.ReferralCommission.Query().
		Where(referralcommission.IDEQ(id)).
		Only(ctx)
	if err != nil {
		return nil, translatePersistenceError(err, service.ErrReferralCommissionMissing, nil)
	}
	return commissionEntityToService(m), nil
}

func (r *referralCommissionRepository) List(ctx context.Context, filters service.ListCommissionFilters, offset, limit int) ([]service.ReferralCommission, int64, error) {
	q := r.client.ReferralCommission.Query()
	if filters.InviterID != nil {
		q = q.Where(referralcommission.InviterIDEQ(*filters.InviterID))
	}
	if filters.DownlineID != nil {
		q = q.Where(referralcommission.DownlineIDEQ(*filters.DownlineID))
	}
	if status := strings.TrimSpace(filters.Status); status != "" {
		q = q.Where(referralcommission.StatusEQ(status))
	}
	if filters.ExcludeDeletedDownlines {
		// 用户视角：和卡片汇总口径一致，跳过软删下线的明细。
		q = q.Where(func(s *entsql.Selector) {
			u := entsql.Table(dbuser.Table)
			s.Join(u).On(s.C(referralcommission.FieldDownlineID), u.C(dbuser.FieldID))
			s.Where(entsql.IsNull(u.C(dbuser.FieldDeletedAt)))
		})
	}

	total, err := q.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	if limit <= 0 {
		limit = 50
	}
	rows, err := q.
		Order(dbent.Desc(referralcommission.FieldCreatedAt), dbent.Desc(referralcommission.FieldID)).
		Offset(offset).
		Limit(limit).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]service.ReferralCommission, 0, len(rows))
	for _, m := range rows {
		if v := commissionEntityToService(m); v != nil {
			out = append(out, *v)
		}
	}

	// 仅 admin 视角：批量 JOIN users 拿邮箱填回每条记录。
	// 用户视角不需要邮箱（明细只展示自己作为 inviter 的金额，downline 走 Lv1Downlines 已脱敏）。
	if filters.IncludeUserEmails && len(out) > 0 {
		idSet := make(map[int64]struct{}, len(out)*2)
		for i := range out {
			idSet[out[i].InviterID] = struct{}{}
			idSet[out[i].DownlineID] = struct{}{}
		}
		ids := make([]int64, 0, len(idSet))
		for id := range idSet {
			ids = append(ids, id)
		}
		users, err := r.client.User.Query().Where(dbuser.IDIn(ids...)).All(ctx)
		if err != nil {
			return nil, 0, err
		}
		emailByID := make(map[int64]string, len(users))
		for _, u := range users {
			emailByID[u.ID] = u.Email
		}
		for i := range out {
			out[i].InviterEmail = emailByID[out[i].InviterID]
			out[i].DownlineEmail = emailByID[out[i].DownlineID]
		}
	}

	return out, int64(total), nil
}

func (r *referralCommissionRepository) SummaryByInviter(ctx context.Context, inviterID int64) (map[int8]service.CommissionSummary, error) {
	// 软删的下线不计入汇总，保持与 Lv1Downlines / Lv2Summary 的列表口径一致
	// （列表过滤 deleted_at，汇总也必须过滤，否则会出现"分项之和 ≠ 总额"）。
	rows, err := r.sql.QueryContext(ctx, `
		SELECT rc.tier, rc.status, COUNT(*), COALESCE(SUM(rc.commission_amount), 0)
		FROM referral_commissions rc
		JOIN users u ON u.id = rc.downline_id
		WHERE rc.inviter_id = $1 AND u.deleted_at IS NULL
		GROUP BY rc.tier, rc.status
	`, inviterID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := map[int8]service.CommissionSummary{}
	for rows.Next() {
		var tier int8
		var status string
		var count int64
		var amount float64
		if err := rows.Scan(&tier, &status, &count, &amount); err != nil {
			return nil, err
		}
		s := result[tier]
		s.Tier = tier
		switch status {
		case service.ReferralCommissionStatusPending:
			s.PendingAmount += amount
			s.PendingCount += count
		case service.ReferralCommissionStatusSettled:
			s.SettledAmount += amount
			s.SettledCount += count
		case service.ReferralCommissionStatusVoided:
			s.VoidedAmount += amount
			s.VoidedCount += count
		}
		result[tier] = s
	}
	return result, rows.Err()
}

func (r *referralCommissionRepository) Lv1Downlines(ctx context.Context, inviterID int64) ([]service.DownlineRowLv1, error) {
	// 列出所有 Lv1 下线 + 其抽佣聚合。即便从未消费过也要出现一行（让上线知道自己拉到了人）。
	rows, err := r.sql.QueryContext(ctx, `
		SELECT
			u.id,
			u.email,
			u.created_at,
			COALESCE(SUM(CASE WHEN rc.status = 'pending'  THEN rc.commission_amount ELSE 0 END), 0) AS pending_amount,
			COALESCE(SUM(CASE WHEN rc.status = 'settled'  THEN rc.commission_amount ELSE 0 END), 0) AS settled_amount,
			COALESCE(SUM(CASE WHEN rc.status IN ('pending','settled') THEN rc.commission_amount ELSE 0 END), 0) AS total_commission,
			COALESCE(SUM(CASE WHEN rc.status IN ('pending','settled') THEN rc.base_amount ELSE 0 END), 0) AS total_usage
		FROM users u
		LEFT JOIN referral_commissions rc
		  ON rc.downline_id = u.id AND rc.inviter_id = $1 AND rc.tier = 1
		WHERE u.inviter_id = $1 AND u.deleted_at IS NULL
		GROUP BY u.id, u.email, u.created_at
		ORDER BY u.created_at DESC, u.id DESC
	`, inviterID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []service.DownlineRowLv1{}
	for rows.Next() {
		var row service.DownlineRowLv1
		var email string
		var createdAt time.Time
		if err := rows.Scan(&row.DownlineID, &email, &createdAt,
			&row.PendingAmount, &row.SettledAmount, &row.TotalCommission, &row.TotalUsage); err != nil {
			return nil, err
		}
		row.DownlineEmail = maskEmail(email)
		row.JoinedAt = createdAt
		out = append(out, row)
	}
	return out, rows.Err()
}

func (r *referralCommissionRepository) Lv2Summary(ctx context.Context, inviterID int64) (*service.DownlineSummaryLv2, error) {
	// Lv2 = inviter 的下线的下线。先查所有 Lv1 user id，再统计 Lv2。
	// 软删的 Lv1/Lv2 用户都过滤掉，保证 count 和 amount 口径一致。
	rows, err := r.sql.QueryContext(ctx, `
		WITH lv1 AS (
			SELECT id FROM users WHERE inviter_id = $1 AND deleted_at IS NULL
		),
		lv2_users AS (
			SELECT u.id FROM users u
			JOIN lv1 ON u.inviter_id = lv1.id
			WHERE u.deleted_at IS NULL
		)
		SELECT
			(SELECT COUNT(*) FROM lv2_users),
			COALESCE(SUM(CASE WHEN rc.status = 'pending' THEN rc.commission_amount ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN rc.status = 'settled' THEN rc.commission_amount ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN rc.status IN ('pending','settled') THEN rc.commission_amount ELSE 0 END), 0)
		FROM referral_commissions rc
		WHERE rc.inviter_id = $1 AND rc.tier = 2
		  AND rc.downline_id IN (SELECT id FROM lv2_users)
	`, inviterID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out service.DownlineSummaryLv2
	if rows.Next() {
		if err := rows.Scan(&out.DownlineCount, &out.PendingAmount, &out.SettledAmount, &out.TotalCommission); err != nil {
			return nil, err
		}
	}
	return &out, rows.Err()
}

func (r *referralCommissionRepository) CountPendingByInviter(ctx context.Context, inviterID int64) (int64, error) {
	n, err := r.client.ReferralCommission.Query().
		Where(
			referralcommission.InviterIDEQ(inviterID),
			referralcommission.StatusEQ(service.ReferralCommissionStatusPending),
		).
		Count(ctx)
	if err != nil {
		return 0, err
	}
	return int64(n), nil
}

func (r *referralCommissionRepository) MarkSettled(ctx context.Context, ids []int64, adminID int64, note string) (int, error) {
	return r.markStatus(ctx, ids, service.ReferralCommissionStatusSettled, adminID, note)
}

func (r *referralCommissionRepository) MarkVoided(ctx context.Context, ids []int64, adminID int64, note string) (int, error) {
	return r.markStatus(ctx, ids, service.ReferralCommissionStatusVoided, adminID, note)
}

func (r *referralCommissionRepository) markStatus(ctx context.Context, ids []int64, status string, adminID int64, note string) (int, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	client := clientFromContext(ctx, r.client)
	now := time.Now()
	builder := client.ReferralCommission.Update().
		Where(
			referralcommission.IDIn(ids...),
			referralcommission.StatusEQ(service.ReferralCommissionStatusPending),
		).
		SetStatus(status).
		SetSettledAt(now).
		SetSettledByAdminID(adminID)
	if note != "" {
		builder = builder.SetSettledNote(note)
	}
	n, err := builder.Save(ctx)
	if err != nil {
		return 0, err
	}
	return n, nil
}

func commissionEntityToService(m *dbent.ReferralCommission) *service.ReferralCommission {
	if m == nil {
		return nil
	}
	return &service.ReferralCommission{
		ID:               m.ID,
		InviterID:        m.InviterID,
		DownlineID:       m.DownlineID,
		Tier:             m.Tier,
		SourceRequestID:  m.SourceRequestID,
		BaseAmount:       m.BaseAmount,
		Rate:             m.Rate,
		CommissionAmount: m.CommissionAmount,
		Status:           m.Status,
		SettledAt:        m.SettledAt,
		SettledByAdminID: m.SettledByAdminID,
		SettledNote:      m.SettledNote,
		CreatedAt:        m.CreatedAt,
	}
}

// maskEmail 脱敏邮箱：前 1 位明文 + *** + @domain。如 "wys@gmail.com" → "w***@gmail.com"。
func maskEmail(email string) string {
	at := strings.IndexByte(email, '@')
	if at <= 0 {
		return email
	}
	local := email[:at]
	domain := email[at:]
	if len(local) <= 1 {
		return fmt.Sprintf("%s***%s", local, domain)
	}
	return fmt.Sprintf("%s***%s", local[:1], domain)
}
