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

// ReferralCommission 二级分销抽佣明细。
//
// 每条记录代表「downline 用户的一笔消费在 tier 层贡献给 inviter 的抽佣」。
// 使用 source_request_id 作为去重键（usage_log 写入是异步 best-effort，
// usage_log.ID 不一定可用，但 RequestID 在入站即生成）。
type ReferralCommission struct {
	ent.Schema
}

func (ReferralCommission) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "referral_commissions"},
	}
}

func (ReferralCommission) Fields() []ent.Field {
	return []ent.Field{
		field.Int64("inviter_id").
			Comment("拿到抽佣的用户"),
		field.Int64("downline_id").
			Comment("贡献本次消费的下线用户"),
		field.Int8("tier").
			Comment("分销层级：1=直接下线，2=下线的下线"),
		field.String("source_request_id").
			MaxLen(64).
			Comment("来源 usage_log 的 RequestID（去重键）"),
		field.Float("base_amount").
			SchemaType(map[string]string{dialect.Postgres: "decimal(20,8)"}).
			Default(0).
			Comment("下线本次消费金额（快照）"),
		field.Float("rate").
			SchemaType(map[string]string{dialect.Postgres: "decimal(6,4)"}).
			Default(0).
			Comment("当时生效的费率（快照）"),
		field.Float("commission_amount").
			SchemaType(map[string]string{dialect.Postgres: "decimal(20,8)"}).
			Default(0).
			Comment("base_amount × rate"),
		field.String("status").
			MaxLen(16).
			Default("pending").
			Comment("pending / settled / voided"),
		field.Time("settled_at").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}),
		field.Int64("settled_by_admin_id").
			Optional().
			Nillable(),
		field.String("settled_note").
			Optional().
			Nillable().
			SchemaType(map[string]string{dialect.Postgres: "text"}),
		field.Time("created_at").
			Immutable().
			Default(time.Now).
			SchemaType(map[string]string{dialect.Postgres: "timestamptz"}),
	}
}

func (ReferralCommission) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("inviter_id", "status", "created_at"),
		index.Fields("downline_id"),
		// 同一笔消费在同一层级只能产生一条抽佣（幂等）
		index.Fields("source_request_id", "tier").Unique(),
	}
}
