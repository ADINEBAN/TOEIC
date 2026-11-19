-- Flyway V10: Social profile (@username, bio, equipped cosmetics, XP, study time),
-- lesson diamond rewards & weekly leaderboard ledger, avatar/frame shop, achievements, friends & chat.

DROP PROCEDURE IF EXISTS add_col_if_missing_v10;
DELIMITER $$
CREATE PROCEDURE add_col_if_missing_v10(
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

CALL add_col_if_missing_v10('users', 'username', 'VARCHAR(60) NULL');
CALL add_col_if_missing_v10('users', 'bio', 'VARCHAR(300) NULL');
CALL add_col_if_missing_v10('users', 'equipped_frame_id', 'VARCHAR(64) NULL');
CALL add_col_if_missing_v10('users', 'equipped_avatar_id', 'VARCHAR(64) NULL');
CALL add_col_if_missing_v10('users', 'learning_xp', 'INT NOT NULL DEFAULT 0');
CALL add_col_if_missing_v10('users', 'total_study_minutes', 'INT NOT NULL DEFAULT 0');

DROP PROCEDURE IF EXISTS add_col_if_missing_v10;

UPDATE users
SET username = CONCAT(
    SUBSTRING(
        REPLACE(REPLACE(LOWER(SUBSTRING_INDEX(email, '@', 1)), '-', '_'), ' ', '_'),
        1,
        20
    ),
    '_',
    id
)
WHERE username IS NULL OR TRIM(username) = '';

CREATE TABLE IF NOT EXISTS diamond_transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    source_type VARCHAR(40) NOT NULL,
    reference_key VARCHAR(120) NULL,
    diamonds_delta INT NOT NULL,
    is_study_reward TINYINT(1) NOT NULL DEFAULT 1,
    description_vi VARCHAR(255) NOT NULL,
    week_start_date DATE NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_diamond_tx_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    INDEX idx_diamond_tx_week_study (week_start_date, is_study_reward, user_id),
    INDEX idx_diamond_tx_user_ref (user_id, source_type, reference_key)
);

CREATE TABLE IF NOT EXISTS cosmetic_items (
    id VARCHAR(64) PRIMARY KEY,
    category VARCHAR(20) NOT NULL,
    animation_type VARCHAR(20) NOT NULL,
    rarity VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NOT NULL,
    price_diamonds INT NOT NULL,
    badge_emoji VARCHAR(16) NULL,
    primary_color VARCHAR(20) NULL,
    secondary_color VARCHAR(20) NULL,
    preview_key VARCHAR(100) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    active TINYINT(1) NOT NULL DEFAULT 1
);

