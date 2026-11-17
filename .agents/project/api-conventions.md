# API Conventions

## Base URL
```
http://<host>:8082/api
```

## Response Envelope
Every endpoint — success or error — returns `ApiResponse<T>`:
```json
{
  "code": "STRING_CODE",
  "message": "Human-readable message",
  "status": 200,
  "data": { ... },
  "timestamp": "2024-01-01T00:00:00"
}
```
Built via:
- `ApiResponseUtil.success(data, SuccessCode.SOME_CODE)` → HTTP 200
- `ApiResponseUtil.error(ErrorCode.SOME_ERROR)` → appropriate HTTP status from enum

## Authentication
- All protected endpoints: `Authorization: Bearer <jwt_token>` header.
- Public (no auth): `POST /auth/login`, `POST /auth/register`, `POST /users/admin`, WebSocket `/ws/**`.

## Route Prefixes

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | Login, returns JWT |
| POST | `/auth/register` | Register new user |
| POST | `/auth/logout` | Invalidate JWT (blacklist) |

### User endpoints (`/users/**`) — requires `ROLE_USER`
| Prefix | Controller |
|---|---|
| `/users` | UserController — profile, password |
| `/users/flashcards` | UserFlashcardController |
| `/users/grammars` | UserGrammarController |
| `/users/learning` | UserLearningController — paths, modules, progress |
| `/users/lessons` | UserVideoLessonController |
| `/users/practice-sets` | UserPracticeSetController |
| `/users/tests` | UserTestController |

### Admin endpoints (`/admin/**`) — requires `ROLE_ADMIN`
| Prefix | Controller |
|---|---|
| `/admin/learning-paths` | AdminLearningPathController |
| `/admin/learning-paths/{id}/milestones` | AdminMilestoneController |
| `/admin/milestones/{id}/modules` | AdminModuleController |
| `/admin/learning-modules` | AdminModuleController |
| `/admin/video-lessons` | AdminVideoLessonController |
| `/admin/flashcards` | AdminFlashcardController |
| `/admin/grammars` | AdminGrammarController |
| `/admin/practice-sets` | AdminPracticeSetController |
| `/admin/questions` | AdminQuestionController |
| `/admin/tests` | AdminTestController |
| `/admin/permissions` | AdminPermissionController |

### Other
| Path | Description |
|---|---|
| `/placement-onboarding` | Placement test + onboarding flow |
| `/ws/**` | WebSocket (public) |

## Controller Pattern
```java
@RestController
@RequestMapping("/admin/learning-paths")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminLearningPathController {

    private final LearningPathService learningPathService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<LearningPathResponse>>> getAll() {
        return ResponseEntity.ok(
            ApiResponseUtil.success(learningPathService.getAll(), SuccessCode.FETCHED)
        );
    }
}
```

## Error Handling
- `AppException` → caught by `GlobalExceptionHandler` → returns `ApiResponse` with `ErrorCode`.
- `MaxUploadSizeExceededException` → handled globally for file uploads.
- Never return raw Java exceptions to the client.

## Pagination
- Use Spring Pageable where lists are large. Return `Page<DTO>` projected via MapStruct.
