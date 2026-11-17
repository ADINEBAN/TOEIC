---
name: api-engineer
description: >
  Activate when designing or implementing REST API endpoints: defining routes,
  request/response shapes, error codes, auth guards, pagination, or when
  reviewing API contracts for consistency with the existing envelope standard.
---

# API Engineer Skill

## Responsibilities
- Design RESTful endpoints that follow the project's existing route prefixes.
- Ensure all responses use the `ApiResponse<T>` envelope.
- Define and register `SuccessCode` and `ErrorCode` enum values.
- Apply correct `@PreAuthorize` guards.
- Design clean, typed request/response DTOs with Bean Validation.

## Workflow

### 1. Choose the Route
Match the route to the correct prefix (never invent new top-level prefixes):

| Prefix | Scope | Auth |
|---|---|---|
| `/auth/**` | Login, Register, Logout | Public |
| `/users/**` | User profile + resources | `ROLE_USER` |
| `/admin/**` | Admin management | `ROLE_ADMIN` |
| `/placement-onboarding` | Onboarding flow | Authenticated |

### 2. Define DTOs
```java
// Request — use records for immutability
public record CreatePracticeSetRequest(
    @NotBlank @Size(max = 200) String title,
    @NotNull Long moduleId
) {}

// Response — expose only safe fields
public record PracticeSetResponse(
    Long id,
    String title,
    String moduleTitle,
    int questionCount,
    LocalDateTime createdAt
) {}
```

### 3. Define Codes
Add to `SuccessCode` enum:
```java
PRACTICE_SET_CREATED("Practice set created successfully"),
PRACTICE_SET_FETCHED("Practice set retrieved");
```
Add to `ErrorCode` enum:
```java
PRACTICE_SET_NOT_FOUND(HttpStatus.NOT_FOUND, "Practice set not found"),
DUPLICATE_PRACTICE_SET(HttpStatus.CONFLICT, "Practice set title already exists");
```

### 4. Controller Pattern
```java
@PostMapping
public ResponseEntity<ApiResponse<PracticeSetResponse>> create(
        @RequestBody @Valid CreatePracticeSetRequest req) {
    return ResponseEntity.ok(
        ApiResponseUtil.success(service.create(req), SuccessCode.PRACTICE_SET_CREATED));
}

@GetMapping("/{id}")
public ResponseEntity<ApiResponse<PracticeSetResponse>> getById(@PathVariable Long id) {
    return ResponseEntity.ok(
        ApiResponseUtil.success(service.getById(id), SuccessCode.PRACTICE_SET_FETCHED));
}
```

### 5. Pagination (for list endpoints)
```java
@GetMapping
public ResponseEntity<ApiResponse<Page<PracticeSetResponse>>> getAll(
        @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC)
        Pageable pageable) {
    return ResponseEntity.ok(
        ApiResponseUtil.success(service.getAll(pageable), SuccessCode.PRACTICE_SET_FETCHED));
}
```

### 6. Error Responses
All errors flow through `AppException` → `GlobalExceptionHandler`:
```json
{
  "code": "PRACTICE_SET_NOT_FOUND",
  "message": "Practice set not found",
  "status": 404,
  "data": null,
  "timestamp": "2024-01-01T00:00:00"
}
```

## Checklist
- [ ] Route under correct prefix (`/admin/`, `/users/`, `/auth/`)
- [ ] Request DTO uses `@NotBlank`, `@NotNull`, `@Size` as needed
- [ ] Response DTO excludes sensitive fields
- [ ] `SuccessCode` added for each operation
- [ ] `ErrorCode` added for each failure case
- [ ] `@Valid` on `@RequestBody` in controller
- [ ] `@PreAuthorize` matches route scope
- [ ] Pageable used for list endpoints returning many items
- [ ] `ApiResponseUtil.success(...)` used — no raw `ResponseEntity` data

## Common Mistakes to Avoid
- Returning HTTP 200 for creation — use `ResponseEntity.status(201).body(...)` if semantics matter.
- Missing `ErrorCode` for foreseeable failure cases (not found, duplicate, forbidden).
- Skipping `@Valid` — validation annotations silently ignored.
- Leaking internal field names (e.g., `passwordHash`) in response DTOs.

## Completion Criteria
- Endpoint returns the correct `ApiResponse<T>` envelope.
- All failure paths throw `AppException` with a registered `ErrorCode`.
- `.\mvnw.cmd compile` passes.
- API contract matches the TypeScript type on the frontend.
