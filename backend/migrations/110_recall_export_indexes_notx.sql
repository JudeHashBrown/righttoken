CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_recall_updated_id
    ON users (updated_at, id)
    WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_orders_recall_updated_user
    ON payment_orders (updated_at, user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ops_error_logs_recall_updated_user
    ON ops_error_logs ((COALESCE(resolved_at, created_at)), user_id)
    WHERE user_id IS NOT NULL;
