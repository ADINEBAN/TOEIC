# Database Schema

**Database**: MySQL, port `3307`, schema `toeic`  
**Schema management**: Hibernate `ddl-auto: update` — no SQL migration files.  
**Base fields** (via `BaseEntity`): `created_at`, `updated_at` on every table.  
**All IDs**: `BIGINT AUTO_INCREMENT (GenerationType.IDENTITY)`.

---

## Core Content Tables

### `users`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| username | VARCHAR | unique |
| email | VARCHAR | unique |
| password_hash | VARCHAR | BCrypt |
| role | ENUM | USER, ADMIN |
| created_at / updated_at | DATETIME | BaseEntity |

### `user_profiles`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT FK → users | |
| display_name | VARCHAR | |
| avatar_url | VARCHAR | Cloudinary |

### `permissions`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| name | VARCHAR | permission name |

---

## Learning Path Tables

### `learning_paths`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| title | VARCHAR | |
| description | TEXT | |
| target_score | INT | |

### `learning_path_milestones`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| learning_path_id | BIGINT FK | |
| title | VARCHAR | |
| order_index | INT | |

### `learning_modules`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| title | VARCHAR | |
| module_type | ENUM | ModuleType |
| description | TEXT | |

### `milestone_modules`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| milestone_id | BIGINT FK | |
| module_id | BIGINT FK | |
| order_index | INT | |

### `courses`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| title | VARCHAR | |
| description | TEXT | |

---

## Content Tables

### `video_lessons`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| title | VARCHAR | |
| video_url | VARCHAR | Cloudinary URL |
| duration | INT | seconds |
| module_id | BIGINT FK | |

### `video_notes`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT FK | |
| video_lesson_id | BIGINT FK | |
| content | TEXT | |
| timestamp_seconds | INT | |

### `grammars`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| title | VARCHAR | |
| content | TEXT | |
| module_id | BIGINT FK | |

### `flashcard_collections`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| title | VARCHAR | |
| module_id | BIGINT FK | |

### `flashcards`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| collection_id | BIGINT FK | |
| front_text | VARCHAR | |
| back_text | VARCHAR | |

### `vocabularies`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| word | VARCHAR | |
| definition | TEXT | |
| topic_id | BIGINT FK | |

### `vocabulary_topics`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| name | VARCHAR | |

---

## Practice & Test Tables

### `practice_sets`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| title | VARCHAR | |
| module_id | BIGINT FK | |

### `questions`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| content | TEXT | |
| explanation | TEXT | AI-generated |
| audio_url | VARCHAR | |
| image_url | VARCHAR | |

### `question_options`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| question_id | BIGINT FK | |
| option_text | VARCHAR | |
| is_correct | BOOLEAN | |

### `practice_set_questions`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| practice_set_id | BIGINT FK | |
| question_id | BIGINT FK | |
| order_index | INT | |

### `tests`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| title | VARCHAR | |
| duration_minutes | INT | |

### `test_parts`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| test_id | BIGINT FK | |
| part_number | INT | TOEIC part 1-7 |

### `test_part_questions`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| test_part_id | BIGINT FK | |
| question_id | BIGINT FK | |
| order_index | INT | |

---

## User Progress Tables

### `user_learning_paths`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT FK | |
| learning_path_id | BIGINT FK | |
| status | ENUM | ProgressStatus |

### `user_module_progress`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT FK | |
| module_id | BIGINT FK | |
| status | ENUM | ProgressStatus |

### `user_practice_attempts`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT FK | |
| practice_set_id | BIGINT FK | |
| score | INT | |
| status | ENUM | AttemptStatus |

### `user_practice_answers`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| attempt_id | BIGINT FK | |
| question_id | BIGINT FK | |
| selected_option_id | BIGINT FK | |

### `user_test_attempts`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT FK | |
| test_id | BIGINT FK | |
| score | INT | |
| status | ENUM | AttemptStatus |

### `user_test_answers`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| attempt_id | BIGINT FK | |
| question_id | BIGINT FK | |
| selected_option_id | BIGINT FK | |

### `user_video_progress`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT FK | |
| video_lesson_id | BIGINT FK | |
| watched_seconds | INT | |
| completed | BOOLEAN | |

### `user_vocabulary_progress`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT FK | |
| vocabulary_id | BIGINT FK | |
| mastered | BOOLEAN | |

### `user_favorite_grammars`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT PK | |
| user_id | BIGINT FK | |
| grammar_id | BIGINT FK | |
