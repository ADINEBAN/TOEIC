---
name: codebase-explorer
description: >
  Activate when you need to locate existing code before writing new code —
  finding a service class, understanding how an entity is used, tracing a data
  flow, or discovering what already exists before implementing anything new.
---

# Codebase Explorer Skill

## Responsibilities
- Locate existing implementations before creating new ones (avoid duplication).
- Trace a feature end-to-end: entity → repository → service → controller → frontend screen.
- Identify which files must be changed for a given task.
- Provide a concise map of relevant files so the engineer can start immediately.

## Workflow

### 1. Start with Search — Never Read Blindly
```powershell
# Find a class by name
Select-String -Path "backend\src\**\*.java" -Pattern "class UserService" -Recurse

# Find where an entity field is used
Select-String -Path "backend\src\**\*.java" -Pattern "flashcardCollection" -Recurse

# Find a frontend screen
Get-ChildItem -Path "frontend\src\pages" -Recurse -Filter "*.tsx"

# Find a service method in frontend
Select-String -Path "frontend\src\services\**\*.ts" -Pattern "getPracticeSet" -Recurse
```

### 2. Read Only the Relevant Range
- Once a file is located, read only the method or class block needed (20–60 lines).
- Never read an entire 500-line file when searching for one method.

### 3. Trace a Feature
For a backend feature, trace in this order:
1. `entity/` — find the JPA entity and its fields.
2. `repository/` — find the repository interface and custom queries.
3. `service/` — find the business logic and transactions.
4. `controller/` — find the route mapping and DTO usage.
5. `dto/` + `mapper/` — find the data transformation.

For a frontend feature, trace in this order:
1. `app/` — find the route/screen entry point.
2. `src/pages/` — find the screen component.
3. `src/services/` — find the API call.
4. `src/types/` — find the TypeScript interface.
5. `src/hooks/` — find shared state or auth usage.

### 4. Report the Map
Report back as a concise file list:
```
Entity:     backend/.../entity/Flashcard.java          L1-45
Repository: backend/.../repository/FlashcardRepository.java
Service:    backend/.../service/FlashcardService.java  L23-67
Controller: backend/.../controller/AdminFlashcardController.java
DTO:        backend/.../dto/FlashcardResponse.java
Screen:     frontend/src/pages/user/FlashcardScreen.tsx
Service:    frontend/src/services/flashcard.service.ts
```

## Checklist
- [ ] Used `Select-String` / `Get-ChildItem` before opening any file
- [ ] Read only targeted line ranges
- [ ] Did not scan `node_modules/`, `backend/target/`, `.git/`
- [ ] Identified all layers that need changes for the task
- [ ] Reported a concise file map

## Common Mistakes to Avoid
- Reading full files to find one method.
- Assuming a class name without searching first.
- Forgetting to check the frontend types when a backend DTO changes.
- Scanning `target/` or `node_modules/` (always excluded).

## Completion Criteria
- All relevant files for the task are identified.
- A concise file map is produced.
- No redundant file reads were performed.