INSERT IGNORE INTO cosmetic_items (
    id, category, animation_type, rarity, name, description, price_diamonds, badge_emoji, primary_color, secondary_color, preview_key, sort_order, active
) VALUES
    ('frame_static_bronze', 'FRAME', 'STATIC', 'COMMON', 'Viền Đồng Cổ Điển', 'Khung tĩnh sắc đồng ấm thanh lịch cho người mới bắt đầu.', 30, '🛡️', '#CD7F32', '#F59E0B', 'static_bronze', 1, 1),
    ('frame_static_emerald', 'FRAME', 'STATIC', 'COMMON', 'Ngọc Lục Bảo', 'Khung tĩnh xanh ngọc dịu mắt, tôn đường nét ảnh đại diện.', 60, '🌿', '#10B981', '#059669', 'static_emerald', 2, 1),
    ('frame_static_sakura', 'FRAME', 'STATIC', 'RARE', 'Hoa Anh Đào', 'Khung tĩnh sắc hồng pastel điểm hoa anh đào tinh tế.', 120, '🌸', '#F472B6', '#FB7185', 'static_sakura', 3, 1),
    ('frame_static_scholar', 'FRAME', 'STATIC', 'RARE', 'Vương Miện Học Giả', 'Khung tĩnh vàng kim dành riêng cho học viên chăm chỉ.', 180, '🎓', '#F59E0B', '#D97706', 'static_scholar', 4, 1),
    ('frame_static_royal', 'FRAME', 'STATIC', 'EPIC', 'Hoàng Gia Lam Ngọc', 'Khung tĩnh lam ngọc viền hoàng kim sang trọng.', 320, '👑', '#2563EB', '#4F46E5', 'static_royal', 5, 1),

    ('frame_anim_neon_pulse', 'FRAME', 'ANIMATED', 'RARE', 'Sóng Neon Nhịp Thở', 'Khung động phát sáng nhịp thở tím-lam liên tục.', 200, '⚡', '#6366F1', '#06B6D4', 'anim_neon_pulse', 6, 1),
    ('frame_anim_cyber_orbit', 'FRAME', 'ANIMATED', 'EPIC', 'Quỹ Đạo Sao Băng', 'Khung động xoay vòng dải ngân hà kèm ngôi sao quay quanh.', 380, '✨', '#8B5CF6', '#EC4899', 'anim_cyber_orbit', 7, 1),
    ('frame_anim_phoenix_flame', 'FRAME', 'ANIMATED', 'EPIC', 'Hào Quang Phượng Hoàng', 'Khung động rực lửa vàng cam co giãn mạnh mẽ.', 500, '🔥', '#F97316', '#EF4444', 'anim_phoenix_flame', 8, 1),
    ('frame_anim_aurora_crown', 'FRAME', 'ANIMATED', 'LEGENDARY', 'Bắc Cực Quang Hoàng Kim', 'Khung động đa sắc Bắc Cực Quang xoay mượt với vương miện lấp lánh.', 850, '💎', '#14B8A6', '#FBBF24', 'anim_aurora_crown', 9, 1),
    ('frame_anim_galactic_dragon', 'FRAME', 'ANIMATED', 'LEGENDARY', 'Tinh Vân Bất Bại', 'Khung động tối thượng xoay hai lớp ánh sáng tím-vàng kim cương.', 1200, '🌌', '#7C3AED', '#F59E0B', 'anim_galactic_dragon', 10, 1),

    ('avatar_kitty', 'AVATAR', 'STATIC', 'COMMON', 'Mèo Cam May Mắn', 'Ảnh đại diện 3D đất sét chú mèo cam thân thiện.', 80, '🐱', '#FB923C', '#FED7AA', 'kitty', 11, 1),
    ('avatar_owl', 'AVATAR', 'STATIC', 'RARE', 'Cú Pháp Sư TOEIC', 'Ảnh đại diện 3D cú mèo đội mũ phù thủy thông thái.', 150, '🦉', '#8B5CF6', '#DDD6FE', 'owl', 12, 1),
    ('avatar_panda', 'AVATAR', 'STATIC', 'RARE', 'Gấu Trúc Học Giả', 'Ảnh đại diện 3D gấu trúc dễ thương cùng lá trúc may mắn.', 150, '🐼', '#10B981', '#D1FAE5', 'panda', 13, 1),
    ('avatar_bunny', 'AVATAR', 'STATIC', 'EPIC', 'Thỏ Ngọc Mùa Xuân', 'Ảnh đại diện 3D thỏ trắng pastel dịu dàng.', 280, '🐰', '#EC4899', '#FCE7F3', 'bunny', 14, 1),
    ('avatar_shiba', 'AVATAR', 'STATIC', 'EPIC', 'Shiba Ngầu Lòi', 'Ảnh đại diện 3D chó Shiba đeo kính râm cực chất.', 350, '🐕', '#0EA5E9', '#BAE6FD', 'shiba', 15, 1),
    ('avatar_parrot', 'AVATAR', 'ANIMATED', 'LEGENDARY', 'Vẹt Parroto Thủ Khoa', 'Ảnh đại diện 3D linh vật vẹt xanh huyền thoại tỏa hào quang.', 600, '🦜', '#2563EB', '#60A5FA', 'parrot', 16, 1);

CREATE TABLE IF NOT EXISTS user_cosmetics (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    cosmetic_id VARCHAR(64) NOT NULL,
    purchased_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_cosmetic_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_user_cosmetic_item FOREIGN KEY (cosmetic_id) REFERENCES cosmetic_items (id) ON DELETE CASCADE,
    UNIQUE KEY uq_user_cosmetic (user_id, cosmetic_id)
);

CREATE TABLE IF NOT EXISTS user_achievements (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    achievement_code VARCHAR(50) NOT NULL,
    title_vi VARCHAR(120) NOT NULL,
    description_vi VARCHAR(255) NOT NULL,
    icon_name VARCHAR(40) NOT NULL,
    reward_diamonds INT NOT NULL DEFAULT 0,
    unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_achievement_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE KEY uq_user_achievement (user_id, achievement_code)
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    channel_type VARCHAR(20) NOT NULL,
    message_type VARCHAR(30) NOT NULL,
    sender_id BIGINT NULL,
    recipient_id BIGINT NULL,
    content VARCHAR(1000) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_chat_sender FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_chat_recipient FOREIGN KEY (recipient_id) REFERENCES users (id) ON DELETE SET NULL,
    INDEX idx_chat_channel_time (channel_type, created_at),
    INDEX idx_chat_direct_pair (channel_type, sender_id, recipient_id, created_at)
);

CREATE TABLE IF NOT EXISTS user_friendships (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    requester_id BIGINT NOT NULL,
    addressee_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_friend_requester FOREIGN KEY (requester_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_friend_addressee FOREIGN KEY (addressee_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE KEY uq_friendship_pair (requester_id, addressee_id)
);
