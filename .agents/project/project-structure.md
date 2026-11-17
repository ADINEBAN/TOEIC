# Project Structure

## Root
```
TOEIC/
├── AGENTS.md                   # AI agent config (root)
├── .agents/                    # AI coding foundation
│   ├── rules/                  # Antigravity rules
│   ├── project/                # Project documentation
│   ├── skills/                 # Custom skills
│   └── agents/                 # Custom agent definitions
├── backend/                    # Spring Boot API
└── frontend/                   # Expo React Native app
```

## Backend (`backend/src/main/java/org/example/backend/`)
```
backend/
├── pom.xml                     # Maven — Spring Boot 4.0.5, Java 17
└── src/main/
    ├── java/org/example/backend/
    │   ├── controller/
    │   │   ├── AuthController.java
    │   │   ├── AdminLearningPathController.java
    │   │   ├── AdminMilestoneController.java
    │   │   ├── AdminModuleController.java
    │   │   ├── AdminVideoLessonController.java
    │   │   ├── AdminFlashcardController.java
    │   │   ├── AdminGrammarController.java
    │   │   ├── AdminPracticeSetController.java
    │   │   ├── AdminQuestionController.java
    │   │   ├── AdminTestController.java
    │   │   ├── AdminPermissionController.java
    │   │   ├── UserController.java
    │   │   ├── UserFlashcardController.java
    │   │   ├── UserGrammarController.java
    │   │   ├── UserLearningController.java
    │   │   ├── UserVideoLessonController.java
    │   │   ├── UserPracticeSetController.java
    │   │   ├── UserTestController.java
    │   │   └── PlacementOnboardingController.java
    │   ├── service/             # Business logic layer
    │   ├── repository/          # Spring Data JPA repositories
    │   ├── entity/              # 31 JPA entities (extend BaseEntity)
    │   ├── dto/                 # Request/Response DTOs
    │   ├── mapper/              # MapStruct mappers
    │   ├── security/
    │   │   ├── JwtAuthenticationFilter.java
    │   │   ├── JwtService.java
    │   │   ├── TokenBlacklistService.java
    │   │   ├── CustomUserDetailsService.java
    │   │   └── UserPrincipal.java
    │   ├── config/
    │   │   ├── SecurityConfig.java
    │   │   └── CorsConfig.java
    │   ├── enums/
    │   │   ├── UserRole.java        (USER, ADMIN)
    │   │   ├── ModuleType.java
    │   │   ├── ProgressStatus.java
    │   │   ├── AttemptStatus.java
    │   │   ├── ErrorCode.java
    │   │   └── SuccessCode.java
    │   ├── exception/
    │   │   ├── AppException.java
    │   │   └── GlobalExceptionHandler.java
    │   └── util/
    │       └── ApiResponseUtil.java
    └── resources/
        └── application.yaml     # DB, JWT, Cloudinary, AI config
```

## Frontend (`frontend/`)
```
frontend/
├── package.json                # Expo 58, RN 0.88.1, React 19, TS ~6.0.3
├── app.json
├── metro.config.js
├── tsconfig.json
├── app/                        # Expo Router file-based routes
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── (auth)/                 # Login / Register screens
│   ├── admin/                  # Admin panel (web-only)
│   └── user/
│       └── (tabs)/             # Bottom tab navigator screens
└── src/
    ├── pages/                  # Screen component implementations
    ├── services/
    │   ├── api.client.ts       # Centralized Axios/fetch client
    │   └── *.service.ts        # Domain service files
    ├── components/             # Reusable UI components
    ├── hooks/
    │   └── use-auth.ts         # Auth state hook
    ├── store/                  # Global state management
    ├── types/                  # TypeScript interfaces & types
    ├── utils/                  # Utility functions
    ├── config/                 # App-level config (API base URL, etc.)
    └── assets/                 # Images, fonts
```
