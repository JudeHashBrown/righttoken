-- 首充奖励：邀请码注册用户的首笔真实支付可获得 1.05× 奖励。
-- referral_bonus_claimed_at NULL = 未领取；非空 = 已领取。
-- 通过 CAS（UPDATE ... WHERE referral_bonus_claimed_at IS NULL）保证不会双领。

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS referral_bonus_claimed_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_users_referral_bonus_claimed
    ON users(referral_bonus_claimed_at)
    WHERE deleted_at IS NULL;

-- Seed 默认费率 1.05（即 +5%）。已存在则不动，admin 可在后台调整。
INSERT INTO settings (key, value, updated_at)
    SELECT 'referral_first_recharge_bonus_rate', '1.05', NOW()
    WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'referral_first_recharge_bonus_rate');
