-- Flyway V11: Add epic sculpted dragon/wolf animated avatar frames & refine frame metadata.

INSERT IGNORE INTO cosmetic_items (
    id, category, animation_type, rarity, name, description, price_diamonds, badge_emoji, primary_color, secondary_color, preview_key, sort_order, active
) VALUES
    ('frame_anim_frost_wolf', 'FRAME', 'ANIMATED', 'RARE', 'Băng Sói Chiến Thần', 'Khung cánh bạc băng lam kèm hiệu ứng hào quang tuyết lạnh xoay quanh.', 280, '🐺', '#38BDF8', '#0284C7', 'anim_frost_wolf', 17, 1),
    ('frame_anim_emerald_wolf', 'FRAME', 'ANIMATED', 'EPIC', 'Thiên Sói Lục Bảo', 'Khung cánh ngọc lục bảo viền kim tỏa luồng năng lượng rừng thẳm.', 460, '💚', '#10B981', '#047857', 'anim_emerald_wolf', 18, 1),
    ('frame_anim_crimson_dragon', 'FRAME', 'ANIMATED', 'LEGENDARY', 'Hỏa Long Bất Diệt', 'Khung Rồng Lửa hoàng kim uốn lượn hai cánh rực cháy kèm vòng xoay ma thuật.', 980, '🐉', '#EF4444', '#F59E0B', 'anim_crimson_dragon', 19, 1);

UPDATE cosmetic_items
SET name = 'Thanh Long Tinh Vân',
    description = 'Khung Thanh Long tím lam vũ trụ với hai tầng vòng xoay tinh tú và hạt phát sáng.'
WHERE id = 'frame_anim_galactic_dragon';

UPDATE cosmetic_items
SET name = 'Hào Quang Phượng Hoàng',
    description = 'Đôi cánh Phượng Hoàng rực lửa vàng cam vươn cao cùng tia lửa bay xung quanh.'
WHERE id = 'frame_anim_phoenix_flame';
