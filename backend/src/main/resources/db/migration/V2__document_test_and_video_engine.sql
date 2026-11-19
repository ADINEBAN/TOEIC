-- Non-destructive migration for Module 1 (Document-to-TOEIC Test AI)
-- and Modules 2 & 3 (Full-Length Video Processing, ASR, & EN-VI Bilingual Subtitles)

-- Helper procedure to safely add nullable columns if absent (MySQL 8 compatible)
DROP PROCEDURE IF EXISTS add_col_if_missing;
DELIMITER $$
CREATE PROCEDURE add_col_if_missing(
    IN tbl_name VARCHAR(64),
    IN col_name VARCHAR(64),
    IN col_def VARCHAR(255)
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = tbl_name
          AND COLUMN_NAME = col_name
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', tbl_name, '` ADD COLUMN `', col_name, '` ', col_def);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

CALL add_col_if_missing('tests', 'owner_user_id', 'BIGINT NULL');
CALL add_col_if_missing('tests', 'source_document_id', 'BIGINT NULL');
CALL add_col_if_missing('questions', 'source_document_id', 'BIGINT NULL');
CALL add_col_if_missing('questions', 'source_page_number', 'INT NULL');
CALL add_col_if_missing('questions', 'original_question_number', 'INT NULL');
CALL add_col_if_missing('questions', 'extraction_confidence', 'DOUBLE NULL');
CALL add_col_if_missing('questions', 'validation_status', 'VARCHAR(40) NULL');
CALL add_col_if_missing('questions', 'answer_key_verified', 'TINYINT(1) NULL');

DROP PROCEDURE IF EXISTS add_col_if_missing;

CREATE TABLE IF NOT EXISTS imported_documents (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_format VARCHAR(30) NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    sha256_hash VARCHAR(64) NOT NULL,
    storage_path VARCHAR(512),
    page_count INT NOT NULL DEFAULT 1,
    ocr_used TINYINT(1) NOT NULL DEFAULT 0,
    ocr_engine VARCHAR(50),
    raw_extracted_text LONGTEXT,
    status VARCHAR(40) NOT NULL DEFAULT 'UPLOADED',
    validation_summary_json LONGTEXT,
    generated_test_id BIGINT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_imp_doc_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    INDEX idx_imp_doc_user_created (user_id, created_at),
    INDEX idx_imp_doc_user_hash (user_id, sha256_hash),
    INDEX idx_imp_doc_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS imported_document_passages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    document_id BIGINT NOT NULL,
    passage_code VARCHAR(80) NOT NULL,
    part_no INT NOT NULL,
    passage_type VARCHAR(30) NOT NULL,
    document_kind VARCHAR(60),
    page_number INT NOT NULL DEFAULT 1,
    content LONGTEXT NOT NULL,
    table_json LONGTEXT,
    linked_passage_codes VARCHAR(255),
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_imp_pass_doc FOREIGN KEY (document_id) REFERENCES imported_documents (id) ON DELETE CASCADE,
    INDEX idx_imp_pass_doc_sort (document_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS imported_document_questions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    document_id BIGINT NOT NULL,
    passage_id BIGINT NULL,
    part_no INT NOT NULL,
    original_question_number INT,
    page_number INT NOT NULL DEFAULT 1,
    question_text TEXT NOT NULL,
    options_json LONGTEXT NOT NULL,
    official_correct_label VARCHAR(5),
    answer_key_verified TINYINT(1) NOT NULL DEFAULT 0,
    ai_suggested_label VARCHAR(5),
    ai_suggested_explanation TEXT,
    extraction_confidence DOUBLE DEFAULT 0.9,
    validation_status VARCHAR(40) NOT NULL DEFAULT 'VALID',
    validation_issues_json TEXT,
    included TINYINT(1) NOT NULL DEFAULT 1,
    saved_question_id BIGINT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_imp_q_doc FOREIGN KEY (document_id) REFERENCES imported_documents (id) ON DELETE CASCADE,
    CONSTRAINT fk_imp_q_pass FOREIGN KEY (passage_id) REFERENCES imported_document_passages (id) ON DELETE SET NULL,
    INDEX idx_imp_q_doc_part (document_id, part_no, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS imported_videos (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    video_uid VARCHAR(128) NOT NULL,
    source_url VARCHAR(1024) NOT NULL,
    canonical_url VARCHAR(1024),
    platform VARCHAR(40) NOT NULL DEFAULT 'YOUTUBE',
    title VARCHAR(512) NOT NULL,
    author_name VARCHAR(255),
    thumbnail_url VARCHAR(1024),
    stream_video_url VARCHAR(2048),
    local_media_path VARCHAR(1024),
    audio_language VARCHAR(30) DEFAULT 'en',
    duration_seconds INT NOT NULL DEFAULT 0,
    verified_media_duration_seconds INT NOT NULL DEFAULT 0,
    level VARCHAR(20) DEFAULT 'B1',
    topic VARCHAR(120) DEFAULT 'General English',
    metadata_json LONGTEXT,
    is_favorite TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_imp_vid_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT uk_imp_vid_user_uid UNIQUE (user_id, video_uid),
    INDEX idx_imp_vid_user_updated (user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS video_processing_jobs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    imported_video_id BIGINT NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'QUEUED',
    overall_progress INT NOT NULL DEFAULT 0,
    download_progress INT NOT NULL DEFAULT 0,
    audio_extraction_progress INT NOT NULL DEFAULT 0,
    transcription_progress INT NOT NULL DEFAULT 0,
    translation_progress INT NOT NULL DEFAULT 0,
    total_chunks INT NOT NULL DEFAULT 0,
    completed_chunks INT NOT NULL DEFAULT 0,
    last_completed_chunk INT NOT NULL DEFAULT -1,
    current_stage_message VARCHAR(500),
    error_message TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    cancel_requested TINYINT(1) NOT NULL DEFAULT 0,
    started_at DATETIME NULL,
    completed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_vid_job_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_vid_job_vid FOREIGN KEY (imported_video_id) REFERENCES imported_videos (id) ON DELETE CASCADE,
    INDEX idx_vid_job_user_status (user_id, status),
    INDEX idx_vid_job_vid (imported_video_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS video_audio_tracks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    imported_video_id BIGINT NOT NULL,
    audio_file_path VARCHAR(1024),
    codec VARCHAR(40),
    sample_rate INT DEFAULT 16000,
    duration_seconds INT NOT NULL DEFAULT 0,
    chunk_count INT NOT NULL DEFAULT 0,
    chunk_duration_seconds INT NOT NULL DEFAULT 300,
    status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_vid_audio_vid FOREIGN KEY (imported_video_id) REFERENCES imported_videos (id) ON DELETE CASCADE,
    INDEX idx_vid_audio_vid (imported_video_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS video_transcripts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    imported_video_id BIGINT NOT NULL,
    detected_language VARCHAR(30) DEFAULT 'en',
    asr_engine VARCHAR(60),
    full_english_text LONGTEXT,
    average_confidence DOUBLE DEFAULT 0.9,
    uncertain_segment_count INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_vid_tr_vid FOREIGN KEY (imported_video_id) REFERENCES imported_videos (id) ON DELETE CASCADE,
    INDEX idx_vid_tr_vid (imported_video_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS video_subtitle_segments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    imported_video_id BIGINT NOT NULL,
    sequence_number INT NOT NULL,
    start_time DOUBLE NOT NULL,
    end_time DOUBLE NOT NULL,
    english_text TEXT NOT NULL,
    vietnamese_text TEXT NOT NULL,
    english_note TEXT,
    confidence DOUBLE DEFAULT 0.9,
    uncertain TINYINT(1) NOT NULL DEFAULT 0,
    chunk_index INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_vid_sub_vid FOREIGN KEY (imported_video_id) REFERENCES imported_videos (id) ON DELETE CASCADE,
    INDEX idx_vid_sub_seq (imported_video_id, sequence_number),
    INDEX idx_vid_sub_time (imported_video_id, start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_video_learning_states (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    imported_video_id BIGINT NOT NULL,
    last_position_seconds DOUBLE NOT NULL DEFAULT 0,
    playback_speed DOUBLE NOT NULL DEFAULT 1.0,
    completed TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_vid_state_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_vid_state_vid FOREIGN KEY (imported_video_id) REFERENCES imported_videos (id) ON DELETE CASCADE,
    CONSTRAINT uk_vid_state_user_vid UNIQUE (user_id, imported_video_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS video_bookmarks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    imported_video_id BIGINT NOT NULL,
    timestamp_seconds DOUBLE NOT NULL,
    label VARCHAR(255) NOT NULL,
    note TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_vid_bm_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_vid_bm_vid FOREIGN KEY (imported_video_id) REFERENCES imported_videos (id) ON DELETE CASCADE,
    INDEX idx_vid_bm_user_vid (user_id, imported_video_id, timestamp_seconds)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS video_vocabulary_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    imported_video_id BIGINT NOT NULL,
    segment_id BIGINT NULL,
    word VARCHAR(150) NOT NULL,
    normalized_word VARCHAR(150) NOT NULL,
    pronunciation VARCHAR(150),
    part_of_speech VARCHAR(100),
    meaning_vi TEXT,
    meaning_en TEXT,
    example_sentence TEXT,
    example_translation TEXT,
    grammar_note TEXT,
    source VARCHAR(50),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_vid_voc_vid FOREIGN KEY (imported_video_id) REFERENCES imported_videos (id) ON DELETE CASCADE,
    INDEX idx_vid_voc_vid (imported_video_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
