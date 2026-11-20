package org.example.backend.controller;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.CreateVideoNoteRequest;
import org.example.backend.dto.request.UpdateLessonProgressRequest;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.LessonProgressUpdateResponse;
import org.example.backend.dto.response.UserLessonResponse;
import org.example.backend.dto.response.VideoNoteResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.UserLessonService;
import org.example.backend.service.UserProgressService;
import org.example.backend.service.VideoNoteService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/users/lessons")
@RequiredArgsConstructor
public class UserLessonController {

    private final UserLessonService userLessonService;
    private final UserProgressService userProgressService;
    private final VideoNoteService videoNoteService;

    @GetMapping
    @PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
    public ResponseEntity<ApiResponse<List<UserLessonResponse>>> getLessons(
            Authentication authentication,
            @RequestParam(required = false) Long moduleId
    ) {
        List<UserLessonResponse> response = userLessonService.getLessonsForUser(authentication.getName(), moduleId);
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_LESSON_LISTED);
    }

    @PostMapping("/{lessonId}/progress")
    @PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
    public ResponseEntity<ApiResponse<LessonProgressUpdateResponse>> updateLessonProgress(
            Authentication authentication,
            @PathVariable Long lessonId,
            @RequestBody(required = false) UpdateLessonProgressRequest request
    ) {
        LessonProgressUpdateResponse response = userProgressService.updateLessonProgress(
                authentication.getName(),
                lessonId,
                request
        );
        return ApiResponseUtil.success(response, SuccessCode.USER_LESSON_PROGRESS_UPDATED);
    }

    @GetMapping("/{lessonId}/notes")
    @PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
    public ResponseEntity<ApiResponse<List<VideoNoteResponse>>> getNotesForLesson(
            Authentication authentication,
            @PathVariable Long lessonId
    ) {
        return ApiResponseUtil.success(
                videoNoteService.getNotesForLesson(authentication.getName(), lessonId),
                SuccessCode.VIDEO_NOTE_LISTED
        );
    }

    @GetMapping("/notes/mine")
    @PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
    public ResponseEntity<ApiResponse<List<VideoNoteResponse>>> getMyNotes(Authentication authentication) {
        return ApiResponseUtil.success(
                videoNoteService.getMyNotes(authentication.getName()),
                SuccessCode.VIDEO_NOTE_LISTED
        );
    }

    @PostMapping("/{lessonId}/notes")
    @PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
    public ResponseEntity<ApiResponse<VideoNoteResponse>> createNote(
            Authentication authentication,
            @PathVariable Long lessonId,
            @RequestBody CreateVideoNoteRequest request
    ) {
        return ApiResponseUtil.success(
                videoNoteService.createNote(authentication.getName(), lessonId, request),
                SuccessCode.VIDEO_NOTE_CREATED
        );
    }

    @DeleteMapping("/notes/{noteId}")
    @PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
    public ResponseEntity<ApiResponse<Void>> deleteNote(
            Authentication authentication,
            @PathVariable Long noteId
    ) {
        videoNoteService.deleteNote(authentication.getName(), noteId);
        return ApiResponseUtil.success(SuccessCode.VIDEO_NOTE_DELETED);
    }
}
