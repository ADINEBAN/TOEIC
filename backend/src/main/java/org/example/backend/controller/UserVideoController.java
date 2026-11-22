package org.example.backend.controller;

import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.VideoBookmarkRequest;
import org.example.backend.dto.request.VideoImportRequest;
import org.example.backend.dto.request.VideoLearningStateRequest;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.ImportedVideoDetailResponse;
import org.example.backend.dto.response.VideoBookmarkResponse;
import org.example.backend.dto.response.VideoProcessingJobResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.SubscriptionService;
import org.example.backend.service.VideoLearningService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/users/videos")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
public class UserVideoController {

    private final VideoLearningService videoLearningService;

    @Autowired(required = false)
    private SubscriptionService subscriptionService;

    @PostMapping("/import")
    @PreAuthorize("hasAnyRole('ADMIN', 'CONTENT_MANAGER')")
    public ResponseEntity<ApiResponse<ImportedVideoDetailResponse>> importVideo(
            Authentication authentication,
            @RequestBody VideoImportRequest request
    ) {
        ImportedVideoDetailResponse response = videoLearningService.importVideo(authentication.getName(), request);
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_IMPORT_STARTED);
    }

    @PostMapping("/personal/import")
    public ResponseEntity<ApiResponse<ImportedVideoDetailResponse>> importPersonalVideo(
            Authentication authentication,
            @RequestBody VideoImportRequest request
    ) {
        if (subscriptionService != null && authentication != null) {
            subscriptionService.consumeQuotaOrThrow(authentication.getName(), SubscriptionService.FEATURE_PERSONAL_VIDEO);
        }
        ImportedVideoDetailResponse response = videoLearningService.importPersonalVideo(authentication.getName(), request);
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_IMPORT_STARTED);
    }

    @GetMapping("/personal/jobs/{jobId}")
    public ResponseEntity<ApiResponse<VideoProcessingJobResponse>> getPersonalJobStatus(
            Authentication authentication,
            @PathVariable Long jobId
    ) {
        VideoProcessingJobResponse response = videoLearningService.getPersonalJobStatus(authentication.getName(), jobId);
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_JOB_RETRIEVED);
    }

    @PostMapping("/personal/jobs/{jobId}/cancel")
    public ResponseEntity<ApiResponse<VideoProcessingJobResponse>> cancelPersonalJob(
            Authentication authentication,
            @PathVariable Long jobId
    ) {
        VideoProcessingJobResponse response = videoLearningService.cancelPersonalJob(authentication.getName(), jobId);
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_JOB_RETRIEVED);
    }

    @PostMapping("/personal/jobs/{jobId}/retry")
    public ResponseEntity<ApiResponse<VideoProcessingJobResponse>> retryPersonalJob(
            Authentication authentication,
            @PathVariable Long jobId
    ) {
        VideoProcessingJobResponse response = videoLearningService.retryPersonalJob(authentication.getName(), jobId);
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_JOB_RETRIEVED);
    }

    @DeleteMapping("/personal/{videoId}")
    public ResponseEntity<ApiResponse<Void>> deletePersonalVideo(
            Authentication authentication,
            @PathVariable Long videoId
    ) {
        videoLearningService.deletePersonalVideo(authentication.getName(), videoId);
        return ApiResponseUtil.success(null, SuccessCode.VIDEO_DELETED);
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<ImportedVideoDetailResponse>>> listPublishedVideos(
            Authentication authentication,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String topic,
            @RequestParam(required = false) Boolean favoritesOnly
    ) {
        List<ImportedVideoDetailResponse> response = videoLearningService.listPublishedVideos(
                authentication.getName(), search, level, topic, favoritesOnly
        );
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_LIBRARY_LISTED);
    }

    @GetMapping("/{videoId}")
    public ResponseEntity<ApiResponse<ImportedVideoDetailResponse>> getPublishedVideoDetail(
            Authentication authentication,
            @PathVariable Long videoId
    ) {
        ImportedVideoDetailResponse response = videoLearningService.getPublishedVideoDetail(
                authentication.getName(), videoId
        );
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_LIBRARY_LISTED);
    }

    @PostMapping("/{videoId}/refresh-stream")
    public ResponseEntity<ApiResponse<ImportedVideoDetailResponse>> refreshVideoStream(
            Authentication authentication,
            @PathVariable Long videoId
    ) {
        ImportedVideoDetailResponse response = videoLearningService.refreshVideoStream(
                authentication.getName(), videoId
        );
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_LIBRARY_LISTED);
    }

    @RequestMapping(value = "/{videoId}/media", method = {RequestMethod.GET, RequestMethod.HEAD})
    public void streamVideoMedia(
            Authentication authentication,
            @PathVariable Long videoId,
            @RequestHeader(value = HttpHeaders.RANGE, required = false) String rangeHeader,
            HttpMethod method,
            HttpServletResponse response
    ) throws IOException {
        videoLearningService.streamVideoMedia(
                authentication.getName(),
                videoId,
                rangeHeader,
                HttpMethod.HEAD.equals(method),
                response
        );
    }

    @GetMapping("/jobs/{jobId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'CONTENT_MANAGER')")
    public ResponseEntity<ApiResponse<VideoProcessingJobResponse>> getJobStatus(
            Authentication authentication,
            @PathVariable Long jobId
    ) {
        VideoProcessingJobResponse response = videoLearningService.getJobStatus(authentication.getName(), jobId);
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_JOB_RETRIEVED);
    }

    @PostMapping("/jobs/{jobId}/cancel")
    @PreAuthorize("hasAnyRole('ADMIN', 'CONTENT_MANAGER')")
    public ResponseEntity<ApiResponse<VideoProcessingJobResponse>> cancelJob(
            Authentication authentication,
            @PathVariable Long jobId
    ) {
        VideoProcessingJobResponse response = videoLearningService.cancelJob(authentication.getName(), jobId);
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_JOB_RETRIEVED);
    }

    @PostMapping("/jobs/{jobId}/retry")
    @PreAuthorize("hasAnyRole('ADMIN', 'CONTENT_MANAGER')")
    public ResponseEntity<ApiResponse<VideoProcessingJobResponse>> retryJob(
            Authentication authentication,
            @PathVariable Long jobId
    ) {
        VideoProcessingJobResponse response = videoLearningService.retryJob(authentication.getName(), jobId);
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_JOB_RETRIEVED);
    }

    @PutMapping("/{videoId}/state")
    public ResponseEntity<ApiResponse<ImportedVideoDetailResponse>> updateLearningState(
            Authentication authentication,
            @PathVariable Long videoId,
            @RequestBody VideoLearningStateRequest request
    ) {
        ImportedVideoDetailResponse response = videoLearningService.updateLearningState(
                authentication.getName(), videoId, request
        );
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_STATE_UPDATED);
    }

    @PostMapping("/{videoId}/bookmarks")
    public ResponseEntity<ApiResponse<VideoBookmarkResponse>> addBookmark(
            Authentication authentication,
            @PathVariable Long videoId,
            @RequestBody VideoBookmarkRequest request
    ) {
        VideoBookmarkResponse response = videoLearningService.addBookmark(authentication.getName(), videoId, request);
        return ApiResponseUtil.success(response, SuccessCode.VIDEO_BOOKMARK_SAVED);
    }

    @DeleteMapping("/{videoId}/bookmarks/{bookmarkId}")
    public ResponseEntity<ApiResponse<Void>> deleteBookmark(
            Authentication authentication,
            @PathVariable Long videoId,
            @PathVariable Long bookmarkId
    ) {
        videoLearningService.deleteBookmark(authentication.getName(), videoId, bookmarkId);
        return ApiResponseUtil.success(SuccessCode.VIDEO_NOTE_DELETED);
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
