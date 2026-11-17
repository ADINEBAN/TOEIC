---
trigger: always_on
---

# Token Optimization Rules

## 1. Search Before Reading
- Use `Select-String` (PowerShell) or `grep` / `rg` to locate the exact file and line range before reading.
- Example: `Select-String -Path "backend\src\**\*.java" -Pattern "class UserService" -Recurse`
- Never open an entire large file when only a specific method or block is needed.

## 2. Targeted File Reads
- Always specify `StartLine` and `EndLine` when reading files. Avoid reading more than 100 lines at a time unless the full file is required.
- Never read `node_modules/`, `backend/target/`, or `.git/` directories.

## 3. Concise Reporting
- Responses should focus on: **what changed**, **which files**, and **how to verify**.
- Do not repeat context already established in the conversation.
- Do not re-summarize unchanged boilerplate or existing architecture unless explicitly asked.

## 4. Lazy Documentation Loading
- Load files from `.agents/project/` only when the specific domain is relevant to the current task.
- Do not preload all documentation at the start of every task.

## 5. Avoid Redundant Verification
- Run `.\mvnw.cmd compile` only after Java source changes.
- Run `npx tsc --noEmit` only after TypeScript source changes.
- Do not run both suites for every task regardless of which layer was modified.

## 6. Batch File Operations
- When creating multiple related files, write them in parallel rather than sequentially.
- Combine grep + read steps: search first, then read only the matched file at the matched line range.
