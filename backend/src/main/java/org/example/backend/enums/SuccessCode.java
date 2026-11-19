package org.example.backend.enums;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.experimental.FieldDefaults;
import org.springframework.http.HttpStatus;

@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE,  makeFinal = true)

public enum SuccessCode {
    // --- CREATE (1000 - 1009) ---
    DEVICE_CREATED(1001, "Device created successfully", HttpStatus.CREATED),
    PATIENT_CREATED(1002, "Patient created successfully", HttpStatus.CREATED),
    DOCTOR_CREATED(1003, "Doctor created successfully", HttpStatus.CREATED),
    MEDICAL_ENCOUNTER_CREATED(1004, "MedicalEncounter created successfully", HttpStatus.CREATED),


    ARTICLE_GET(1013, "Article get successfully", HttpStatus.OK),
    ARTICLE_LISTED(1013, "Article listed successfully", HttpStatus.OK),
    ARTICLE_CREATED(1005, "Article created successfully", HttpStatus.CREATED),
    // --- LIST (1010 - 1019) ---
    DELETE_MEDICAL_ENCOUNTER(2003, "Medical encounter deleted successfully", HttpStatus.OK),

    MEDICAL_ENCOUNTER_LISTED(1010, "MedicalEncounter Device listed successfully", HttpStatus.OK),
    PATIENT_LISTED(1011, "Patient Device listed successfully", HttpStatus.OK),
    DOCTOR_LISTED(1012, "Doctor Device listed successfully", HttpStatus.OK),

    // --- GET (1020 - 1029) ---
    PATIENT_GET(1020, "Patient get successfully", HttpStatus.OK),
    DOCTOR_GET(1021, "Doctor get successfully", HttpStatus.OK),

    // --- UPDATE (1030 - 1039) ---
    // Thêm các mã cập nhật thành công
    PATIENT_UPDATED(1030, "Patient updated successfully", HttpStatus.OK),
    PASSWORD_UPDATED(1030, "Password updated successfully", HttpStatus.OK),
    DOCTOR_UPDATED(1031, "Doctor updated successfully", HttpStatus.OK),
    DEVICE_UPDATED(1032, "Device updated successfully", HttpStatus.OK),

