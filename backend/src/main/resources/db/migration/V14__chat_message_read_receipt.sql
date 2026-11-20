ALTER TABLE chat_messages ADD COLUMN read_at DATETIME NULL;
UPDATE chat_messages SET read_at = created_at WHERE channel_type = 'DIRECT' AND read_at IS NULL;
