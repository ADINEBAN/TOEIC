package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.CreateVideoNoteRequest;
import org.example.backend.dto.response.VideoNoteResponse;
import org.example.backend.entity.User;
import org.example.backend.entity.VideoLesson;
import org.example.backend.entity.VideoNote;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.mapper.VideoNoteMapper;
import org.example.backend.repository.UserRepository;
import org.example.backend.repository.VideoLessonRepository;
import org.example.backend.repository.VideoNoteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class VideoNoteService {

    private final VideoNoteRepository videoNoteRepository;
    private final VideoLessonRepository videoLessonRepository;
    private final UserRepository userRepository;
    private final VideoNoteMapper videoNoteMapper;

    @Transactional(readOnly = true)
    public List<VideoNoteResponse> getNotesForLesson(String email, Long lessonId) {
        User user = findUser(email);
        ensureLessonExists(lessonId);
        return videoNoteMapper.toResponseList(
                videoNoteRepository.findByUserIdAndLessonIdOrderByTimestampSecondsAsc(user.getId(), lessonId)
        );
    }

    @Transactional(readOnly = true)
    public List<VideoNoteResponse> getMyNotes(String email) {
        User user = findUser(email);
        return videoNoteMapper.toResponseList(videoNoteRepository.findByUserIdOrderByCreatedAtDesc(user.getId()));
    }

    @Transactional
    public VideoNoteResponse createNote(String email, Long lessonId, CreateVideoNoteRequest request) {
        User user = findUser(email);
        VideoLesson lesson = ensureLessonExists(lessonId);

        if (request == null || request.getNoteText() == null || request.getNoteText().isBlank()) {
            throw new AppException(ErrorCode.INVALID_VIDEO_NOTE_DATA);
        }

        int timestamp = request.getTimestampSeconds() == null ? 0 : Math.max(0, request.getTimestampSeconds());

        VideoNote note = new VideoNote();
        note.setUser(user);
        note.setLesson(lesson);
        note.setTimestampSeconds(timestamp);
        note.setNoteText(request.getNoteText().trim());

        return videoNoteMapper.toResponse(videoNoteRepository.save(note));
    }

    @Transactional
    public void deleteNote(String email, Long noteId) {
        User user = findUser(email);
        VideoNote note = videoNoteRepository.findByIdAndUserId(noteId, user.getId())
                .orElseThrow(() -> new AppException(ErrorCode.VIDEO_NOTE_NOT_FOUND));
        videoNoteRepository.delete(note);
    }

    private User findUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
    }

    private VideoLesson ensureLessonExists(Long lessonId) {
        if (lessonId == null) {
            throw new AppException(ErrorCode.VIDEO_LESSON_NOT_FOUND);
        }
        return videoLessonRepository.findById(lessonId)
                .orElseThrow(() -> new AppException(ErrorCode.VIDEO_LESSON_NOT_FOUND));
    }
}
