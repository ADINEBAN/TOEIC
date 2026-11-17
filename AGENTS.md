# Project Agent Guide: TOEIC Learning & Preparation System

## 1. Project Overview
A full-stack personalized TOEIC learning platform comprising:
- **Backend**: Spring Boot REST API for authentication, learning roadmap, practice tests, flashcards, video lessons, and AI question explanation.
- **Frontend**: Universal Expo React Native application supporting Mobile (Android/iOS via Expo Go/Dev Client) and Web.
- **Database**: MySQL with JPA/Hibernate schema management.

## 2. Verified Technology Stack
- **Java**: `17` (Oracle JDK / OpenJDK)
- **Spring Boot**: `4.0.5` (`spring-boot-starter-parent`)
- **React Native**: `0.88.1`
- **Expo SDK**: `^58.0.25` (Expo Router `~58.0.31`)
- **React**: `19.3.0`
- **TypeScript**: `~6.0.3`
- **Database**: MySQL on port `3307` (`toeic` schema)
- **External Services**: Cloudinary (video storage), OpenRouter/Gemini (AI explanations)

## 3. Global Coding Principles
- **No Source Code Regression**: Keep edits surgical, targeted, and aligned with existing code conventions.
- **Strict Typing**: No unchecked `any` in TypeScript; full type safety across DTOs and API clients.
- **Single Source of Truth**: MapStruct for entity-DTO mappings in backend; centralized API client in `frontend/src/services/api.client.ts`.
- **Fail Gracefully**: Standardized error envelopes with machine codes (`ErrorCode`) and user-facing messages.

## 4. Architecture Constraints
- **Backend (Layered Architecture)**: `Controller -> Service -> Repository -> Entity`. Controllers must never access Repositories directly.
- **API Envelope**: All responses must use `ApiResponse<T>` (`code`, `message`, `status`, `data`, `timestamp`).
- **Frontend Navigation**: Use `expo-router` file-based routing exclusively. Never use `@react-navigation/native` directly for navigation hooks (`useFocusEffect` must come from `expo-router`).
- **Media**: Do not use deprecated `expo-av`. Use HTML5 `<video>` for web, external browser intent, or `expo-video`.

## 5. Security Principles
- **Stateless Authentication**: JWT bearer tokens (`Authorization: Bearer <token>`) with blacklist invalidation on logout.
- **Role-Based Access Control**: `@PreAuthorize("hasRole('ADMIN')")` for `/api/admin/**`; `@PreAuthorize("hasRole('USER')")` for user-specific data.
- **Credential Safety**: Never hardcode secrets. Passwords must be hashed with BCrypt. Keep Cloudinary and AI keys in environment variables.

## 6. Testing & Quality Requirements
- **Backend**: Validate compilation with `.\mvnw.cmd compile`. Run controller tests with `.\mvnw.cmd test`.
- **Frontend**: Validate TypeScript with `npx tsc --noEmit`. Lint code with `npm run lint`.

## 7. Token Optimization Rules
- **Search Before Reading**: Use grep or ripgrep (`Select-String`) to locate targets before reading entire files.
- **Targeted Reads**: Read only the relevant line ranges rather than entire 800+ line files.
- **Never Inspect Build/Vendor Folders**: Never scan `node_modules`, `backend/target`, or `.git`.
- **Concise Reporting**: Focus responses on operational changes, file paths, and exact verification commands.
