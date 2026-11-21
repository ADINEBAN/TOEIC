ALTER TABLE users ADD COLUMN is_verified TINYINT(1) NOT NULL DEFAULT 0;
UPDATE users SET is_verified = 1 WHERE LOWER(email) = 'yadinbya3@gmail.com';
