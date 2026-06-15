-- 二级分销系统：用户表新增 inviter_id + invite_code，新增费率规则表 + 抽佣明细表。
-- 设计要点：
--   * inviter_id 允许 NULL（兼容存量 + 自然注册）
--   * invite_code 唯一（部分索引，软删支持）
--   * 抽佣去重键 = source_request_id + tier
--   * 费率历史化：同一 tier 同时只允许一条 effective_until IS NULL

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS inviter_id BIGINT NULL,
    ADD COLUMN IF NOT EXISTS invite_code VARCHAR(16) NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_no_self_referral'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT check_no_self_referral CHECK (id <> inviter_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_inviter_id ON users(inviter_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_invite_code_alive
    ON users(invite_code)
    WHERE deleted_at IS NULL AND invite_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS referral_commission_rules (
    id BIGSERIAL PRIMARY KEY,
    tier SMALLINT NOT NULL,
    rate NUMERIC(6,4) NOT NULL DEFAULT 0,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ NULL,
    created_by_admin_id BIGINT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rcr_tier_until ON referral_commission_rules(tier, effective_until);
CREATE INDEX IF NOT EXISTS idx_rcr_tier_from ON referral_commission_rules(tier, effective_from);

-- 同一 tier 只允许一条 effective_until IS NULL（生效中），防止并发改费率产生双活规则。
CREATE UNIQUE INDEX IF NOT EXISTS uq_rcr_tier_active
    ON referral_commission_rules(tier)
    WHERE effective_until IS NULL;

-- 默认费率：Lv1 = 5%、Lv2 = 2%；幂等插入。
INSERT INTO referral_commission_rules (tier, rate, effective_from)
    SELECT 1, 0.0500, NOW()
    WHERE NOT EXISTS (SELECT 1 FROM referral_commission_rules WHERE tier = 1);
INSERT INTO referral_commission_rules (tier, rate, effective_from)
    SELECT 2, 0.0200, NOW()
    WHERE NOT EXISTS (SELECT 1 FROM referral_commission_rules WHERE tier = 2);

CREATE TABLE IF NOT EXISTS referral_commissions (
    id BIGSERIAL PRIMARY KEY,
    inviter_id BIGINT NOT NULL,
    downline_id BIGINT NOT NULL,
    tier SMALLINT NOT NULL,
    source_request_id VARCHAR(64) NOT NULL,
    base_amount NUMERIC(20,8) NOT NULL DEFAULT 0,
    rate NUMERIC(6,4) NOT NULL DEFAULT 0,
    commission_amount NUMERIC(20,8) NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    settled_at TIMESTAMPTZ NULL,
    settled_by_admin_id BIGINT NULL,
    settled_note TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rc_inviter_status_created ON referral_commissions(inviter_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_rc_downline ON referral_commissions(downline_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rc_request_tier ON referral_commissions(source_request_id, tier);
