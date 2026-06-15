package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// ReferralCommissionRule 二级分销抽佣比例规则（按 tier 分层、可历史化）。
//
// 同一 tier 在任一时间窗只允许一条「生效中」（effective_until IS NULL）。
// 修改费率时：旧规则的 effective_until 写入 NOW()，再插入新规则。
type ReferralCommissionRule struct {
	ent.Schema
}

func (ReferralCommissionRule) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "referral_commission_rules"},
	}
}

func (ReferralCommissionRule) Fields() []ent.Field {
	return []ent.Field{
		field.Int8("tier").
			Comment("分销层级：1=直接下线，2=下线的下线"),
		field.Float("rate").
			SchemaType(map[string]string{dialect.Postgres: "decimal(6,4)"}).
			Default(0).
			Comment("抽佣比例，0.0500 = 5%"),
		field.Time("effective_from").
			Default(time.Now).
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}),
		field.Time("effective_until").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}).
			Comment("NULL 表示当前生效中"),
		field.Int64("created_by_admin_id").
			Optional().
			Nillable().
			Comment("修改/创建该规则的管理员"),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}),
	}
}

func (ReferralCommissionRule) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("tier", "effective_until"),
		index.Fields("tier", "effective_from"),
	}
}
