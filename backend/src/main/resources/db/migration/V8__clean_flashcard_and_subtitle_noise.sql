-- Flyway V8: Clean YouTube transcript noise ([music], [âm nhạc], >>, &gt;&gt;, ♪) and redundant [Từ vựng...] prefixes

UPDATE flashcards
SET example_sentence = NULLIF(
    TRIM(
        REGEXP_REPLACE(
            REGEXP_REPLACE(
                REPLACE(REPLACE(example_sentence, '&gt;&gt;', ' '), '>>', ' '),
                '\\[(music|âm nhạc|nhạc|applause|vỗ tay|laughter|tiếng cười|cheering|sound|inaudible)\\]|\\((music|âm nhạc)\\)|[♪♫]',
                ' '
            ),
            '[[:space:]]+',
            ' '
        )
    ),
    ''
)
WHERE example_sentence IS NOT NULL
  AND (
    LOWER(example_sentence) REGEXP '\\[(music|âm nhạc|nhạc|applause|vỗ tay|laughter|tiếng cười|cheering|sound|inaudible)\\]|\\((music|âm nhạc)\\)|>>|&gt;&gt;|[♪♫]'
  );

UPDATE flashcards
SET meaning_vi = TRIM(
    REGEXP_REPLACE(
        meaning_vi,
        '^\\[(Từ vựng[^\\]]*)\\][[:space:]]*',
        ''
    )
)
WHERE meaning_vi IS NOT NULL
  AND meaning_vi REGEXP '^\\[(Từ vựng[^\\]]*)\\]';

UPDATE video_subtitle_segments
SET
    english_text = COALESCE(
        NULLIF(
            TRIM(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(
                        REPLACE(REPLACE(english_text, '&gt;&gt;', ' '), '>>', ' '),
                        '\\[(music|âm nhạc|nhạc|applause|vỗ tay|laughter|tiếng cười|cheering|sound|inaudible)\\]|\\((music|âm nhạc)\\)|[♪♫]',
                        ' '
                    ),
                    '[[:space:]]+',
                    ' '
                )
            ),
            ''
        ),
        english_text
    ),
    vietnamese_text = CASE
        WHEN vietnamese_text IS NULL THEN NULL
        ELSE TRIM(
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    REPLACE(REPLACE(vietnamese_text, '&gt;&gt;', ' '), '>>', ' '),
                    '\\[(music|âm nhạc|nhạc|applause|vỗ tay|laughter|tiếng cười|cheering|sound|inaudible)\\]|\\((music|âm nhạc)\\)|[♪♫]',
                    ' '
                ),
                '[[:space:]]+',
                ' '
            )
        )
    END
WHERE LOWER(COALESCE(english_text, '')) REGEXP '\\[(music|âm nhạc|nhạc|applause|vỗ tay|laughter|tiếng cười|cheering|sound|inaudible)\\]|>>|&gt;&gt;|[♪♫]'
   OR LOWER(COALESCE(vietnamese_text, '')) REGEXP '\\[(music|âm nhạc|nhạc|applause|vỗ tay|laughter|tiếng cười|cheering|sound|inaudible)\\]|>>|&gt;&gt;|[♪♫]';
