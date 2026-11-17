---
trigger: glob
globs: "**/*.java"
---

# Security Rules (Spring Boot / JWT)

## 1. Authentication Model
- Stateless JWT authentication. Every protected request must carry `Authorization: Bearer <token>`.
- Token validation is handled by `JwtAuthenticationFilter` → `JwtService`. Do not duplicate this logic.
- Logout invalidates the token via `TokenBlacklistService`. Always call it on logout endpoints.

## 2. Authorization
- Use `@PreAuthorize("hasRole('ADMIN')")` on all `/api/admin/**` controller methods.
- Use `@PreAuthorize("hasRole('USER')")` on user-specific endpoints.
- Do not add new public endpoints without explicitly whitelisting them in `SecurityConfig.java`.
- Current public endpoints: `/auth/login`, `/auth/register`, `/users/admin`, `/ws/**`.

## 3. Credential Safety
- **Never hardcode** passwords, JWT secrets, Cloudinary keys, or AI API keys in source code.
- Reference secrets via Spring property placeholders: `${JWT_SECRET}`, `${CLOUDINARY_SECRET}`, etc.
- Passwords must be hashed with BCrypt (`PasswordEncoder` bean). Never store or log plaintext passwords.

## 4. Response Safety
- Never include `passwordHash` or any credential field in API responses or DTOs.
- Use MapStruct DTOs to control exactly which fields are exposed — do not return raw Entity objects from controllers.

## 5. Input Validation
- Validate all incoming request bodies with Bean Validation annotations (`@NotBlank`, `@Size`, `@Email`).
- Reject malformed JWT tokens with `401 Unauthorized` via the global exception handler — do not leak internal errors.

## 6. CORS
- CORS is configured centrally in `CorsConfig.java`. Do not add `@CrossOrigin` annotations on individual controllers.
