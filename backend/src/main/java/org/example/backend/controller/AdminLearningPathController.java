package org.example.backend.controller;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.CreateLearningPathRequest;
import org.example.backend.dto.request.UpdateLearningPathRequest;
import org.example.backend.dto.response.AdminLearningPathOverviewResponse;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.LearningPathResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.AdminLearningPathService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/admin/learning-paths")
@RequiredArgsConstructor
public class AdminLearningPathController {

    private final AdminLearningPathService adminLearningPathService;

    @GetMapping("/overview")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<List<AdminLearningPathOverviewResponse>>> getLearningPathOverviewTree() {
        List<AdminLearningPathOverviewResponse> response = adminLearningPathService.getLearningPathOverviewTree();
        return ApiResponseUtil.success(response, SuccessCode.LEARNING_PATH_LISTED);
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<LearningPathResponse>> createLearningPath(
            @RequestBody CreateLearningPathRequest request
    ) {
        LearningPathResponse response = adminLearningPathService.createLearningPath(request);
        return ApiResponseUtil.success(response, SuccessCode.LEARNING_PATH_CREATED);
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'CONTENT_MANAGER', 'USER')")
    public ResponseEntity<ApiResponse<List<LearningPathResponse>>> getAllLearningPaths() {
        List<LearningPathResponse> response = adminLearningPathService.getAllLearningPaths();
        return ApiResponseUtil.success(response, SuccessCode.LEARNING_PATH_LISTED);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'CONTENT_MANAGER', 'USER')")
    public ResponseEntity<ApiResponse<LearningPathResponse>> getLearningPathById(@PathVariable Long id) {
        LearningPathResponse response = adminLearningPathService.getLearningPathById(id);
        return ApiResponseUtil.success(response, SuccessCode.LEARNING_PATH_GET);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<LearningPathResponse>> updateLearningPath(
            @PathVariable Long id,
            @RequestBody UpdateLearningPathRequest request
    ) {
        LearningPathResponse response = adminLearningPathService.updateLearningPath(id, request);
        return ApiResponseUtil.success(response, SuccessCode.LEARNING_PATH_UPDATED);
    }

    @DeleteMapping("/deactive/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> deactivateLearningPath(@PathVariable Long id) {
        adminLearningPathService.deactivateLearningPath(id);
        return ApiResponseUtil.success(SuccessCode.LEARNING_PATH_DEACTIVATED);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> deleteLearningPath(@PathVariable Long id) {
        adminLearningPathService.deleteLearningPath(id);
        return ApiResponseUtil.success(SuccessCode.LEARNING_PATH_DELETED);
    }
}
