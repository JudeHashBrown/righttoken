-- 为存量用户回填 invite_code。
-- 设计：循环挑选一个尚未有 invite_code 的用户，生成 8 位随机码（去掉易混淆字符），
-- 写入；若唯一冲突则重试。所有操作都依赖 uq_users_invite_code_alive 部分唯一索引。

DO $$
DECLARE
    target_user_id BIGINT;
    new_code TEXT;
    attempts INT;
    alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    alphabet_len INT := 32;
    i INT;
    success BOOLEAN;
BEGIN
    LOOP
        SELECT id INTO target_user_id
        FROM users
        WHERE invite_code IS NULL AND deleted_at IS NULL
        ORDER BY id
        LIMIT 1;

        EXIT WHEN target_user_id IS NULL;

        success := FALSE;
        attempts := 0;
        WHILE NOT success AND attempts < 5 LOOP
            attempts := attempts + 1;
            new_code := '';
            FOR i IN 1..8 LOOP
                new_code := new_code || substr(alphabet, 1 + floor(random() * alphabet_len)::int, 1);
            END LOOP;

            BEGIN
                UPDATE users SET invite_code = new_code WHERE id = target_user_id;
                success := TRUE;
            EXCEPTION WHEN unique_violation THEN
                success := FALSE;
            END;
        END LOOP;

        -- 5 次都冲突几乎不可能，但兜底：写一个含时间戳的备用码以打破循环。
        IF NOT success THEN
            UPDATE users SET invite_code = 'X' || substr(md5(target_user_id::text || clock_timestamp()::text), 1, 7)
                WHERE id = target_user_id;
        END IF;
    END LOOP;
END $$;
