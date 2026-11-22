ALTER TABLE users
    ADD COLUMN plan_tier VARCHAR(20) NOT NULL DEFAULT 'FREE',
    ADD COLUMN plan_expires_at DATETIME NULL;

UPDATE users
SET plan_tier = 'PRO'
WHERE is_premium = 1 AND (plan_tier IS NULL OR plan_tier = 'FREE');

CREATE TABLE IF NOT EXISTS payment_orders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_code VARCHAR(40) NOT NULL UNIQUE,
    user_id BIGINT NOT NULL,
    plan_code VARCHAR(30) NOT NULL,
    plan_tier VARCHAR(20) NOT NULL,
    duration_days INT NOT NULL,
    amount_vnd BIGINT NOT NULL,
    bonus_diamonds INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    sepay_transaction_id BIGINT UNIQUE NULL,
    gateway VARCHAR(60) NULL,
    reference_code VARCHAR(100) NULL,
    transfer_content VARCHAR(500) NULL,
    paid_at DATETIME NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    CONSTRAINT fk_payment_orders_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    INDEX idx_payment_orders_user_status (user_id, status),
    INDEX idx_payment_orders_code (order_code)
);

CREATE TABLE IF NOT EXISTS user_feature_quotas (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    feature_key VARCHAR(40) NOT NULL,
    period_key VARCHAR(20) NOT NULL,
    used_count INT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL,
    CONSTRAINT fk_user_feature_quotas_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_feature_period (user_id, feature_key, period_key)
);
