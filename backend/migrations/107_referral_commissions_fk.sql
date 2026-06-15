-- 为 referral_commissions 加外键约束，防止 inviter_id / downline_id 变野指针。
-- 当前业务只软删用户，所以 ON DELETE RESTRICT 实际不会被触发；
-- 但万一未来增加硬删能力，可以在 DB 层提前拦截，避免数据失真。

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_rc_inviter_user'
    ) THEN
        ALTER TABLE referral_commissions
            ADD CONSTRAINT fk_rc_inviter_user
            FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_rc_downline_user'
    ) THEN
        ALTER TABLE referral_commissions
            ADD CONSTRAINT fk_rc_downline_user
            FOREIGN KEY (downline_id) REFERENCES users(id) ON DELETE RESTRICT;
    END IF;
END $$;
