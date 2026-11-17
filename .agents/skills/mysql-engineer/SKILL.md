---
name: mysql-engineer
description: >
  Activate when working on database schema design, JPA entity relationships,
  query optimization, index design, or diagnosing slow queries. MySQL 8+ on
  port 3307, schema `toeic`, managed via Hibernate ddl-auto update.
---

# MySQL Engineer Skill

## Responsibilities
- Design correct JPA entity mappings that produce efficient MySQL schema.
- Choose appropriate relationship types and fetch strategies.
- Design indexes for query-heavy columns.
- Identify and fix N+1 query problems.
- Advise on transaction boundaries for data consistency.

## Workflow

### 1. Schema Design via JPA Entity
Since no SQL migration files exist (Hibernate manages schema automatically):
- All schema changes are made by modifying `Entity` classes.
- Always extend `BaseEntity` for `created_at` / `updated_at`.

```java
@Entity
@Table(name = "vocabulary_topics",           // plural_snake_case
    indexes = {
        @Index(name = "idx_topic_name", columnList = "name")  // add indexes here
    }
)
@Data @NoArgsConstructor
public class VocabularyTopic extends BaseEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 100)
    private String name;
}
```

### 2. Relationships

**Many-to-One (most common)**:
```java
@ManyToOne(fetch = FetchType.LAZY)      // ALWAYS lazy
@JoinColumn(name = "topic_id", nullable = false)
private VocabularyTopic topic;
```

**One-to-Many (inverse side only)**:
```java
@OneToMany(mappedBy = "topic", cascade = CascadeType.ALL, orphanRemoval = true)
@JsonIgnore                              // prevent circular serialization
private List<Vocabulary> vocabularies = new ArrayList<>();
```

**Many-to-Many (use a join entity, not `@ManyToMany`)**:
- Use an explicit join entity like `PracticeSetQuestion` with its own `id` and `order_index`.
- Avoids Hibernate's default join table which cannot have extra columns.

### 3. Index Strategy
Add `@Index` for columns that appear in:
- `WHERE` clauses (e.g., `user_id`, `practice_set_id`)
- `ORDER BY` clauses (`created_at` — already in BaseEntity)
- Foreign keys (Hibernate does NOT auto-create FK indexes in all dialects)

```java
@Table(name = "user_practice_attempts",
    indexes = {
        @Index(name = "idx_upa_user", columnList = "user_id"),
        @Index(name = "idx_upa_set",  columnList = "practice_set_id")
    }
)
```

### 4. Avoid N+1 Queries
Symptom: a list of 50 entities generates 51 SQL queries.

Fix with `JOIN FETCH` in JPQL:
```java
@Query("SELECT p FROM PracticeSet p JOIN FETCH p.module WHERE p.module.id = :moduleId")
List<PracticeSet> findByModuleIdWithModule(@Param("moduleId") Long moduleId);
```

Or use `@EntityGraph`:
```java
@EntityGraph(attributePaths = {"module"})
List<PracticeSet> findAll();
```

### 5. Transaction Guidelines
- Service class: `@Transactional(readOnly = true)` by default.
- Write methods: `@Transactional` (overrides readOnly).
- Never span a transaction across HTTP requests.
- For bulk operations, flush and clear the EntityManager in batches.

### 6. Enum Columns
```java
@Enumerated(EnumType.STRING)   // always STRING — avoids ordinal fragility
@Column(nullable = false)
private ProgressStatus status;
```

## Checklist
- [ ] Entity table name is `plural_snake_case`
- [ ] Entity extends `BaseEntity`
- [ ] All `@ManyToOne` use `FetchType.LAZY`
- [ ] `@OneToMany` has `mappedBy` (no unidirectional one-to-many)
- [ ] Enum fields use `EnumType.STRING`
- [ ] Indexes added for FK columns and filter columns
- [ ] No `@ManyToMany` annotation — use join entities instead
- [ ] `@JsonIgnore` on inverse `@OneToMany` to prevent circular refs
- [ ] `@Transactional(readOnly = true)` on service class

## Common Mistakes to Avoid
- `FetchType.EAGER` → Hibernate loads all children for every parent.
- Missing `mappedBy` on `@OneToMany` → Hibernate creates an extra join table.
- `EnumType.ORDINAL` → Adding a new enum value in the middle breaks all existing data.
- No indexes on `user_id` FK → full table scan on every user query.
- `@ManyToMany` annotation → cannot add extra columns (like `order_index`) to the join table.

## Completion Criteria
- Schema change expressed as a JPA entity modification (no raw DDL).
- Relationships use correct fetch types and `mappedBy`.
- N+1 queries addressed if identified.
- `.\mvnw.cmd compile` passes.
