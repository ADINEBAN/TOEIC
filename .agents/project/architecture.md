# Architecture Overview

## Backend (Spring Boot)

**Pattern**: Strict layered architecture — `Controller → Service → Repository → Entity`.
- Controllers never access Repositories directly.
- Services hold all business logic.
- Repositories are Spring Data JPA interfaces.
- Entities map to MySQL tables via JPA/Hibernate.

**Key Framework Choices**:
| Concern | Solution |
|---|---|
| Entity-DTO mapping | MapStruct 1.5.5.Final |
| Boilerplate reduction | Lombok |
| HTTP client (outbound) | OkHttp 4.12.0 |
| Auth | Spring Security + stateless JWT |
| Schema management | Hibernate `ddl-auto: update` |
| Real-time | WebSocket (`/ws/**`) |

**API Envelope** — every response:
```json
{
  "code": "SUCCESS_CODE",
  "message": "Human-readable message",
  "status": 200,
  "data": { ... },
  "timestamp": "2024-01-01T00:00:00"
}
```
Built via `ApiResponseUtil.success(data, SuccessCode)` / `ApiResponseUtil.error(errorCode)`.

**Security Flow**:
```
Request → JwtAuthenticationFilter → JwtService (validate) → SecurityContext
Logout  → TokenBlacklistService (invalidate token)
```

**Server**: port `8082`, context-path `/api`.

---

## Frontend (Expo / React Native)

**Routing**: Expo Router file-based (`app/` directory). No direct react-navigation usage.

**Directory responsibilities**:
| Path | Purpose |
|---|---|
| `app/` | Route files (Expo Router) |
| `src/pages/` | Screen components |
| `src/services/` | API client & service layer |
| `src/hooks/` | Custom hooks (`useAuth`, etc.) |
| `src/store/` | Global state |
| `src/types/` | TypeScript type definitions |
| `src/components/` | Reusable UI components |

**Auth**: JWT token stored in device storage, attached via `api.client.ts` interceptor, accessed via `useAuth()` hook.

**Platform notes**:
- Admin panel is **web-only**.
- Video playback: HTML5 `<video>` on web; `expo-video` on native.
- `expo-av` is **removed** (unsupported in SDK 58 Expo Go).

---

## External Services

| Service | Purpose | Config key |
|---|---|---|
| Cloudinary | Video storage & streaming | `CLOUDINARY_*` env vars |
| OpenRouter / GPT-oss-120b | AI question explanation | `OPENROUTER_API_KEY` |
| MySQL | Primary database | port 3307, schema `toeic` |

---

## CORS

Configured in `CorsConfig.java`. Allowed origins include all origins (dev) and production domain `toeic.daovuanh2207.workers.dev`.
