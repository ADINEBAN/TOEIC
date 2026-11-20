package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.CreateVideoLessonRequest;
import org.example.backend.dto.request.UpdateVideoLessonRequest;
import org.example.backend.dto.request.UploadAndCreateVideoLessonRequest;
import org.example.backend.dto.response.VideoUploadResponse;
import org.example.backend.dto.response.VideoLessonResponse;
import org.example.backend.entity.LearningModule;
import org.example.backend.entity.VideoLesson;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.mapper.VideoLessonMapper;
import org.example.backend.repository.LearningModuleRepository;
import org.example.backend.repository.UserVideoProgressRepository;
import org.example.backend.repository.VideoNoteRepository;
import org.example.backend.repository.VideoLessonRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AdminVideoLessonService {

    private final VideoLessonRepository videoLessonRepository;
    private final LearningModuleRepository learningModuleRepository;
    private final UserVideoProgressRepository userVideoProgressRepository;
    private final VideoNoteRepository videoNoteRepository;
    private final VideoLessonMapper videoLessonMapper;
    private final CloudinaryUploadService cloudinaryUploadService;

    @Transactional
    public VideoLessonResponse createVideoLesson(CreateVideoLessonRequest request) {
        if (request == null) {
            throw new AppException(ErrorCode.INVALID_VIDEO_LESSON_DATA);
        }

        LearningModule module = findModule(request.getModuleId());
        String title = trimToNull(request.getTitle());
        String videoUrl = trimToNull(request.getVideoUrl());

        if (title == null || videoUrl == null || !isValidPositive(request.getDurationSeconds()) || !isValidSortOrder(request.getSortOrder())) {
            throw new AppException(ErrorCode.INVALID_VIDEO_LESSON_DATA);
        }

        VideoLesson videoLesson = new VideoLesson();
        videoLesson.setCourse(null);
        videoLesson.setModule(module);
        videoLesson.setTitle(title);
        videoLesson.setDescription(trimToNull(request.getDescription()));
        videoLesson.setVideoUrl(normalizeVideoUrlForStorage(videoUrl));
        videoLesson.setDurationSeconds(request.getDurationSeconds());
        videoLesson.setSortOrder(request.getSortOrder());
        videoLesson.setFree(request.getFree() == null ? false : request.getFree());
        videoLesson.setPublished(request.getPublished() == null ? false : request.getPublished());

        return videoLessonMapper.toResponse(videoLessonRepository.save(videoLesson));
    }

    @Transactional(readOnly = true)
    public List<VideoLessonResponse> getAllVideoLessons() {
        return videoLessonMapper.toResponseList(videoLessonRepository.findAll());
    }

    @Transactional(readOnly = true)
    public List<VideoLessonResponse> getVideoLessonsByModule(Long moduleId) {
        ensureModuleExists(moduleId);
        return videoLessonMapper.toResponseList(videoLessonRepository.findByModuleIdOrderBySortOrderAsc(moduleId));
    }

    @Transactional
    public VideoLessonResponse updateVideoLesson(Long videoLessonId, UpdateVideoLessonRequest request) {
        if (request == null) {
            throw new AppException(ErrorCode.INVALID_VIDEO_LESSON_DATA);
        }

        VideoLesson videoLesson = findVideoLesson(videoLessonId);

        if (request.getModuleId() != null) {
            videoLesson.setModule(findModule(request.getModuleId()));
        }

        if (request.getTitle() != null) {
            String title = trimToNull(request.getTitle());
            if (title == null) {
                throw new AppException(ErrorCode.INVALID_VIDEO_LESSON_DATA);
            }
            videoLesson.setTitle(title);
        }

        if (request.getDescription() != null) {
            videoLesson.setDescription(trimToNull(request.getDescription()));
        }

        if (request.getVideoUrl() != null) {
            String videoUrl = trimToNull(request.getVideoUrl());
            if (videoUrl == null) {
                throw new AppException(ErrorCode.INVALID_VIDEO_LESSON_DATA);
            }
            videoLesson.setVideoUrl(normalizeVideoUrlForStorage(videoUrl));
        }

        if (request.getDurationSeconds() != null) {
            if (!isValidPositive(request.getDurationSeconds())) {
                throw new AppException(ErrorCode.INVALID_VIDEO_LESSON_DATA);
            }
            videoLesson.setDurationSeconds(request.getDurationSeconds());
        }

        if (request.getSortOrder() != null) {
            if (!isValidSortOrder(request.getSortOrder())) {
                throw new AppException(ErrorCode.INVALID_VIDEO_LESSON_DATA);
            }
            videoLesson.setSortOrder(request.getSortOrder());
        }

        if (request.getFree() != null) {
            videoLesson.setFree(request.getFree());
        }

        if (request.getPublished() != null) {
            videoLesson.setPublished(request.getPublished());
        }

        return videoLessonMapper.toResponse(videoLessonRepository.save(videoLesson));
    }

    @Transactional
    public void deleteVideoLesson(Long videoLessonId) {
        VideoLesson videoLesson = findVideoLesson(videoLessonId);
        userVideoProgressRepository.deleteByLessonId(videoLessonId);
        videoNoteRepository.deleteByLessonId(videoLessonId);
        videoLessonRepository.delete(videoLesson);
    }

    private VideoLesson findVideoLesson(Long videoLessonId) {
        return videoLessonRepository.findById(videoLessonId)
                .orElseThrow(() -> new AppException(ErrorCode.VIDEO_LESSON_NOT_FOUND));
    }

    private LearningModule findModule(Long moduleId) {
        if (moduleId == null) {
            throw new AppException(ErrorCode.INVALID_VIDEO_LESSON_DATA);
        }
        return learningModuleRepository.findById(moduleId)
                .orElseThrow(() -> new AppException(ErrorCode.LEARNING_MODULE_NOT_FOUND));
    }

    private void ensureModuleExists(Long moduleId) {
        if (moduleId == null || !learningModuleRepository.existsById(moduleId)) {
            throw new AppException(ErrorCode.LEARNING_MODULE_NOT_FOUND);
        }
    }

    private boolean isValidPositive(Integer value) {
        return value != null && value > 0;
    }

    private boolean isValidSortOrder(Integer sortOrder) {
        return sortOrder != null && sortOrder > 0;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    @Transactional
    public VideoLessonResponse uploadAndCreateVideoLesson(
            org.springframework.web.multipart.MultipartFile file,
            UploadAndCreateVideoLessonRequest request) {
        if (file == null || file.isEmpty() || request == null) {
            throw new AppException(ErrorCode.INVALID_VIDEO_LESSON_DATA);
        }

        // Step 1: Upload video to Cloudinary
        VideoUploadResponse uploadResponse = cloudinaryUploadService.uploadVideo(file);

        // Step 2: Create VideoLesson record with data from upload response
        LearningModule module = findModule(request.getModuleId());
        String title = trimToNull(request.getTitle());

        if (title == null || !isValidSortOrder(request.getSortOrder())) {
            throw new AppException(ErrorCode.INVALID_VIDEO_LESSON_DATA);
        }

        VideoLesson videoLesson = new VideoLesson();
        videoLesson.setCourse(null);
        videoLesson.setModule(module);
        videoLesson.setTitle(title);
        videoLesson.setDescription(trimToNull(request.getDescription()));
        // Auto-populate from upload response (Cloudinary or local storage fallback)
        Integer resolvedDuration = uploadResponse.getDurationSeconds() != null && uploadResponse.getDurationSeconds() > 0
                ? uploadResponse.getDurationSeconds()
                : (isValidPositive(request.getDurationSeconds()) ? request.getDurationSeconds() : 60);
        String storedUrl = uploadResponse.getPublicId() != null && uploadResponse.getPublicId().startsWith("local/")
                ? "/api/media/videos/" + uploadResponse.getPublicId().substring("local/".length())
                : normalizeVideoUrlForStorage(uploadResponse.getSecureUrl());
        videoLesson.setVideoUrl(storedUrl);
        videoLesson.setDurationSeconds(resolvedDuration);
        videoLesson.setSortOrder(request.getSortOrder());
        videoLesson.setFree(request.getFree() == null ? false : request.getFree());
        videoLesson.setPublished(request.getPublished() == null ? false : request.getPublished());

        return videoLessonMapper.toResponse(videoLessonRepository.save(videoLesson));
    }

    /**
     * Converts any local/LAN absolute media URL (e.g. http://192.168.1.5:8082/api/media/...) into a
     * portable relative path (/api/media/...) so lessons stay playable across Wi-Fi changes & cloud deploys.
     */
    private String normalizeVideoUrlForStorage(String rawUrl) {
        if (rawUrl == null) {
            return null;
        }
        String trimmed = rawUrl.trim();
        String marker = "/api/media/";
        int idx = trimmed.indexOf(marker);
        if (idx > 0 && trimmed.toLowerCase().matches("^https?://(?:localhost|127\\.0\\.0\\.1|10\\.0\\.2\\.2|192\\.168\\.\\d+\\.\\d+|172\\.(?:1[6-9]|2\\d|3[01])\\.\\d+\\.\\d+)(?::\\d+)?/.*")) {
            return trimmed.substring(idx);
        }
        return trimmed;
    }
}
