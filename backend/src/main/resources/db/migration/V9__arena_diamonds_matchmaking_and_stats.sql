-- Flyway V9: Add Arena 1v1 diamonds, win/loss counters, and ELO rating on users

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

CALL add_col_if_missing('users', 'diamonds', 'INT NOT NULL DEFAULT 50');
CALL add_col_if_missing('users', 'arena_wins', 'INT NOT NULL DEFAULT 0');
CALL add_col_if_missing('users', 'arena_losses', 'INT NOT NULL DEFAULT 0');
CALL add_col_if_missing('users', 'arena_elo', 'INT NOT NULL DEFAULT 1000');

DROP PROCEDURE IF EXISTS add_col_if_missing;

UPDATE users SET diamonds = 50 WHERE diamonds IS NULL OR diamonds < 0;
UPDATE users SET arena_wins = 0 WHERE arena_wins IS NULL;
UPDATE users SET arena_losses = 0 WHERE arena_losses IS NULL;
UPDATE users SET arena_elo = 1000 WHERE arena_elo IS NULL OR arena_elo <= 0;
