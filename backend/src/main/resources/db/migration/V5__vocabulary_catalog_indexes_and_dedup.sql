-- Flyway V5: Deduplicate starter TOEIC Core vocabulary topics cleanly and add indexes for large CEFR + TOEIC catalogs

DROP PROCEDURE IF EXISTS cleanup_dup_starter_vocab_v5;
DELIMITER $$
CREATE PROCEDURE cleanup_dup_starter_vocab_v5()
BEGIN
    DECLARE min_topic_id BIGINT DEFAULT NULL;

    SELECT MIN(id) INTO min_topic_id
    FROM vocabulary_topics
    WHERE name = 'TOEIC Core Business & Office';

    IF min_topic_id IS NOT NULL THEN
        -- Update first non-conflicting user progress entry to canonical vocabulary id under min_topic_id;
        -- IGNORE cleanly skips a second duplicate topic copy targeting the same canonical word
        UPDATE IGNORE user_vocabulary_progress uvp
        JOIN vocabularies v_old ON uvp.vocabulary_id = v_old.id
        JOIN vocabulary_topics vt_old ON v_old.topic_id = vt_old.id
        JOIN vocabularies v_canon ON LOWER(v_canon.word) = LOWER(v_old.word) AND v_canon.topic_id = min_topic_id
        SET uvp.vocabulary_id = v_canon.id
        WHERE vt_old.name = 'TOEIC Core Business & Office'
          AND vt_old.id <> min_topic_id;

        -- Remove any remaining duplicate progress pointers belonging to duplicate starter topics
        DELETE uvp
        FROM user_vocabulary_progress uvp
        JOIN vocabularies v_old ON uvp.vocabulary_id = v_old.id
        JOIN vocabulary_topics vt_old ON v_old.topic_id = vt_old.id
        WHERE vt_old.name = 'TOEIC Core Business & Office'
          AND vt_old.id <> min_topic_id;

        -- Remove duplicate starter vocabularies on non-canonical topic copies
        DELETE v_old
        FROM vocabularies v_old
        JOIN vocabulary_topics vt_old ON v_old.topic_id = vt_old.id
        WHERE vt_old.name = 'TOEIC Core Business & Office'
          AND vt_old.id <> min_topic_id;

        -- Remove duplicate starter topic rows
        DELETE FROM vocabulary_topics
        WHERE name = 'TOEIC Core Business & Office'
          AND id <> min_topic_id;
    END IF;
END$$
DELIMITER ;

CALL cleanup_dup_starter_vocab_v5();
DROP PROCEDURE IF EXISTS cleanup_dup_starter_vocab_v5;

DROP PROCEDURE IF EXISTS add_idx_if_missing_v5;
DELIMITER $$
CREATE PROCEDURE add_idx_if_missing_v5(
    IN tbl_name VARCHAR(64),
    IN idx_name VARCHAR(64),
    IN col_expr VARCHAR(255)
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = tbl_name
          AND INDEX_NAME = idx_name
    ) THEN
        SET @ddl = CONCAT('CREATE INDEX `', idx_name, '` ON `', tbl_name, '` (', col_expr, ')');
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

CALL add_idx_if_missing_v5('vocabularies', 'idx_vocabularies_word', '`word`');
CALL add_idx_if_missing_v5('vocabularies', 'idx_vocabularies_topic_id', '`topic_id`, `id`');
CALL add_idx_if_missing_v5('vocabularies', 'idx_vocabularies_diff_level', '`difficulty_level`');
CALL add_idx_if_missing_v5('vocabulary_topics', 'idx_vocabulary_topics_level_active', '`level`, `is_active`');

DROP PROCEDURE IF EXISTS add_idx_if_missing_v5;
