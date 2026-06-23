-- 首充返点（普通邀请人也可拿）+ 代理叠加体系
-- 设计要点：
--   * users 表加 first_recharge_amount_usd（首充原值，封顶基数）
--                 + first_recharge_inviter_bonus_paid（已发首充返点累计，对照 cap）
--   * referral_commissions 加 kind 列：first_recharge / agent_lv1 / agent_lv2
--   * 唯一索引由 (source_request_id, tier) 改为 (source_request_id, kind)：
--     同一笔 usage_log 可能同时产生 first_recharge + agent_lv1 + agent_lv2 三条
--   * 历史 commission 按 tier 1/2 → agent_lv1/agent_lv2 回填
--   * 普通邀请人首充返点默认 5%（settings 表，admin 可改）

-- 1. users 表：首充封顶追踪
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS first_recharge_amount_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS first_recharge_inviter_bonus_paid NUMERIC(10,6) NOT NULL DEFAULT 0;

-- 2. commissions 加 kind 列（default agent_lv1，配合下面的回填覆盖到 lv2）
ALTER TABLE referral_commissions
    ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'agent_lv1';

-- 历史数据回填：tier=2 改为 agent_lv2；tier=1 保持 default 的 agent_lv1。
-- 幂等：再跑一次 tier=2 已经是 agent_lv2，无副作用。
UPDATE referral_commissions SET kind = 'agent_lv2' WHERE tier = 2;

-- 3. 唯一索引迁移：从 (source_request_id, tier) → (source_request_id, kind)
DROP INDEX IF EXISTS uq_rc_request_tier;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rc_request_kind
    ON referral_commissions(source_request_id, kind);

CREATE INDEX IF NOT EXISTS idx_rc_kind ON referral_commissions(kind);

-- 4. 普通邀请人首充返点比例（settings；可改）— 默认 5%
INSERT INTO settings (key, value, updated_at)
    SELECT 'referral_first_recharge_inviter_rate', '0.05', NOW()
    WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'referral_first_recharge_inviter_rate');
