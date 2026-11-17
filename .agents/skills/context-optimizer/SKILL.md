---
name: context-optimizer
description: >
  Activate when context usage is high, the conversation is getting long, or
  when deciding how to read the codebase efficiently. Governs how to search,
  read, and report without wasting tokens or making redundant tool calls.
---

# Context Optimizer Skill

## Responsibilities
- Enforce search-before-read discipline to minimize unnecessary file loads.
- Keep responses focused on changes, paths, and verification commands.
- Avoid re-summarizing context already established in the conversation.
- Identify when a task is complete and stop early instead of doing extra work.

## Workflow

### 1. Search First — Always
Before reading any file, run a targeted search:
```powershell
# Locate a Java class
Select-String -Path "backend\src\**\*.java" -Pattern "class FlashcardService" -Recurse

# Locate a TypeScript type
Select-String -Path "frontend\src\**\*.ts","frontend\src\**\*.tsx" -Pattern "FlashcardResponse" -Recurse

# Locate a route
Select-String -Path "backend\src\**\*.java" -Pattern "@RequestMapping" -Recurse
```

### 2. Read Only What You Need
- Use `StartLine` and `EndLine` when reading. Max 80 lines per read unless full context is essential.
- If you need one method from a 400-line service, search for the method name first, then read ±20 lines.

### 3. Never Scan These Directories
```
node_modules/
backend/target/
.git/
frontend/.expo/
frontend/dist/
```

### 4. Avoid Redundant Tool Calls
- Do not re-read a file you read two steps ago — reference what you already know.
- Do not re-run `mvnw compile` if no Java files changed since the last run.
- Do not re-run `tsc --noEmit` if no TypeScript files changed.

### 5. Report Concisely
Structure every response as:
```
## What Changed
- `path/to/file.java` — added X, modified Y

## Verification
.\mvnw.cmd compile
```
Skip:
- Architecture re-summaries the user already knows.
- File contents that weren't changed.
- Boilerplate explanations of Spring Boot or React Native.

### 6. Know When to Stop
- If a task is done and verified, say so and stop.
- Do not perform "extra" improvements not requested.
- Do not read additional files "just in case".

## Checklist
- [ ] Searched before reading
- [ ] Used `StartLine`/`EndLine` on reads
- [ ] Skipped `node_modules/`, `target/`, `.git/`
- [ ] No redundant compile/type-check runs
- [ ] Response contains only: changes, file paths, verification command
- [ ] Did not re-explain established context

## Common Mistakes to Avoid
- Opening a full 600-line entity file to read one field.
- Running `mvnw compile` after every single file edit instead of batching.
- Re-explaining what `ApiResponse<T>` is in every response.
- Reading `package.json` every session even though the stack doesn't change.

## Completion Criteria
- Task complete with minimal tool calls.
- Response is under 400 words unless complexity demands more.
- No redundant reads or commands were issued.
