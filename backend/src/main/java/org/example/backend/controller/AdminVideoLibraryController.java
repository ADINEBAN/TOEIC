package org.example.backend.controller;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.AdminSubtitleUpdateRequest;
import org.example.backend.dto.request.AdminVideoUpdateRequest;
import org.example.backend.dto.request.VideoImportRequest;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.ImportedVideoDetailResponse;
import org.example.backend.dto.response.VideoProcessingJobResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.VideoLearningService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/admin/videos")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('ADMIN', 'CONTENT_MANAGER')")
public class AdminVideoLibraryController {

    private final VideoLearningService videoLearningService;

    @PostMapping("/import")
    public ResponseEntity<ApiResponse<ImportedVideoDetailResponse>> importVideo(
            Authentication authentication,
            @RequestBody VideoImportRequest request
    ) {
        ImportedVideoDetailResponse response = videoLearningService.importVideo(authentication.getName(), request);
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_IMPORT_STARTED);
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<ImportedVideoDetailResponse>>> listVideos(
            Authentication authentication,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String search
    ) {
        List<ImportedVideoDetailResponse> response = videoLearningService.listAdminVideos(
                authentication.getName(), status, search
        );
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_LIBRARY_LISTED);
    }

    @GetMapping("/{videoId}")
    public ResponseEntity<ApiResponse<ImportedVideoDetailResponse>> getVideoDetail(
            Authentication authentication,
            @PathVariable Long videoId
    ) {
        ImportedVideoDetailResponse response = videoLearningService.getAdminVideoDetail(authentication.getName(), videoId);
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_LIBRARY_LISTED);
    }

    @PutMapping("/{videoId}")
    public ResponseEntity<ApiResponse<ImportedVideoDetailResponse>> updateVideoMetadata(
            Authentication authentication,
            @PathVariable Long videoId,
            @RequestBody AdminVideoUpdateRequest request
    ) {
        ImportedVideoDetailResponse response = videoLearningService.updateVideoMetadata(
                authentication.getName(), videoId, request
        );
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_UPDATED);
    }

    @PutMapping("/{videoId}/subtitles")
    public ResponseEntity<ApiResponse<ImportedVideoDetailResponse>> updateSubtitles(
            Authentication authentication,
            @PathVariable Long videoId,
            @RequestBody AdminSubtitleUpdateRequest request
    ) {
        ImportedVideoDetailResponse response = videoLearningService.updateSubtitles(
                authentication.getName(), videoId, request
        );
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_SUBTITLES_UPDATED);
    }

    @PutMapping("/{videoId}/subtitles/{segmentId}")
    public ResponseEntity<ApiResponse<ImportedVideoDetailResponse>> updateSingleSegment(
            Authentication authentication,
            @PathVariable Long videoId,
            @PathVariable Long segmentId,
            @RequestBody AdminSubtitleUpdateRequest.SegmentUpdateItem request
    ) {
        ImportedVideoDetailResponse response = videoLearningService.updateSingleSubtitleSegment(
                authentication.getName(), videoId, segmentId, request
        );
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_SUBTITLES_UPDATED);
    }

    @PostMapping("/{videoId}/publish")
    public ResponseEntity<ApiResponse<ImportedVideoDetailResponse>> publishVideo(
            Authentication authentication,
            @PathVariable Long videoId
    ) {
        ImportedVideoDetailResponse response = videoLearningService.publishVideo(authentication.getName(), videoId);
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_PUBLISHED);
    }

    @PostMapping("/{videoId}/unpublish")
    public ResponseEntity<ApiResponse<ImportedVideoDetailResponse>> unpublishVideo(
            Authentication authentication,
            @PathVariable Long videoId
    ) {
        ImportedVideoDetailResponse response = videoLearningService.unpublishVideo(authentication.getName(), videoId);
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_UNPUBLISHED);
    }

    @PostMapping("/{videoId}/archive")
    public ResponseEntity<ApiResponse<ImportedVideoDetailResponse>> archiveVideo(
            Authentication authentication,
            @PathVariable Long videoId
    ) {
        ImportedVideoDetailResponse response = videoLearningService.archiveVideo(authentication.getName(), videoId);
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_ARCHIVED);
    }

    @PostMapping("/{videoId}/ai-summarize")
    public ResponseEntity<ApiResponse<ImportedVideoDetailResponse>> aiSummarizeVideo(
            Authentication authentication,
            @PathVariable Long videoId,
            @RequestParam(defaultValue = "false") boolean overwriteAll
    ) {
        ImportedVideoDetailResponse response = videoLearningService.aiSummarizeVideoMetadata(
                authentication.getName(), videoId, overwriteAll
        );
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_UPDATED);
    }

    @DeleteMapping("/{videoId}")
    public ResponseEntity<ApiResponse<Void>> deleteVideo(
            Authentication authentication,
            @PathVariable Long videoId
    ) {
        videoLearningService.deleteVideo(authentication.getName(), videoId);
        return ApiResponseUtil.success(SuccessCode.VIDEO_DELETED);
    }

    @GetMapping("/jobs/{jobId}")
    public ResponseEntity<ApiResponse<VideoProcessingJobResponse>> getJobStatus(
            Authentication authentication,
            @PathVariable Long jobId
    ) {
        VideoProcessingJobResponse response = videoLearningService.getJobStatus(authentication.getName(), jobId);
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_JOB_RETRIEVED);
    }

    @PostMapping("/jobs/{jobId}/cancel")
    public ResponseEntity<ApiResponse<VideoProcessingJobResponse>> cancelJob(
            Authentication authentication,
            @PathVariable Long jobId
    ) {
        VideoProcessingJobResponse response = videoLearningService.cancelJob(authentication.getName(), jobId);
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_JOB_RETRIEVED);
    }

    @PostMapping("/jobs/{jobId}/retry")
    public ResponseEntity<ApiResponse<VideoProcessingJobResponse>> retryJob(
            Authentication authentication,
            @PathVariable Long jobId
    ) {
        VideoProcessingJobResponse response = videoLearningService.retryJob(authentication.getName(), jobId);
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_JOB_RETRIEVED);
    }

    @GetMapping("/{videoId}/subtitles/export")
    public ResponseEntity<byte[]> exportSubtitles(
            Authentication authentication,
            @PathVariable Long videoId,
            @RequestParam(defaultValue = "srt_bilingual") String format
    ) {
        String content = videoLearningService.exportSubtitles(authentication.getName(), videoId, format);
        String ext = switch (format.toLowerCase()) {
            case "vtt", "webvtt" -> "vtt";
            case "json" -> "json";
            default -> "srt";
        };
        MediaType mediaType = switch (ext) {
            case "vtt" -> MediaType.parseMediaType("text/vtt; charset=utf-8");
            case "json" -> MediaType.parseMediaType("application/json; charset=utf-8");
            default -> MediaType.parseMediaType("text/plain; charset=utf-8");
        };
        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"subtitles_" + videoId + "." + ext + "\"")
                .body(content.getBytes(StandardCharsets.UTF_8));
    }
}
