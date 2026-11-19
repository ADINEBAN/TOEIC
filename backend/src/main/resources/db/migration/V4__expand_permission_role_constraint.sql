-- V4: Expand Hibernate-generated ordinal check constraint on permissions.role for CONTENT_MANAGER (ordinal 2)
DROP PROCEDURE IF EXISTS update_permission_role_check_v4;
DELIMITER $$
CREATE PROCEDURE update_permission_role_check_v4()
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_schema = DATABASE()
          AND table_name = 'permissions'
          AND constraint_name = 'permissions_chk_1'
    ) THEN
        ALTER TABLE permissions DROP CHECK permissions_chk_1;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'permissions'
          AND column_name = 'role'
          AND data_type IN ('tinyint', 'smallint', 'int')
    ) THEN
        ALTER TABLE permissions ADD CONSTRAINT permissions_chk_1 CHECK (`role` BETWEEN 0 AND 2);
    END IF;
END$$
DELIMITER ;

CALL update_permission_role_check_v4();
DROP PROCEDURE IF EXISTS update_permission_role_check_v4;
