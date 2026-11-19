-- Flyway V3: Admin-Controlled Video Learning Library & Safe Data Migration
-- Preserves all existing videos, transcripts, segments, bookmarks, and user learning progress.

ALTER TABLE `users` MODIFY COLUMN `role` VARCHAR(30) NOT NULL DEFAULT 'USER';

DROP PROCEDURE IF EXISTS add_col_if_missing_v3;
DELIMITER $$
CREATE PROCEDURE add_col_if_missing_v3(
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

CALL add_col_if_missing_v3('imported_videos', 'description', 'TEXT NULL');
CALL add_col_if_missing_v3('imported_videos', 'workflow_status', 'VARCHAR(40) NOT NULL DEFAULT ''DRAFT''');
CALL add_col_if_missing_v3('imported_videos', 'is_published', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL add_col_if_missing_v3('imported_videos', 'published_at', 'DATETIME NULL');
CALL add_col_if_missing_v3('imported_videos', 'reviewed_by_user_id', 'BIGINT NULL');
CALL add_col_if_missing_v3('user_video_learning_states', 'is_favorite', 'TINYINT(1) NOT NULL DEFAULT 0');

DROP PROCEDURE IF EXISTS add_col_if_missing_v3;

-- Migrate existing per-video favorite flags into per-user learning states without losing user data
INSERT INTO user_video_learning_states (user_id, imported_video_id, last_position_seconds, playback_speed, completed, is_favorite, created_at, updated_at)
SELECT iv.user_id, iv.id, 0, 1.0, 0, 1, NOW(), NOW()
FROM imported_videos iv
WHERE iv.is_favorite = 1
  AND NOT EXISTS (
      SELECT 1 FROM user_video_learning_states uvls
      WHERE uvls.user_id = iv.user_id AND uvls.imported_video_id = iv.id
  );

UPDATE user_video_learning_states uvls
JOIN imported_videos iv ON iv.id = uvls.imported_video_id AND iv.user_id = uvls.user_id
SET uvls.is_favorite = 1
WHERE iv.is_favorite = 1;

-- Safely preserve and promote already-completed valid videos so existing learners continue seamlessly
UPDATE imported_videos iv
SET iv.workflow_status = 'PUBLISHED',
    iv.is_published = 1,
    iv.published_at = COALESCE(iv.published_at, NOW())
WHERE iv.duration_seconds > 0
  AND iv.verified_media_duration_seconds > 0
  AND EXISTS (
      SELECT 1 FROM video_processing_jobs vpj
      WHERE vpj.imported_video_id = iv.id AND vpj.status = 'COMPLETED'
  )
  AND EXISTS (
      SELECT 1 FROM video_subtitle_segments vss
      WHERE vss.imported_video_id = iv.id
  );

-- Mark previously failed videos accurately without deleting them
UPDATE imported_videos iv
SET iv.workflow_status = 'FAILED',
    iv.is_published = 0
WHERE iv.is_published = 0
  AND EXISTS (
      SELECT 1 FROM video_processing_jobs vpj
      WHERE vpj.imported_video_id = iv.id AND vpj.status = 'FAILED'
  );
