ALTER TABLE users
    ADD COLUMN IF NOT EXISTS registration_ip VARCHAR(45);

COMMENT ON COLUMN users.registration_ip IS
    'Client IP captured once when the user first registers; never overwritten by login';
