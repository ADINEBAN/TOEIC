package org.example.backend.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class ArenaRoomResponse {
    private String roomCode;
    private String status; // WAITING, IN_PROGRESS, FINISHED
    private String mode; // VOCAB, PART5
    private String matchType; // ROOM, RANDOM
    @JsonProperty("isPrivate")
    private boolean privateRoom;
    @JsonProperty("hasPassword")
    private boolean hasPassword;
    private String hostName;
    private String hostEmail;
    private String winnerName;
    private String winnerEmail;
    private Integer totalQuestions;
    private int currentRoundIndex;
    private String roundPhase; // WAITING, QUESTION, REVEAL, FINISHED
    private int roundDurationSeconds;
    private int remainingSeconds;
    private int elapsedMatchSeconds;
    private String roundWinnerName;
    private String roundWinnerEmail;
    private int roundDiamondReward;
    private String currentRevealWord;
    private String currentRevealMeaningVi;
    private String currentRevealCorrectLabel;
    private String currentRevealExplanation;
    private boolean audioHintUnlocked;
    private int audioHintUnlockAtSeconds;
    private String audioHintWord;
    private String feedbackMessage;
    private ArenaEmoteEvent latestEmote;
    private LocalDateTime createdAt;
    private List<ArenaPlayerState> players;
    private List<ArenaQuestionItem> questions;

    @Data
    public static class ArenaEmoteEvent {
        private Long id;
        private String senderEmail;
        private String senderName;
        private String emoteCode;
        private String emoji;
        private String label;
        private long sentAtEpochMs;
    }

    @Data
    public static class ArenaPlayerState {
        private Long userId;
        private String email;
        private String fullName;
        private String username;
        private String avatarUrl;
        private String equippedFrameId;
        private int level;
        private int score;
        private int roundWins;
        private int correctCount;
        private int answeredCount;
        private int diamonds;
        private int diamondDelta;
        private long totalResponseMs;
        private long lastRoundResponseMs;
        private boolean answeredCurrentRound;
        private int eloRating;
        private int wins;
        private int losses;
        private ArenaEmoteEvent activeEmote;
    }

    @Data
    public static class ArenaQuestionItem {
        private Long questionId;
        private Integer partNo;
        private String type; // VOCAB | PART5
        private String questionText;
        private Integer wordLength;
        private String hintMask;
        private String explanation;
        private String explanationVi;
        private String meaningVi;
        private String maskedExample;
        private String exampleTranslation;
        private String questionTranslationVi;
        private String partOfSpeech;
        private String pronunciation;
        private String topicName;
        private List<ArenaOptionItem> options;
    }

    @Data
    public static class ArenaOptionItem {
        private String optionLabel;
        private String optionText;
    }
}
