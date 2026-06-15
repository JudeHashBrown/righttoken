-- 邀请功能开关：所有用户默认 false，管理员自动开启。
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_referral_partner BOOLEAN NOT NULL DEFAULT false;

-- 自动开启所有管理员的邀请功能
UPDATE users SET is_referral_partner = true WHERE role = 'admin';

CREATE INDEX IF NOT EXISTS idx_users_referral_partner ON users(is_referral_partner) WHERE deleted_at IS NULL;
