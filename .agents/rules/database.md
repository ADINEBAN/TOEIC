---
trigger: model_decision
---

# Database Rules (MySQL / JPA / Hibernate)

## 1. Connection
- MySQL runs on port **3307** (non-standard). Schema: `toeic`. User: `root`.
- Never hardcode credentials — use `${SPRING_DATASOURCE_PASSWORD}` or application.yaml references.

## 2. Schema Management
- Hibernate manages the schema via `ddl-auto: update`. **No manual SQL DDL files** exist or should be created.
- Do not write raw `CREATE TABLE` / `ALTER TABLE` statements — define them as JPA entity changes instead.

## 3. Entity Conventions
- All entities must extend `BaseEntity` which provides `createdAt` and `updatedAt` via `@PrePersist` / `@PreUpdate`.
- Entity class: `PascalCase`. Table name annotation: `@Table(name = "plural_snake_case")`.
- Primary keys: `Long id` with `@GeneratedValue(strategy = GenerationType.IDENTITY)`.
- Enum columns: annotate with `@Enumerated(EnumType.STRING)`.

## 4. Relationships
- Prefer `@ManyToOne` with `fetch = FetchType.LAZY` to avoid N+1 queries.
- Use `@OneToMany(mappedBy = ...)` on the inverse side; never use `@OneToMany` without `mappedBy` to prevent join tables.
- Annotate bidirectional relationships consistently to avoid infinite serialization loops — always use `@JsonIgnore` or DTO projection.

## 5. Query Guidelines
- Use Spring Data JPA repository methods or `@Query` JPQL — avoid raw native SQL unless strictly necessary.
- For complex reads, project into DTOs using MapStruct; never expose raw entity graphs to controllers.
