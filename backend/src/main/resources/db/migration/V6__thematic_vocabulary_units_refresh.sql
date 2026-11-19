-- Flyway V6: Refresh v1 TOEIC-600 and alphabetical CEFR topics into clean thematic Units.
-- Preserves TOEIC Core Business & Office and any words referenced in user_vocabulary_progress.

DELETE v
FROM vocabularies v
JOIN vocabulary_topics vt ON v.topic_id = vt.id
WHERE (
    vt.level = 'TOEIC-600'
    OR vt.name LIKE 'TOEIC 0%'
    OR vt.name LIKE 'TOEIC 1%'
    OR vt.name LIKE 'CEFR %'
)
  AND NOT EXISTS (
    SELECT 1
    FROM user_vocabulary_progress uvp
    WHERE uvp.vocabulary_id = v.id
);

DELETE vt
FROM vocabulary_topics vt
WHERE (
    vt.level = 'TOEIC-600'
    OR vt.name LIKE 'TOEIC 0%'
    OR vt.name LIKE 'TOEIC 1%'
    OR vt.name LIKE 'CEFR %'
)
  AND NOT EXISTS (
    SELECT 1
    FROM vocabularies v
    WHERE v.topic_id = vt.id
);