    // --- AUTH & ANALYSIS (1040 - 1049) ---
    LOGIN_SUCCESS(1040, "Login successfully", HttpStatus.OK),
    ANALYZE_SUCCESS(1041, "Image analysis completed successfully", HttpStatus.OK),
    USER_CREATED(1042, "User created successfully", HttpStatus.CREATED),
    LOGOUT_SUCCESS(1052, "Logout successfully", HttpStatus.OK),
    ADMIN_CREATED(1050, "Admin created successfully", HttpStatus.CREATED),
    USER_INFO_RETRIEVED(1051, "User info retrieved successfully", HttpStatus.OK),
    FLASHCARD_CREATED(1053, "Flashcard created successfully", HttpStatus.CREATED),
    FLASHCARD_LISTED(1054, "Flashcards listed successfully", HttpStatus.OK),
    FLASHCARD_UPDATED(1055, "Flashcard updated successfully", HttpStatus.OK),
    FLASHCARD_DELETED(1056, "Flashcard deleted successfully", HttpStatus.OK),
    LEARNING_MODULE_CREATED(1057, "Learning module created successfully", HttpStatus.CREATED),
    LEARNING_MODULE_UPDATED(1058, "Learning module updated successfully", HttpStatus.OK),
    LEARNING_MODULE_DEACTIVATED(1059, "Learning module deactivated successfully", HttpStatus.OK),
    LEARNING_MODULE_DELETED(1125, "Learning module deleted successfully", HttpStatus.OK),
    LEARNING_MODULE_LISTED(1084, "Learning modules listed successfully", HttpStatus.OK),
    LEARNING_MODULE_GET(1085, "Learning module retrieved successfully", HttpStatus.OK),
    LEARNING_PATH_ASSIGNED(1043, "Learning path assigned successfully", HttpStatus.OK),
    TARGET_SCORE_UPDATED(1044, "Target score updated successfully", HttpStatus.OK),
    LEARNING_PATH_CREATED(1045, "Learning path created successfully", HttpStatus.CREATED),
    LEARNING_PATH_LISTED(1046, "Learning paths listed successfully", HttpStatus.OK),
    LEARNING_PATH_GET(1047, "Learning path retrieved successfully", HttpStatus.OK),
    LEARNING_PATH_UPDATED(1048, "Learning path updated successfully", HttpStatus.OK),
    LEARNING_PATH_DEACTIVATED(1049, "Learning path deactivated successfully", HttpStatus.OK),
    LEARNING_PATH_DELETED(1076, "Learning path deleted successfully", HttpStatus.OK),
    LEARNING_PATH_MILESTONE_CREATED(1060, "Learning path milestone created successfully", HttpStatus.CREATED),
    LEARNING_PATH_MILESTONE_LISTED(1061, "Learning path milestones listed successfully", HttpStatus.OK),
    LEARNING_PATH_MILESTONE_UPDATED(1062, "Learning path milestone updated successfully", HttpStatus.OK),
    LEARNING_PATH_MILESTONE_DELETED(1063, "Learning path milestone deleted successfully", HttpStatus.OK),
    MILESTONE_MODULE_CREATED(1064, "Milestone module created successfully", HttpStatus.CREATED),
    MILESTONE_MODULE_LISTED(1065, "Milestone modules listed successfully", HttpStatus.OK),
    MILESTONE_MODULE_UPDATED(1066, "Milestone module updated successfully", HttpStatus.OK),
    MILESTONE_MODULE_DELETED(1067, "Milestone module deleted successfully", HttpStatus.OK),
    VIDEO_LESSON_CREATED(1068, "Video lesson created successfully", HttpStatus.CREATED),
    VIDEO_LESSON_UPDATED(1069, "Video lesson updated successfully", HttpStatus.OK),
    VIDEO_LESSON_DELETED(1070, "Video lesson deleted successfully", HttpStatus.OK),
    VIDEO_LESSON_LISTED(1071, "Video lessons listed successfully", HttpStatus.OK),
    PRACTICE_SET_CREATED(1072, "Practice set created successfully", HttpStatus.CREATED),
    PRACTICE_SET_UPDATED(1073, "Practice set updated successfully", HttpStatus.OK),
    PRACTICE_SET_DELETED(1074, "Practice set deleted successfully", HttpStatus.OK),
    PRACTICE_SET_LISTED(1075, "Practice sets listed successfully", HttpStatus.OK),
    QUESTION_CREATED(1077, "Question created successfully", HttpStatus.CREATED),
    QUESTION_LISTED(1078, "Questions listed successfully", HttpStatus.OK),
    QUESTION_GET(1079, "Question retrieved successfully", HttpStatus.OK),
    QUESTION_UPDATED(1080, "Question updated successfully", HttpStatus.OK),
    QUESTION_DELETED(1081, "Question deleted successfully", HttpStatus.OK),
    PRACTICE_SET_QUESTION_ASSIGNED(1082, "Practice set questions assigned successfully", HttpStatus.OK),
    PRACTICE_SET_QUESTION_LISTED(1083, "Practice set questions listed successfully", HttpStatus.OK),
    USER_LESSON_PROGRESS_UPDATED(1086, "User lesson progress updated successfully", HttpStatus.OK),
    USER_MODULE_PROGRESS_UPDATED(1087, "User module progress updated successfully", HttpStatus.OK),
    VIDEO_FILE_UPLOADED(1088, "Video file uploaded successfully", HttpStatus.OK),

    // --- Message codes (2001-2020) ---
    SEND_MESSAGE_SUCCESS(2001, "Message sent successfully", HttpStatus.OK),
    GET_MESSAGES_SUCCESS(2002, "Messages retrieved successfully", HttpStatus.OK),
    DELETE_MESSAGE_SUCCESS(2003, "Message deleted successfully", HttpStatus.OK),
    DELETE_MESSAGES_SUCCESS(2004, "Messages deleted successfully", HttpStatus.OK),
    USER_JOINED_SUCCESS(2005, "User joined chat room successfully", HttpStatus.OK),
    USER_LEFT_SUCCESS(2006, "User left chat room successfully", HttpStatus.OK),
    MESSAGE_MARKED_READ(2007, "Message marked as read successfully", HttpStatus.OK),
    ALL_MESSAGES_MARKED_READ(2008, "All messages marked as read successfully", HttpStatus.OK),
    GET_ROOMS_SUCCESS(2009, "Rooms retrieved successfully", HttpStatus.OK),
    GET_UNREAD_COUNT_SUCCESS(2010, "Unread count retrieved successfully", HttpStatus.OK),

    FLASHCARD_COLLECTION_CREATED(1089, "Flashcard collection created successfully", HttpStatus.CREATED),
    FLASHCARD_COLLECTION_UPDATED(1090, "Flashcard collection updated successfully", HttpStatus.OK),
    FLASHCARD_COLLECTION_DELETED(1091, "Flashcard collection deleted successfully", HttpStatus.OK),
    FLASHCARD_COLLECTION_LISTED(1092, "Flashcard collections listed successfully", HttpStatus.OK),

