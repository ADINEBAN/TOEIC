-- Flyway V12: Convert hardcoded localhost/LAN /api/media/ URLs into portable relative paths
-- so existing lessons and uploaded avatars continue working seamlessly when deployed to any server.

UPDATE video_lessons
SET video_url = SUBSTRING(video_url, LOCATE('/api/media/', video_url))
WHERE LOCATE('/api/media/', video_url) > 1
  AND (
      video_url LIKE 'http://localhost%'
      OR video_url LIKE 'http://127.0.0.1%'
      OR video_url LIKE 'http://10.0.2.2%'
      OR video_url LIKE 'http://192.168.%'
      OR video_url LIKE 'http://172.%'
  );

UPDATE users
SET avatar_url = SUBSTRING(avatar_url, LOCATE('/api/media/', avatar_url))
WHERE avatar_url IS NOT NULL
  AND LOCATE('/api/media/', avatar_url) > 1
  AND (
      avatar_url LIKE 'http://localhost%'
      OR avatar_url LIKE 'http://127.0.0.1%'
      OR avatar_url LIKE 'http://10.0.2.2%'
      OR avatar_url LIKE 'http://192.168.%'
      OR avatar_url LIKE 'http://172.%'
  );
