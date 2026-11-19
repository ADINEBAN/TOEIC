-- Flyway V7: Persistent semantic dictionary cache and per-user lookup history

CREATE TABLE IF NOT EXISTS dictionary_cache_entries (
    id BIGINT NOT NULL AUTO_INCREMENT,
    normalized_word VARCHAR(120) NOT NULL,
    word VARCHAR(120) NOT NULL,
    ipa VARCHAR(120) NULL,
    part_of_speech VARCHAR(50) NULL,
    cefr_level VARCHAR(20) NULL,
    meaning_vi VARCHAR(500) NULL,
    source VARCHAR(50) NULL,
    enriched BOOLEAN NOT NULL DEFAULT TRUE,
    payload_json LONGTEXT NOT NULL,
    hit_count INT NOT NULL DEFAULT 1,
    last_accessed_at DATETIME(6) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_dict_cache_normalized_word UNIQUE (normalized_word)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_dictionary_history (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    normalized_word VARCHAR(120) NOT NULL,
    word VARCHAR(120) NOT NULL,
    ipa VARCHAR(120) NULL,
    part_of_speech VARCHAR(50) NULL,
    cefr_level VARCHAR(20) NULL,
    meaning_vi VARCHAR(500) NULL,
    source VARCHAR(50) NULL,
    lookup_count INT NOT NULL DEFAULT 1,
    last_looked_up_at DATETIME(6) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_user_dict_history_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT uk_user_dict_history_word UNIQUE (user_id, normalized_word),
    INDEX idx_user_dict_history_recent (user_id, last_looked_up_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