    TEST_CREATED(1093, "Test created successfully", HttpStatus.CREATED),
    TEST_UPDATED(1094, "Test updated successfully", HttpStatus.OK),
    TEST_DELETED(1095, "Test deleted successfully", HttpStatus.OK),
    TEST_LISTED(1096, "Tests listed successfully", HttpStatus.OK),
    TEST_GET(1097, "Test retrieved successfully", HttpStatus.OK),
    TEST_PART_CREATED(1098, "Test part created successfully", HttpStatus.CREATED),
    TEST_PART_UPDATED(1099, "Test part updated successfully", HttpStatus.OK),
    TEST_PART_DELETED(1100, "Test part deleted successfully", HttpStatus.OK),
    TEST_PART_LISTED(1101, "Test parts listed successfully", HttpStatus.OK),
    TEST_PART_QUESTION_ASSIGNED(1102, "Test part questions assigned successfully", HttpStatus.OK),
    TEST_PART_QUESTION_LISTED(1103, "Test part questions listed successfully", HttpStatus.OK),
    TEST_PART_QUESTION_DELETED(1104, "Test part question deleted successfully", HttpStatus.OK),
    TEST_ATTEMPT_STARTED(1105, "Test attempt started successfully", HttpStatus.OK),
    TEST_ATTEMPT_SUBMITTED(1106, "Test attempt submitted successfully", HttpStatus.OK),
    TEST_ATTEMPT_LISTED(1107, "Test attempts listed successfully", HttpStatus.OK),
    TEST_QUESTION_EXPLAINED(1108, "Question explained by AI successfully", HttpStatus.OK),
    PRACTICE_SET_GET(1109, "Practice set retrieved successfully", HttpStatus.OK),
    PRACTICE_ATTEMPT_STARTED(1110, "Practice attempt started successfully", HttpStatus.OK),
    PRACTICE_ATTEMPT_SUBMITTED(1111, "Practice attempt submitted successfully", HttpStatus.OK),
    PRACTICE_ATTEMPT_LISTED(1112, "Practice attempts listed successfully", HttpStatus.OK),
    PRACTICE_ATTEMPT_GET(1113, "Practice attempt retrieved successfully", HttpStatus.OK),
    TEST_LEADERBOARD_LISTED(1114, "Test leaderboard listed successfully", HttpStatus.OK),
    GRAMMAR_CREATED(1115, "Grammar created successfully", HttpStatus.CREATED),
    GRAMMAR_UPDATED(1116, "Grammar updated successfully", HttpStatus.OK),
    GRAMMAR_DELETED(1117, "Grammar deleted successfully", HttpStatus.OK),
    GRAMMAR_LISTED(1118, "Grammars listed successfully", HttpStatus.OK),
    GRAMMAR_GET(1119, "Grammar retrieved successfully", HttpStatus.OK),
    GRAMMAR_FAVORITED(1120, "Grammar added to favorites successfully", HttpStatus.OK),
    GRAMMAR_UNFAVORITED(1121, "Grammar removed from favorites successfully", HttpStatus.OK),
    GRAMMAR_FAVORITE_LISTED(1122, "Favorite grammars listed successfully", HttpStatus.OK),
    GRAMMAR_FAVORITE_TITLE_LISTED(1123, "Favorite grammar titles listed successfully", HttpStatus.OK),
    USER_STREAK_RETRIEVED(1124, "User streak retrieved successfully", HttpStatus.OK),
    VIDEO_NOTE_CREATED(1126, "Video note created successfully", HttpStatus.CREATED),
    VIDEO_NOTE_LISTED(1127, "Video notes listed successfully", HttpStatus.OK),
    VIDEO_NOTE_DELETED(1128, "Video note deleted successfully", HttpStatus.OK),
    VOCABULARY_TOPIC_LISTED(1129, "Vocabulary topics listed successfully", HttpStatus.OK),
    VOCABULARY_DUE_LISTED(1130, "Due vocabularies listed successfully", HttpStatus.OK),
    VOCABULARY_REVIEWED(1131, "Vocabulary reviewed successfully", HttpStatus.OK),
    VOCABULARY_CREATED(1132, "Vocabulary created successfully", HttpStatus.CREATED),
    MISTAKE_LISTED(1133, "Wrong answer mistakes listed successfully", HttpStatus.OK),
    TOKEN_REFRESHED(1134, "Access token refreshed successfully", HttpStatus.OK),
    PROFILE_UPDATED(1135, "User profile updated successfully", HttpStatus.OK),
    QUESTIONS_BULK_IMPORTED(1136, "Questions bulk imported successfully", HttpStatus.CREATED),
    ANALYTICS_RETRIEVED(1137, "Admin analytics retrieved successfully", HttpStatus.OK),
    USER_STATUS_UPDATED(1138, "User status updated successfully", HttpStatus.OK),
    USER_PREMIUM_UPDATED(1139, "User premium flag updated successfully", HttpStatus.OK),
    ARENA_ROOM_SUCCESS(1140, "Arena room operation succeeded", HttpStatus.OK),
    TTS_VOICES_LISTED(1141, "TTS voices listed successfully", HttpStatus.OK),
    TTS_SYNTHESIZED(1142, "TTS audio synthesized successfully", HttpStatus.OK),
    YOUTUBE_SUBTITLES_GENERATED(1143, "YouTube bilingual subtitles generated successfully", HttpStatus.OK),
    YOUTUBE_WORD_LOOKED_UP(1144, "Word details retrieved successfully", HttpStatus.OK),
    DOCUMENT_IMPORTED(1145, "TOEIC document extracted and validated successfully", HttpStatus.CREATED),
    DOCUMENT_LISTED(1146, "Imported documents listed successfully", HttpStatus.OK),
    DOCUMENT_UPDATED(1147, "Imported document preview updated successfully", HttpStatus.OK),
    DOCUMENT_EXAM_CONFIRMED(1148, "TOEIC exam created from document successfully", HttpStatus.CREATED),
    DOCUMENT_AI_ANALYZED(1149, "AI answer analysis completed (unverified suggestions)", HttpStatus.OK),
    VIDEO_IMPORT_STARTED(1150, "Video import job queued successfully", HttpStatus.ACCEPTED),
    VIDEO_JOB_RETRIEVED(1151, "Video processing job status retrieved", HttpStatus.OK),
    VIDEO_LIBRARY_LISTED(1152, "Imported videos listed successfully", HttpStatus.OK),
    VIDEO_BOOKMARK_SAVED(1153, "Video bookmark saved successfully", HttpStatus.CREATED),
    VIDEO_STATE_UPDATED(1154, "Video learning progress updated successfully", HttpStatus.OK),
    VIDEO_UPDATED(1155, "Video metadata updated successfully", HttpStatus.OK),
    VIDEO_SUBTITLES_UPDATED(1156, "Video transcript and subtitles updated successfully", HttpStatus.OK),
    VIDEO_PUBLISHED(1157, "Video published to User Learning Library successfully", HttpStatus.OK),
    VIDEO_UNPUBLISHED(1158, "Video unpublished and moved to reviewing state", HttpStatus.OK),
    VIDEO_ARCHIVED(1159, "Video archived successfully", HttpStatus.OK),
    VIDEO_DELETED(1160, "Video deleted successfully", HttpStatus.OK),
    DICTIONARY_LOOKED_UP(1161, "Semantic dictionary entry retrieved successfully", HttpStatus.OK),
    IMAGE_OBJECT_RECOGNIZED(1162, "Object recognized from image successfully", HttpStatus.OK),
    DICTIONARY_HISTORY_LISTED(1163, "Dictionary lookup history retrieved successfully", HttpStatus.OK),
    DICTIONARY_HISTORY_DELETED(1164, "Dictionary lookup history cleared successfully", HttpStatus.OK),
    AVATAR_UPLOADED(1165, "Avatar uploaded successfully", HttpStatus.OK),
    WEEKLY_LEADERBOARD_RETRIEVED(1166, "Weekly leaderboard retrieved successfully", HttpStatus.OK),
    COSMETIC_SHOP_RETRIEVED(1167, "Cosmetic shop catalog retrieved successfully", HttpStatus.OK),
    COSMETIC_PURCHASED(1168, "Cosmetic item purchased successfully", HttpStatus.OK),
    COSMETIC_EQUIPPED(1169, "Cosmetic item equipped successfully", HttpStatus.OK),
    ACHIEVEMENTS_RETRIEVED(1170, "User achievements retrieved successfully", HttpStatus.OK),
    CHAT_MESSAGES_RETRIEVED(1171, "Chat messages retrieved successfully", HttpStatus.OK),
    CHAT_MESSAGE_SENT(1172, "Chat message sent successfully", HttpStatus.CREATED),
    FRIENDSHIP_UPDATED(1173, "Friendship updated successfully", HttpStatus.OK),
    STREAK_CHECKED_IN(1174, "Daily streak check-in succeeded", HttpStatus.OK),

    PATIENT_CLASSIFICATION_DELETED(1023, "Xóa phân loại bệnh nhân thành công", HttpStatus.OK),
    CLASSIFICATION_RETRIEVED(1022, "Lấy thông tin phân loại thành công", HttpStatus.OK),
    MESSAGE_CLASSIFIED(1021, "Phân loại tin nhắn thành công", HttpStatus.OK);

    int code;
    String message;
    HttpStatus status;

    public HttpStatus getStatus() {
        return status;
    }

    public String getMessage() {
        return message;
    }

    public int getCode() {
        return code;
    }
}
