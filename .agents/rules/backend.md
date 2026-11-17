---
trigger: glob
globs: "**/*.java, **/pom.xml"
---

# Backend Rules (Spring Boot & Java 17)

## 1. Architecture & Layering
- **Strict Layered Pattern**: `Controller -> Service -> Repository -> Entity`.
  - Controllers handle HTTP routing, DTO validation, and response wrapping via `ApiResponseUtil`. Controllers must **never** call Repositories directly.
  - Services encapsulate business logic and transactions (`@Transactional`).
  - Repositories interface with MySQL via Spring Data JPA.
- **Single Source of Truth**: Use MapStruct (`org.mapstruct`) for entity-to-DTO and DTO-to-entity mapping. Do not write manual mapping boilerplate in controllers.

## 2. API Responses & Error Handling
- **Unified Envelope**: All controller endpoints must return `ResponseEntity<ApiResponse<T>>`.
- **Custom Exceptions**: Throw `AppException(ErrorCode.<CODE>)` for domain and validation failures.
- **Global Handling**: Handled centrally in `GlobalExceptionHandler`. Never use generic catch-all blocks that swallow exceptions.

## 3. Annotations & Conventions
- **Lombok**: Use `@Getter`, `@Setter`, `@NoArgsConstructor`, `@AllArgsConstructor`, and `@RequiredArgsConstructor` (prefer constructor injection over `@Autowired`).
- **REST Endpoints**:
  - Auth endpoints: `/api/auth/**`
  - Admin endpoints: `/api/admin/**` (secured by `@PreAuthorize("hasRole('ADMIN')")`)
  - User endpoints: `/api/users/**` (secured by `@PreAuthorize("hasRole('USER')")`)
- **Validation**: Compile changes with `.\mvnw.cmd compile` before finishing tasks.
