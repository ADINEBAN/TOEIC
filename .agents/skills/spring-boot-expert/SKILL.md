---
name: spring-boot-expert
description: >
  Activate when writing or modifying any Spring Boot code: creating controllers,
  services, repositories, entities, DTOs, security config, exception handlers,
  or JPA relationships. Java 17 + Spring Boot 4.0.5 + MapStruct + Lombok.
---

# Spring Boot Expert Skill

## Responsibilities
- Implement features following the strict `Controller → Service → Repository → Entity` pattern.
- Produce correct DTOs, MapStruct mappers, and `ApiResponse<T>` responses.
- Apply Spring Security (`@PreAuthorize`) correctly on all endpoints.
- Handle exceptions via `AppException` + `GlobalExceptionHandler`.
- Write correct JPA relationships and avoid N+1 query problems.

## Workflow

### 1. Entity Layer
```java
@Entity
@Table(name = "flashcard_collections")   // plural_snake_case
@Data @NoArgsConstructor @AllArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class FlashcardCollection extends BaseEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title;

    @ManyToOne(fetch = FetchType.LAZY)   // always LAZY
    @JoinColumn(name = "module_id")
    private LearningModule module;

    @Enumerated(EnumType.STRING)         // always STRING for enums
    private ProgressStatus status;
}
```
- Always extend `BaseEntity` (provides `createdAt`, `updatedAt`).
- Never put business logic in entities.

### 2. Repository Layer
```java
public interface FlashcardCollectionRepository
        extends JpaRepository<FlashcardCollection, Long> {
    List<FlashcardCollection> findByModuleId(Long moduleId);
    // Use @Query for complex JPQL — avoid native SQL
}
```

### 3. DTO + Mapper Layer
```java
// Request DTO
public record CreateFlashcardCollectionRequest(
    @NotBlank String title,
    @NotNull Long moduleId
) {}

// Response DTO
public record FlashcardCollectionResponse(
    Long id, String title, String moduleTitle,
    LocalDateTime createdAt
) {}

// MapStruct Mapper
@Mapper(componentModel = "spring")
public interface FlashcardCollectionMapper {
    FlashcardCollectionResponse toResponse(FlashcardCollection entity);
    FlashcardCollection toEntity(CreateFlashcardCollectionRequest request);
}
```

### 4. Service Layer
```java
@Service @RequiredArgsConstructor
@Transactional(readOnly = true)         // read-only by default
public class FlashcardCollectionService {
    private final FlashcardCollectionRepository repo;
    private final FlashcardCollectionMapper mapper;

    public List<FlashcardCollectionResponse> getAll() {
        return repo.findAll().stream().map(mapper::toResponse).toList();
    }

    @Transactional                       // write operations override
    public FlashcardCollectionResponse create(CreateFlashcardCollectionRequest req) {
        // validate → map → save → return DTO
        FlashcardCollection entity = mapper.toEntity(req);
        return mapper.toResponse(repo.save(entity));
    }

    // Throw AppException for not-found
    private FlashcardCollection findOrThrow(Long id) {
        return repo.findById(id)
            .orElseThrow(() -> new AppException(ErrorCode.RESOURCE_NOT_FOUND));
    }
}
```

### 5. Controller Layer
```java
@RestController
@RequestMapping("/admin/flashcards")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminFlashcardController {
    private final FlashcardCollectionService service;

    @GetMapping
    public ResponseEntity<ApiResponse<List<FlashcardCollectionResponse>>> getAll() {
        return ResponseEntity.ok(
            ApiResponseUtil.success(service.getAll(), SuccessCode.FETCHED));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<FlashcardCollectionResponse>> create(
            @RequestBody @Valid CreateFlashcardCollectionRequest req) {
        return ResponseEntity.ok(
            ApiResponseUtil.success(service.create(req), SuccessCode.CREATED));
    }
}
```

### 6. Exception Handling
- Throw `AppException(ErrorCode.X)` from services — never from controllers.
- `GlobalExceptionHandler` catches it and returns a proper `ApiResponse`.
- Never let raw exceptions bubble to the HTTP response.

### 7. Security
- Admin routes: `@PreAuthorize("hasRole('ADMIN')")`
- User routes: `@PreAuthorize("hasRole('USER')")`
- New public endpoints must be whitelisted in `SecurityConfig.java`.

## Checklist
- [ ] Entity extends `BaseEntity`, table name `plural_snake_case`
- [ ] All `@ManyToOne` / `@OneToMany` use `FetchType.LAZY`
- [ ] Enum fields annotated with `@Enumerated(EnumType.STRING)`
- [ ] Service is `@Transactional(readOnly = true)` with write methods overriding
- [ ] DTOs used — raw entity never returned from controller
- [ ] MapStruct mapper used for conversion
- [ ] `@Valid` on request body in controller
- [ ] `AppException(ErrorCode.X)` thrown for error cases
- [ ] `@PreAuthorize` present on controller
- [ ] Compile verified: `.\mvnw.cmd compile`

## Common Mistakes to Avoid
- `@Transactional` missing on write operations → data not persisted.
- `FetchType.EAGER` on `@ManyToOne` → N+1 queries.
- Returning `Entity` from controller → exposes `passwordHash` or circular refs.
- Missing `@Valid` → Bean Validation skipped silently.
- Calling `repo` from `Controller` → breaks layering.

## Completion Criteria
- Feature implemented across all 5 layers.
- `.\mvnw.cmd compile` exits with code 0.
- No raw entity in any HTTP response.
