package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.ArenaAnswerRequest;
import org.example.backend.dto.request.ArenaCreateRoomRequest;
import org.example.backend.dto.request.ArenaEmoteRequest;
import org.example.backend.dto.request.ArenaMatchmakingRequest;
import org.example.backend.dto.response.ArenaLeaderboardResponse;
import org.example.backend.dto.response.ArenaMatchmakingStatusResponse;
import org.example.backend.dto.response.ArenaRoomResponse;
import org.example.backend.entity.Question;
import org.example.backend.entity.User;
import org.example.backend.entity.Vocabulary;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.repository.QuestionRepository;
import org.example.backend.repository.UserRepository;
import org.example.backend.repository.VocabularyRepository;
import org.example.backend.util.LevelCalculator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ArenaService {

    public static final String MODE_VOCAB = "VOCAB";
    public static final String MODE_PART5 = "PART5";

    private static final int DEFAULT_ROUND_SECONDS_VOCAB = 20;
    private static final int DEFAULT_ROUND_SECONDS_PART5 = 15;
    private static final int VOCAB_AUDIO_HINT_LAST_SECONDS = 7;
    private static final long REVEAL_DURATION_MS = 2400L;
    private static final long QUEUE_HEARTBEAT_TIMEOUT_MS = 25_000L;
    private static final long EMOTE_TTL_MS = 4000L;
    private static final long EMOTE_COOLDOWN_MS = 650L;
    private static final int MATCH_WIN_BONUS_DIAMONDS = 5;
    private static final int MATCH_DRAW_BONUS_DIAMONDS = 2;

    private static final Map<String, EmotePreset> EMOTE_PRESETS = Map.of(
            "EZ", new EmotePreset("EZ", "😎", "Quá dễ !"),
            "HURRY", new EmotePreset("HURRY", "⏰", "Nhanh tay lên bạn ơi!"),
            "SMIRK", new EmotePreset("SMIRK", "😏", "Non lắm bạn ơi~"),
            "FIRE", new EmotePreset("FIRE", "🔥", "Đẳng cấp vậy!"),
            "SWEAT", new EmotePreset("SWEAT", "😅", "Đỉnh kout..."),
            "HAHA", new EmotePreset("HAHA", "😂", "Haha !"),
            "CLAP", new EmotePreset("CLAP", "👏", "Đỉnh đấy, nể!"),
            "GG", new EmotePreset("GG", "🫡", "Hẹn kèo sau nhé !")
    );

    private final QuestionRepository questionRepository;
    private final UserRepository userRepository;

    @Autowired(required = false)
    private VocabularyRepository vocabularyRepository;

    @Autowired(required = false)
    private VideoTranslationAndSubtitleService subtitleTranslationService;

    @Autowired(required = false)
    private SimpMessagingTemplate messagingTemplate;

    private final Map<String, RoomState> rooms = new ConcurrentHashMap<>();
    private final Object matchmakingLock = new Object();
    private final Map<String, Deque<QueueTicket>> matchmakingQueues = new ConcurrentHashMap<>();
    private final Map<String, String> matchedRoomByEmail = new ConcurrentHashMap<>();
    private final Map<String, String> viTranslationCache = new ConcurrentHashMap<>();

    // =========================================================================
    // ROOM CREATION, JOINING (PUBLIC / PASSWORD), WAITING LOBBY, LEAVING
    // =========================================================================

    @Transactional
    public ArenaRoomResponse createRoom(String email, Integer requestedCount) {
        ArenaCreateRoomRequest req = new ArenaCreateRoomRequest();
        req.setQuestionCount(requestedCount);
        req.setMode(MODE_PART5);
        req.setPrivateRoom(false);
        return createRoom(email, req);
    }

    @Transactional
    public ArenaRoomResponse createRoom(String email, ArenaCreateRoomRequest request) {
        User host = findUser(email);
        String mode = normalizeMode(request != null ? request.getMode() : MODE_PART5);
        int count = request != null && request.getQuestionCount() != null
                ? Math.max(3, Math.min(15, request.getQuestionCount()))
                : 10;
        boolean isPrivate = request != null && Boolean.TRUE.equals(request.getPrivateRoom());
        String rawPassword = request != null && request.getPassword() != null ? request.getPassword().trim() : "";
        if (isPrivate && rawPassword.isEmpty()) {
            throw new AppException(ErrorCode.ARENA_ROOM_PASSWORD_REQUIRED);
        }

        RoomState state = buildRoomState(host, mode, count, "ROOM", isPrivate, isPrivate ? rawPassword : null);
        state.status = "WAITING";
        state.roundPhase = "WAITING";
        rooms.put(state.roomCode, state);

        ArenaRoomResponse snapshot = toResponse(state, host.getEmail());
        broadcastRoom(state.roomCode, snapshot);
        return snapshot;
    }

    @Transactional
    public ArenaRoomResponse joinRoom(String email, String roomCode) {
        return joinRoom(email, roomCode, null);
    }

    @Transactional
    public ArenaRoomResponse joinRoom(String email, String roomCode, String password) {
        User player = findUser(email);
        RoomState state = findRoom(roomCode);

        synchronized (state) {
            long now = System.currentTimeMillis();
            advanceRoomClockIfNeeded(state, now);

            boolean alreadyJoined = state.players.containsKey(player.getEmail());
            if (!alreadyJoined) {
                if ("FINISHED".equals(state.status) || state.players.size() >= 2) {
                    throw new AppException(ErrorCode.ARENA_ROOM_INVALID);
                }
                if (state.privateRoom) {
                    String submitted = password != null ? password.trim() : "";
                    if (submitted.isEmpty()) {
                        throw new AppException(ErrorCode.ARENA_ROOM_PASSWORD_REQUIRED);
                    }
                    if (!Objects.equals(state.password, submitted)) {
                        throw new AppException(ErrorCode.ARENA_ROOM_WRONG_PASSWORD);
                    }
                }
                state.players.put(player.getEmail(), newPlayerState(player));
            }

            if ("WAITING".equals(state.status) && state.players.size() >= 2) {
                startFirstRound(state, now);
            }

            ArenaRoomResponse snapshot = toResponse(state, player.getEmail());
            broadcastRoom(state.roomCode, toResponse(state, null));
            return snapshot;
        }
    }

    @Transactional
    public ArenaRoomResponse leaveRoom(String email, String roomCode) {
        User user = findUser(email);
        RoomState state = findRoom(roomCode);

        synchronized (state) {
            long now = System.currentTimeMillis();
            matchedRoomByEmail.remove(user.getEmail());

            if ("WAITING".equals(state.status)) {
                state.players.remove(user.getEmail());
                if (state.players.isEmpty() || user.getEmail().equalsIgnoreCase(state.hostEmail)) {
                    state.status = "FINISHED";
                    state.roundPhase = "FINISHED";
                    rooms.remove(state.roomCode);
                    ArenaRoomResponse closed = toResponse(state, user.getEmail());
                    broadcastRoom(state.roomCode, closed);
                    return closed;
                }
                ArenaRoomResponse snapshot = toResponse(state, user.getEmail());
                broadcastRoom(state.roomCode, snapshot);
                return snapshot;
            }

            if ("IN_PROGRESS".equals(state.status)) {
                // Remaining opponent wins if one player abandons mid-match
                ArenaRoomResponse.ArenaPlayerState remaining = state.players.values().stream()
                        .filter(p -> !p.getEmail().equalsIgnoreCase(user.getEmail()))
                        .findFirst()
                        .orElse(null);
                if (remaining != null) {
                    state.winnerEmail = remaining.getEmail();
                    state.winnerName = remaining.getFullName();
                    state.feedbackMessage = resolveDisplayName(user) + " đã rời trận. " + remaining.getFullName()
                            + " giành chiến thắng!";
                }
                state.status = "FINISHED";
                state.roundPhase = "FINISHED";
                state.matchEndedAtEpochMs = now;
                finalizeMatchAndPersistStats(state);
            }

            ArenaRoomResponse snapshot = toResponse(state, user.getEmail());
            broadcastRoom(state.roomCode, toResponse(state, null));
            return snapshot;
        }
    }

    // =========================================================================
    // RANDOM 1v1 MATCHMAKING QUEUE
    // =========================================================================

    @Transactional
    public ArenaMatchmakingStatusResponse joinMatchmaking(String email, ArenaMatchmakingRequest request) {
        User user = findUser(email);
        String mode = normalizeMode(request != null ? request.getMode() : MODE_VOCAB);
        int count = request != null && request.getQuestionCount() != null
                ? Math.max(3, Math.min(15, request.getQuestionCount()))
                : 10;

        synchronized (matchmakingLock) {
            long now = System.currentTimeMillis();
            purgeStaleQueueEntriesLocked(now);

            String existingRoomCode = matchedRoomByEmail.get(user.getEmail());
            if (existingRoomCode != null) {
                RoomState existing = rooms.get(existingRoomCode);
                if (existing != null && !"FINISHED".equals(existing.status)) {
                    ArenaMatchmakingStatusResponse res = new ArenaMatchmakingStatusResponse();
                    res.setStatus("MATCHED");
                    res.setMode(existing.mode);
                    res.setRoom(toResponse(existing, user.getEmail()));
                    return res;
                }
                matchedRoomByEmail.remove(user.getEmail());
            }

            removeUserFromAllQueuesLocked(user.getEmail());
            Deque<QueueTicket> queue = matchmakingQueues.computeIfAbsent(mode, ignored -> new ArrayDeque<>());

            QueueTicket opponentTicket = null;
            while (!queue.isEmpty()) {
                QueueTicket candidate = queue.pollFirst();
                if (candidate != null && !candidate.email.equalsIgnoreCase(user.getEmail())) {
                    opponentTicket = candidate;
                    break;
                }
            }

            if (opponentTicket != null) {
                User opponent = findUser(opponentTicket.email);
                int finalCount = Math.max(3, Math.min(15, Math.max(count, opponentTicket.questionCount)));
                RoomState room = buildRoomState(opponent, mode, finalCount, "RANDOM", false, null);
                room.players.put(user.getEmail(), newPlayerState(user));
                startFirstRound(room, now);
                rooms.put(room.roomCode, room);

                matchedRoomByEmail.put(opponent.getEmail(), room.roomCode);
                matchedRoomByEmail.put(user.getEmail(), room.roomCode);

                ArenaRoomResponse snapshot = toResponse(room, null);
                broadcastRoom(room.roomCode, snapshot);

                ArenaMatchmakingStatusResponse status = new ArenaMatchmakingStatusResponse();
                status.setStatus("MATCHED");
                status.setMode(mode);
                status.setWaitedSeconds(0);
                status.setQueueSize(queue.size());
                status.setRoom(toResponse(room, user.getEmail()));
                return status;
            }

            QueueTicket selfTicket = new QueueTicket(user.getEmail(), mode, count, now, now);
            queue.addLast(selfTicket);

            ArenaMatchmakingStatusResponse status = new ArenaMatchmakingStatusResponse();
            status.setStatus("SEARCHING");
            status.setMode(mode);
            status.setWaitedSeconds(0);
            status.setQueueSize(queue.size());
            return status;
        }
    }

    @Transactional
    public ArenaMatchmakingStatusResponse getMatchmakingStatus(String email) {
        User user = findUser(email);
        synchronized (matchmakingLock) {
            long now = System.currentTimeMillis();
            purgeStaleQueueEntriesLocked(now);

            String matchedCode = matchedRoomByEmail.get(user.getEmail());
            if (matchedCode != null) {
                RoomState room = rooms.get(matchedCode);
                if (room != null) {
                    synchronized (room) {
                        advanceRoomClockIfNeeded(room, now);
                    }
                    ArenaMatchmakingStatusResponse res = new ArenaMatchmakingStatusResponse();
                    res.setStatus("MATCHED");
                    res.setMode(room.mode);
                    res.setRoom(toResponse(room, user.getEmail()));
                    return res;
                }
                matchedRoomByEmail.remove(user.getEmail());
            }

            for (Map.Entry<String, Deque<QueueTicket>> entry : matchmakingQueues.entrySet()) {
                for (QueueTicket ticket : entry.getValue()) {
                    if (ticket.email.equalsIgnoreCase(user.getEmail())) {
                        ticket.lastHeartbeatMs = now;
                        ArenaMatchmakingStatusResponse res = new ArenaMatchmakingStatusResponse();
                        res.setStatus("SEARCHING");
                        res.setMode(ticket.mode);
                        res.setWaitedSeconds(Math.max(0, (int) ((now - ticket.joinedAtMs) / 1000L)));
                        res.setQueueSize(entry.getValue().size());
                        return res;
                    }
                }
            }

            ArenaMatchmakingStatusResponse idle = new ArenaMatchmakingStatusResponse();
            idle.setStatus("IDLE");
            return idle;
        }
    }

    public ArenaMatchmakingStatusResponse leaveMatchmaking(String email) {
        User user = findUser(email);
        synchronized (matchmakingLock) {
            removeUserFromAllQueuesLocked(user.getEmail());
            matchedRoomByEmail.remove(user.getEmail());
            ArenaMatchmakingStatusResponse idle = new ArenaMatchmakingStatusResponse();
            idle.setStatus("IDLE");
            return idle;
        }
    }

    // =========================================================================
    // ANSWER SUBMISSION, TIMER SYNCHRONIZATION, DIAMONDS & REVEAL
    // =========================================================================

    @Transactional
    public ArenaRoomResponse submitAnswer(String email, String roomCode, Long questionId, String selectedLabel) {
        ArenaAnswerRequest req = new ArenaAnswerRequest();
        req.setEmail(email);
        req.setQuestionId(questionId);
        req.setSelectedLabel(selectedLabel);
        return submitAnswer(email, roomCode, req);
    }

    @Transactional
    public ArenaRoomResponse submitAnswer(String email, String roomCode, ArenaAnswerRequest request) {
        User player = findUser(email);
        RoomState state = findRoom(roomCode);

        synchronized (state) {
            long now = System.currentTimeMillis();
            advanceRoomClockIfNeeded(state, now);

            if ("WAITING".equals(state.status) || state.players.size() < 2) {
                throw new AppException(ErrorCode.ARENA_ROOM_INVALID);
            }
            if ("FINISHED".equals(state.status)) {
                return toResponse(state, player.getEmail());
            }

            ArenaRoomResponse.ArenaPlayerState playerState = state.players.get(player.getEmail());
            if (playerState == null) {
                throw new AppException(ErrorCode.ARENA_ROOM_INVALID);
            }

            if (!"QUESTION".equals(state.roundPhase) || state.currentRoundIndex >= state.questions.size()) {
                return toResponse(state, player.getEmail());
            }

            if (request != null && request.getRoundIndex() != null
                    && !request.getRoundIndex().equals(state.currentRoundIndex)) {
                return toResponse(state, player.getEmail());
            }

            RoundQuestion q = state.questions.get(state.currentRoundIndex);
            long elapsedMs = Math.max(100L, now - state.roundStartedAtEpochMs);

            if (MODE_VOCAB.equals(state.mode)) {
                handleVocabSubmission(state, playerState, q, request != null ? request.getTextAnswer() : null, now,
                        elapsedMs);
            } else {
                String label = request != null ? request.getSelectedLabel() : null;
                handlePart5Submission(state, playerState, q, label, now, elapsedMs);
            }

            ArenaRoomResponse viewerSnapshot = toResponse(state, player.getEmail());
            broadcastRoom(state.roomCode, toResponse(state, null));
            return viewerSnapshot;
        }
    }

    private void handleVocabSubmission(
            RoomState state,
            ArenaRoomResponse.ArenaPlayerState playerState,
            RoundQuestion q,
            String rawGuess,
            long now,
            long elapsedMs) {
        String guess = rawGuess != null ? rawGuess.trim().toLowerCase(Locale.ROOT) : "";
        String target = q.targetWord != null ? q.targetWord.trim().toLowerCase(Locale.ROOT) : "";
        if (guess.isEmpty() || target.isEmpty()) {
            return;
        }

        if (guess.equals(target)) {
            playerState.setCorrectCount(playerState.getCorrectCount() + 1);
            playerState.setScore(playerState.getScore() + 10);
            playerState.setRoundWins(playerState.getRoundWins() + 1);
            playerState.setAnsweredCount(playerState.getAnsweredCount() + 1);
            playerState.setAnsweredCurrentRound(true);
            playerState.setLastRoundResponseMs(elapsedMs);
            playerState.setTotalResponseMs(playerState.getTotalResponseMs() + elapsedMs);

            int reward = elapsedMs <= 6000L ? 2 : 1;
            applyRoundDiamonds(state, playerState, reward);
            state.roundWinnerEmail = playerState.getEmail();
            state.roundWinnerName = playerState.getFullName();
            state.roundDiamondReward = reward;
            state.feedbackMessage = String.format(
                    Locale.ROOT,
                    "%s đoán đúng \"%s\" trong %.1fs (+%d 💎)!",
                    playerState.getFullName(),
                    q.targetWord,
                    elapsedMs / 1000.0,
                    reward);
            enterRevealPhase(state, now);
        } else {
            playerState.setLastRoundResponseMs(elapsedMs);
            state.feedbackMessage = playerState.getFullName() + " vừa thử \"" + guess + "\" chưa chính xác!";
            state.feedbackMessage = playerState.getFullName() + " vừa đoán chưa chính xác — thử lại nào!";
        }
    }

    private void handlePart5Submission(
            RoomState state,
            ArenaRoomResponse.ArenaPlayerState playerState,
            RoundQuestion q,
            String selectedLabel,
            long now,
            long elapsedMs) {
        Map<String, RoundSubmission> roundSubs = state.roundSubmissionsByRound.computeIfAbsent(
                state.currentRoundIndex,
                ignored -> new ConcurrentHashMap<>());
        if (roundSubs.containsKey(playerState.getEmail())) {
            return;
        }

        String picked = selectedLabel != null ? selectedLabel.trim().toUpperCase(Locale.ROOT) : "";
        boolean isCorrect = q.correctLabel != null && !picked.isEmpty() && q.correctLabel.equalsIgnoreCase(picked);

        playerState.setAnsweredCount(playerState.getAnsweredCount() + 1);
        playerState.setAnsweredCurrentRound(true);
        playerState.setLastRoundResponseMs(elapsedMs);
        playerState.setTotalResponseMs(playerState.getTotalResponseMs() + elapsedMs);
        if (isCorrect) {
            playerState.setCorrectCount(playerState.getCorrectCount() + 1);
            playerState.setScore(playerState.getScore() + 10);
        }

        roundSubs.put(playerState.getEmail(),
                new RoundSubmission(playerState.getEmail(), picked, isCorrect, elapsedMs));

        if (roundSubs.size() >= state.players.size()) {
            resolvePart5RoundWinner(state, q, roundSubs);
            enterRevealPhase(state, now);
        } else {
            state.feedbackMessage = playerState.getFullName() + " đã chốt đáp án — đang chờ đối thủ!";
        }
    }

    private void resolvePart5RoundWinner(
            RoomState state,
            RoundQuestion q,
            Map<String, RoundSubmission> roundSubs) {
        RoundSubmission fastestCorrect = roundSubs.values().stream()
                .filter(sub -> sub.correct)
                .min(Comparator.comparingLong(sub -> sub.elapsedMs))
                .orElse(null);

        if (fastestCorrect != null) {
            ArenaRoomResponse.ArenaPlayerState winner = state.players.get(fastestCorrect.email);
            if (winner != null) {
                winner.setRoundWins(winner.getRoundWins() + 1);
                int reward = fastestCorrect.elapsedMs <= 5000L ? 2 : 1;
                applyRoundDiamonds(state, winner, reward);
                state.roundWinnerEmail = winner.getEmail();
                state.roundWinnerName = winner.getFullName();
                state.roundDiamondReward = reward;
                state.feedbackMessage = String.format(
                        Locale.ROOT,
                        "%s thắng vòng này (đúng trong %.1fs, +%d 💎)!",
                        winner.getFullName(),
                        fastestCorrect.elapsedMs / 1000.0,
                        reward);
            }
        } else {
            state.roundWinnerEmail = null;
            state.roundWinnerName = null;
            state.roundDiamondReward = 0;
            state.feedbackMessage = "Cả hai chưa chọn đúng đáp án (" + q.correctLabel + ").";
        }
    }

    private void applyRoundDiamonds(RoomState state, ArenaRoomResponse.ArenaPlayerState winner, int gain) {
        winner.setDiamondDelta(winner.getDiamondDelta() + gain);
        winner.setDiamonds(Math.max(0, winner.getDiamonds() + gain));

        for (ArenaRoomResponse.ArenaPlayerState other : state.players.values()) {
            if (!other.getEmail().equalsIgnoreCase(winner.getEmail())) {
                if (other.getDiamonds() > 0) {
                    other.setDiamondDelta(other.getDiamondDelta() - 1);
                    other.setDiamonds(Math.max(0, other.getDiamonds() - 1));
                }
            }
        }
    }

    private void enterRevealPhase(RoomState state, long now) {
        state.roundPhase = "REVEAL";
        state.revealEndsAtEpochMs = now + REVEAL_DURATION_MS;
    }

    private void startFirstRound(RoomState state, long now) {
        state.status = "IN_PROGRESS";
        state.matchStartedAtEpochMs = now;
        startRound(state, 0, now);
    }

    private void startRound(RoomState state, int roundIdx, long now) {
        state.currentRoundIndex = roundIdx;
        state.roundPhase = "QUESTION";
        state.roundStartedAtEpochMs = now;
        state.roundEndsAtEpochMs = now + state.roundDurationSeconds * 1000L;
        state.revealEndsAtEpochMs = 0L;
        state.roundWinnerEmail = null;
        state.roundWinnerName = null;
        state.roundDiamondReward = 0;
        state.feedbackMessage = null;
        for (ArenaRoomResponse.ArenaPlayerState ps : state.players.values()) {
            ps.setAnsweredCurrentRound(false);
        }
    }

    private void advanceRoomClockIfNeeded(RoomState state, long now) {
        if (!"IN_PROGRESS".equals(state.status) || state.questions.isEmpty()) {
            return;
        }
        if ("QUESTION".equals(state.roundPhase) && now >= state.roundEndsAtEpochMs) {
            RoundQuestion q = state.questions.get(state.currentRoundIndex);
            if (MODE_PART5.equals(state.mode)) {
                Map<String, RoundSubmission> subs = state.roundSubmissionsByRound.getOrDefault(state.currentRoundIndex,
                        Map.of());
                resolvePart5RoundWinner(state, q, subs);
            } else {
                state.roundWinnerEmail = null;
                state.roundWinnerName = null;
                state.roundDiamondReward = 0;
                state.feedbackMessage = "Hết giờ! Đáp án là \"" + q.targetWord + "\".";
            }
            enterRevealPhase(state, now);
        }

        if ("REVEAL".equals(state.roundPhase) && now >= state.revealEndsAtEpochMs) {
            int nextIdx = state.currentRoundIndex + 1;
            if (nextIdx < state.questions.size()) {
                startRound(state, nextIdx, now);
            } else {
                state.status = "FINISHED";
                state.roundPhase = "FINISHED";
                state.matchEndedAtEpochMs = now;
                determineFinalWinner(state);
                finalizeMatchAndPersistStats(state);
            }
        }
    }

    private void determineFinalWinner(RoomState state) {
        List<ArenaRoomResponse.ArenaPlayerState> sorted = new ArrayList<>(state.players.values());
        sorted.sort(Comparator.comparingInt(ArenaRoomResponse.ArenaPlayerState::getRoundWins).reversed()
                .thenComparing(Comparator.comparingInt(ArenaRoomResponse.ArenaPlayerState::getCorrectCount).reversed())
                .thenComparing(Comparator.comparingInt(ArenaRoomResponse.ArenaPlayerState::getScore).reversed())
                .thenComparingLong(ArenaRoomResponse.ArenaPlayerState::getTotalResponseMs));

        if (sorted.size() >= 2) {
            ArenaRoomResponse.ArenaPlayerState first = sorted.get(0);
            ArenaRoomResponse.ArenaPlayerState second = sorted.get(1);
            boolean exactTie = first.getRoundWins() == second.getRoundWins()
                    && first.getCorrectCount() == second.getCorrectCount()
                    && first.getScore() == second.getScore()
                    && Math.abs(first.getTotalResponseMs() - second.getTotalResponseMs()) < 150L;
            if (exactTie) {
                state.winnerEmail = null;
                state.winnerName = "Hòa";
                return;
            }
        }
        if (!sorted.isEmpty()) {
            state.winnerEmail = sorted.get(0).getEmail();
            state.winnerName = sorted.get(0).getFullName();
        }
    }

    private void finalizeMatchAndPersistStats(RoomState state) {
        if (state.rewardsPersisted) {
            return;
        }
        state.rewardsPersisted = true;

        boolean isDraw = state.winnerEmail == null;
        for (ArenaRoomResponse.ArenaPlayerState ps : state.players.values()) {
            int bonus = 0;
            int eloDelta = 0;
            boolean won = false;
            boolean lost = false;

            if (isDraw) {
                bonus = MATCH_DRAW_BONUS_DIAMONDS;
                eloDelta = 3;
            } else if (ps.getEmail().equalsIgnoreCase(state.winnerEmail)) {
                bonus = MATCH_WIN_BONUS_DIAMONDS;
                eloDelta = 18;
                won = true;
            } else {
                eloDelta = -10;
                lost = true;
            }

            ps.setDiamondDelta(ps.getDiamondDelta() + bonus);
            ps.setDiamonds(Math.max(0, ps.getDiamonds() + bonus));
            ps.setEloRating(Math.max(100, ps.getEloRating() + eloDelta));
            if (won)
                ps.setWins(ps.getWins() + 1);
            if (lost)
                ps.setLosses(ps.getLosses() + 1);

            try {
                User dbUser = userRepository.findByEmail(ps.getEmail()).orElse(null);
                if (dbUser != null) {
                    int baseDiamonds = dbUser.getDiamonds() != null ? dbUser.getDiamonds() : 50;
                    dbUser.setDiamonds(Math.max(0, baseDiamonds + ps.getDiamondDelta()));
                    int matchXp = won ? 40 : (isDraw ? 25 : 15);
                    int updatedXp = Math.max(0, (dbUser.getLearningXp() != null ? dbUser.getLearningXp() : 0) + matchXp);
                    dbUser.setLearningXp(updatedXp);
                    ps.setLevel(LevelCalculator.fromXp(updatedXp).level());
                    dbUser.setArenaElo(
                            Math.max(100, (dbUser.getArenaElo() != null ? dbUser.getArenaElo() : 1000) + eloDelta));
                    if (won) {
                        dbUser.setArenaWins((dbUser.getArenaWins() != null ? dbUser.getArenaWins() : 0) + 1);
                    } else if (lost) {
                        dbUser.setArenaLosses((dbUser.getArenaLosses() != null ? dbUser.getArenaLosses() : 0) + 1);
                    }
                    userRepository.save(dbUser);
                }
            } catch (Exception ignored) {
                // Keep in-memory state intact even in strict mocked test contexts
            }
            matchedRoomByEmail.remove(ps.getEmail());
        }
    }

    // =========================================================================
    // QUERIES: GET ROOM, LIST ROOMS, LEADERBOARD
    // =========================================================================

    @Transactional
    public ArenaRoomResponse getRoom(String roomCode) {
        return getRoom(null, roomCode);
    }

    @Transactional
    public ArenaRoomResponse getRoom(String viewerEmail, String roomCode) {
        RoomState state = findRoom(roomCode);
        synchronized (state) {
            advanceRoomClockIfNeeded(state, System.currentTimeMillis());
            return toResponse(state, viewerEmail);
        }
    }

    public List<ArenaRoomResponse> listRooms() {
        LocalDateTime waitCutoff = LocalDateTime.now().minusMinutes(30);
        LocalDateTime doneCutoff = LocalDateTime.now().minusMinutes(5);
        rooms.entrySet().removeIf(e -> {
            RoomState r = e.getValue();
            if ("FINISHED".equals(r.status) && r.createdAt.isBefore(doneCutoff))
                return true;
            return "WAITING".equals(r.status) && r.createdAt.isBefore(waitCutoff);
        });

        long now = System.currentTimeMillis();
        return rooms.values().stream()
                .filter(r -> "ROOM".equals(r.matchType) && !"FINISHED".equals(r.status))
                .sorted(Comparator.comparing((RoomState r) -> "WAITING".equals(r.status) ? 0 : 1)
                        .thenComparing(Comparator.comparing((RoomState r) -> r.createdAt).reversed()))
                .limit(20)
                .map(r -> {
                    synchronized (r) {
                        advanceRoomClockIfNeeded(r, now);
                        return toResponse(r, null);
                    }
                })
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public ArenaLeaderboardResponse getLeaderboard(String email) {
        User me = findUser(email);
        ArenaLeaderboardResponse out = new ArenaLeaderboardResponse();
        out.setMyDiamonds(me.getDiamonds() != null ? me.getDiamonds() : 50);
        out.setMyElo(me.getArenaElo() != null ? me.getArenaElo() : 1000);
        int myW = me.getArenaWins() != null ? me.getArenaWins() : 0;
        int myL = me.getArenaLosses() != null ? me.getArenaLosses() : 0;
        out.setMyWins(myW);
        out.setMyLosses(myL);
        out.setMyWinRate((myW + myL) > 0 ? Math.round((myW * 100f) / (myW + myL)) : 0);

        List<User> topUsers = userRepository.findTop20ByOrderByArenaEloDescArenaWinsDescDiamondsDesc();
        List<ArenaLeaderboardResponse.LeaderboardEntry> entries = new ArrayList<>();
        int rank = 1;
        for (User u : topUsers) {
            ArenaLeaderboardResponse.LeaderboardEntry item = new ArenaLeaderboardResponse.LeaderboardEntry();
            item.setRank(rank++);
            item.setUserId(u.getId());
            item.setFullName(resolveDisplayName(u));
            item.setUsername(DiamondRewardService.resolveUsername(u));
            item.setAvatarUrl(u.getAvatarUrl());
            item.setEquippedFrameId(u.getEquippedFrameId());
            int xp = u.getLearningXp() != null ? u.getLearningXp() : 0;
            item.setLevel(LevelCalculator.fromXp(xp).level());
            item.setElo(u.getArenaElo() != null ? u.getArenaElo() : 1000);
            int w = u.getArenaWins() != null ? u.getArenaWins() : 0;
            int l = u.getArenaLosses() != null ? u.getArenaLosses() : 0;
            item.setWins(w);
            item.setLosses(l);
            item.setWinRate((w + l) > 0 ? Math.round((w * 100f) / (w + l)) : 0);
            item.setDiamonds(u.getDiamonds() != null ? u.getDiamonds() : 50);
            entries.add(item);
        }
        out.setEntries(entries);
        return out;
    }

    // =========================================================================
    // QUESTION BUILDERS (VOCAB BATTLE & TOEIC PART 5)
    // =========================================================================

    private RoomState buildRoomState(
            User host,
            String mode,
            int count,
            String matchType,
            boolean isPrivate,
            String password) {
        String code = generateUniqueRoomCode();
        RoomState state = new RoomState();
        state.roomCode = code;
        state.mode = mode;
        state.matchType = matchType;
        state.privateRoom = isPrivate;
        state.password = password;
        state.hostName = resolveDisplayName(host);
        state.hostEmail = host.getEmail();
        state.createdAt = LocalDateTime.now();
        state.roundDurationSeconds = MODE_VOCAB.equals(mode) ? DEFAULT_ROUND_SECONDS_VOCAB
                : DEFAULT_ROUND_SECONDS_PART5;
        state.questions = MODE_VOCAB.equals(mode) ? loadVocabQuestions(count) : loadPart5Questions(count);
        state.players.put(host.getEmail(), newPlayerState(host));
        return state;
    }

    private List<RoundQuestion> loadVocabQuestions(int count) {
        List<RoundQuestion> out = new ArrayList<>();
        Set<String> usedWords = new HashSet<>();

        if (vocabularyRepository != null) {
            List<Vocabulary> all = new ArrayList<>(vocabularyRepository.findAllByOrderByIdAsc());
            Collections.shuffle(all);
            for (Vocabulary v : all) {
                if (out.size() >= count)
                    break;
                String word = v.getWord() != null ? v.getWord().trim() : "";
                if (!word.matches("^[A-Za-z]{4,13}$"))
                    continue;
                if (isBlank(v.getMeaningEn()) || isBlank(v.getExampleSentence()))
                    continue;
                String lower = word.toLowerCase(Locale.ROOT);
                if (!usedWords.add(lower))
                    continue;

                RoundQuestion rq = new RoundQuestion();
                rq.questionId = v.getId() != null ? v.getId() : (long) (-(out.size() + 10));
                rq.type = MODE_VOCAB;
                rq.partNo = 0;
                rq.targetWord = lower;
                rq.meaningVi = v.getMeaningVi();
                rq.explanation = v.getMeaningEn().trim();
                rq.rawExample = v.getExampleSentence().trim();
                rq.maskedExample = maskWordInExample(rq.rawExample, lower);
                rq.exampleTranslation = !isBlank(v.getExampleTranslation()) ? v.getExampleTranslation().trim() : null;
                rq.partOfSpeech = !isBlank(v.getPartOfSpeech()) ? v.getPartOfSpeech().trim().toLowerCase(Locale.ROOT)
                        : "word";
                rq.pronunciation = !isBlank(v.getIpa()) ? v.getIpa().trim() : "";
                rq.topicName = !isBlank(v.getDifficultyLevel())
                        ? "TOEIC " + v.getDifficultyLevel().trim().toUpperCase(Locale.ROOT)
                        : "TOEIC Core Vocabulary";
                rq.questionText = rq.explanation;
                out.add(rq);
            }
        }

        List<VocabStarterPrompt> starters = new ArrayList<>(STARTER_VOCAB_PROMPTS);
        Collections.shuffle(starters);
        for (VocabStarterPrompt sp : starters) {
            if (out.size() >= count)
                break;
            if (!usedWords.add(sp.word))
                continue;
            RoundQuestion rq = new RoundQuestion();
            rq.questionId = sp.id;
            rq.type = MODE_VOCAB;
            rq.partNo = 0;
            rq.targetWord = sp.word;
            rq.meaningVi = sp.meaningVi;
            rq.explanation = sp.explanation;
            rq.explanationVi = sp.explanationVi;
            rq.maskedExample = maskWordInExample(sp.example, sp.word);
            rq.exampleTranslation = sp.exampleVi;
            rq.partOfSpeech = sp.partOfSpeech;
            rq.pronunciation = sp.ipa;
            rq.topicName = "TOEIC Essential Vocabulary";
            rq.questionText = sp.explanation;
            out.add(rq);
        }
        populateVietnameseTranslations(out);
        return out;
    }

    private List<RoundQuestion> loadPart5Questions(int count) {
        List<RoundQuestion> out = new ArrayList<>();
        List<Question> bank = new ArrayList<>(questionRepository.findAllByOrderByCreatedAtDesc());
        Collections.shuffle(bank);

        for (Question q : bank) {
            if (out.size() >= count)
                break;
            if (q.getPartNo() != null && q.getPartNo() != 5)
                continue;
            if (q.getOptions() == null || q.getOptions().size() < 2)
                continue;
            String correct = q.getOptions().stream()
                    .filter(o -> Boolean.TRUE.equals(o.getCorrect()))
                    .map(o -> o.getOptionLabel())
                    .findFirst()
                    .orElse(null);
            if (correct == null)
                continue;

            RoundQuestion rq = new RoundQuestion();
            rq.questionId = q.getId();
            rq.type = MODE_PART5;
            rq.partNo = q.getPartNo() != null ? q.getPartNo() : 5;
            rq.questionText = q.getQuestionText();
            rq.correctLabel = correct.toUpperCase(Locale.ROOT);
            rq.explanation = !isBlank(q.getExplanation()) ? q.getExplanation()
                    : "Đáp án đúng là " + rq.correctLabel + ".";
            rq.options = q.getOptions().stream()
                    .sorted(Comparator.comparing(o -> o.getOptionLabel() != null ? o.getOptionLabel() : ""))
                    .map(opt -> {
                        ArenaRoomResponse.ArenaOptionItem oi = new ArenaRoomResponse.ArenaOptionItem();
                        oi.setOptionLabel(opt.getOptionLabel());
                        oi.setOptionText(opt.getOptionText());
                        return oi;
                    })
                    .collect(Collectors.toList());
            out.add(rq);
        }

        List<StarterPrompt> fallbacks = new ArrayList<>(STARTER_PART5_PROMPTS);
        Collections.shuffle(fallbacks);
        for (StarterPrompt sp : fallbacks) {
            if (out.size() >= count)
                break;
            RoundQuestion rq = new RoundQuestion();
            rq.questionId = sp.id;
            rq.type = MODE_PART5;
            rq.partNo = 5;
            rq.questionText = sp.text;
            rq.questionTranslationVi = sp.textVi;
            rq.correctLabel = sp.correctLabel;
            rq.explanation = sp.explanation;
            List<ArenaRoomResponse.ArenaOptionItem> opts = new ArrayList<>();
            sp.options.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(e -> {
                ArenaRoomResponse.ArenaOptionItem oi = new ArenaRoomResponse.ArenaOptionItem();
                oi.setOptionLabel(e.getKey());
                oi.setOptionText(e.getValue());
                opts.add(oi);
            });
            rq.options = opts;
            out.add(rq);
        }
        populateVietnameseTranslations(out);
        return out;
    }

    private void populateVietnameseTranslations(List<RoundQuestion> questions) {
        if (questions == null || questions.isEmpty()) {
            return;
        }
        Set<String> pendingSet = new LinkedHashSet<>();
        for (RoundQuestion rq : questions) {
            if (MODE_VOCAB.equals(rq.type)) {
                if (isBlank(rq.explanationVi) && !isBlank(rq.explanation)) {
                    String cached = viTranslationCache.get(rq.explanation);
                    if (cached != null) {
                        rq.explanationVi = cached;
                    } else {
                        pendingSet.add(rq.explanation);
                    }
                }
                if (isBlank(rq.exampleTranslation) && !isBlank(rq.rawExample)) {
                    String cachedEx = viTranslationCache.get(rq.rawExample);
                    if (cachedEx != null) {
                        rq.exampleTranslation = cachedEx;
                    } else {
                        pendingSet.add(rq.rawExample);
                    }
                }
            } else {
                if (isBlank(rq.questionTranslationVi) && !isBlank(rq.questionText)) {
                    String cached = viTranslationCache.get(rq.questionText);
                    if (cached != null) {
                        rq.questionTranslationVi = cached;
                    } else {
                        pendingSet.add(rq.questionText);
                    }
                }
            }
        }

        if (!pendingSet.isEmpty() && subtitleTranslationService != null) {
            try {
                List<String> batch = new ArrayList<>(pendingSet);
                List<String> translated = subtitleTranslationService.translateBatchToVietnamese(batch,
                        "TOEIC Arena Battle");
                for (int i = 0; i < Math.min(batch.size(), translated.size()); i++) {
                    String vi = translated.get(i);
                    if (!isBlank(vi)) {
                        viTranslationCache.put(batch.get(i), vi.trim());
                    }
                }
            } catch (Exception ignored) {
                // Keep English fallback gracefully when translator is unavailable
            }
        }

        for (RoundQuestion rq : questions) {
            if (MODE_VOCAB.equals(rq.type)) {
                if (isBlank(rq.explanationVi) && !isBlank(rq.explanation)) {
                    rq.explanationVi = viTranslationCache.getOrDefault(rq.explanation, rq.meaningVi);
                }
                if (isBlank(rq.exampleTranslation) && !isBlank(rq.rawExample)) {
                    rq.exampleTranslation = viTranslationCache.get(rq.rawExample);
                }
                if (!isBlank(rq.targetWord)) {
                    if (!isBlank(rq.explanationVi)) {
                        rq.explanationVi = maskWordInExample(rq.explanationVi, rq.targetWord);
                    }
                    if (!isBlank(rq.exampleTranslation)) {
                        rq.exampleTranslation = maskWordInExample(rq.exampleTranslation, rq.targetWord);
                    }
                }
            } else {
                if (isBlank(rq.questionTranslationVi) && !isBlank(rq.questionText)) {
                    rq.questionTranslationVi = viTranslationCache.get(rq.questionText);
                }
            }
        }
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    private void removeUserFromAllQueuesLocked(String email) {
        for (Deque<QueueTicket> q : matchmakingQueues.values()) {
            q.removeIf(t -> t.email.equalsIgnoreCase(email));
        }
    }

    private void purgeStaleQueueEntriesLocked(long now) {
        for (Deque<QueueTicket> q : matchmakingQueues.values()) {
            q.removeIf(t -> (now - t.lastHeartbeatMs) > QUEUE_HEARTBEAT_TIMEOUT_MS);
        }
    }

    private String maskWordInExample(String example, String word) {
        if (isBlank(example) || isBlank(word))
            return example;
        String stars = "*".repeat(word.length());
        String root = word.length() >= 5 ? word.substring(0, word.length() - 1) : word;
        Pattern p = Pattern.compile("(?i)\\b" + Pattern.quote(root) + "[a-z]*\\b");
        Matcher m = p.matcher(example);
        if (m.find()) {
            return m.replaceAll(stars);
        }
        return example.replaceAll("(?i)" + Pattern.quote(word), stars);
    }

    private String computeHintMask(RoundQuestion q, RoomState state, long now) {
        if (!MODE_VOCAB.equals(q.type) || isBlank(q.targetWord)) {
            return null;
        }
        String word = q.targetWord;
        if ("REVEAL".equals(state.roundPhase) || "FINISHED".equals(state.roundPhase)) {
            return word;
        }
        long elapsedMs = Math.max(0L, now - state.roundStartedAtEpochMs);
        long totalMs = Math.max(1000L, state.roundDurationSeconds * 1000L);
        double progress = (double) elapsedMs / totalMs;

        char[] chars = new char[word.length()];
        Arrays.fill(chars, '_');
        if (progress >= 0.35 && word.length() >= 3) {
            chars[0] = word.charAt(0);
            chars[word.length() - 1] = word.charAt(word.length() - 1);
        }
        if (progress >= 0.70 && word.length() >= 6) {
            int mid = word.length() / 2;
            chars[mid] = word.charAt(mid);
        }
        return new String(chars);
    }

    private ArenaRoomResponse toResponse(RoomState state, String viewerEmail) {
        long now = System.currentTimeMillis();
        ArenaRoomResponse res = new ArenaRoomResponse();
        res.setRoomCode(state.roomCode);
        res.setStatus(state.status);
        res.setMode(state.mode);
        res.setMatchType(state.matchType);
        res.setPrivateRoom(state.privateRoom);
        res.setHasPassword(state.privateRoom);
        res.setHostName(state.hostName);
        res.setHostEmail(state.hostEmail);
        res.setWinnerName(state.winnerName);
        res.setWinnerEmail(state.winnerEmail);
        res.setTotalQuestions(state.questions.size());
        res.setCurrentRoundIndex(state.currentRoundIndex);
        res.setRoundPhase(state.roundPhase);
        res.setRoundDurationSeconds(state.roundDurationSeconds);

        int remainingSec = 0;
        if ("IN_PROGRESS".equals(state.status)) {
            if ("QUESTION".equals(state.roundPhase)) {
                remainingSec = Math.max(0, (int) Math.ceil((state.roundEndsAtEpochMs - now) / 1000.0));
            } else if ("REVEAL".equals(state.roundPhase)) {
                remainingSec = Math.max(0, (int) Math.ceil((state.revealEndsAtEpochMs - now) / 1000.0));
            }
        }
        res.setRemainingSeconds(remainingSec);

        if (state.matchStartedAtEpochMs > 0) {
            long endRef = state.matchEndedAtEpochMs > 0 ? state.matchEndedAtEpochMs : now;
            res.setElapsedMatchSeconds(Math.max(0, (int) ((endRef - state.matchStartedAtEpochMs) / 1000L)));
        }

        res.setRoundWinnerName(state.roundWinnerName);
        res.setRoundWinnerEmail(state.roundWinnerEmail);
        res.setRoundDiamondReward(state.roundDiamondReward);
        res.setFeedbackMessage(state.feedbackMessage);
        if (state.latestEmote != null && (now - state.latestEmote.getSentAtEpochMs()) <= EMOTE_TTL_MS) {
            res.setLatestEmote(copyEmote(state.latestEmote));
        }
        res.setCreatedAt(state.createdAt);

        boolean audioHintUnlocked = "REVEAL".equals(state.roundPhase)
                || "FINISHED".equals(state.roundPhase)
                || ("IN_PROGRESS".equals(state.status)
                        && "QUESTION".equals(state.roundPhase)
                        && remainingSec <= VOCAB_AUDIO_HINT_LAST_SECONDS);
        res.setAudioHintUnlocked(audioHintUnlocked);
        res.setAudioHintUnlockAtSeconds(VOCAB_AUDIO_HINT_LAST_SECONDS);

        if (state.currentRoundIndex >= 0 && state.currentRoundIndex < state.questions.size()) {
            RoundQuestion activeQ = state.questions.get(state.currentRoundIndex);
            if (audioHintUnlocked && MODE_VOCAB.equals(state.mode)) {
                res.setAudioHintWord(activeQ.targetWord);
            }
            if ("REVEAL".equals(state.roundPhase) || "FINISHED".equals(state.roundPhase)) {
                res.setCurrentRevealWord(activeQ.targetWord);
                res.setCurrentRevealMeaningVi(activeQ.meaningVi);
                res.setCurrentRevealCorrectLabel(activeQ.correctLabel);
                res.setCurrentRevealExplanation(activeQ.explanation);
            }
        }

        List<ArenaRoomResponse.ArenaPlayerState> playersCopy = state.players.values().stream()
                .map(p -> copyPlayerState(p, now))
                .collect(Collectors.toList());
        res.setPlayers(playersCopy);

        List<ArenaRoomResponse.ArenaQuestionItem> qItems = new ArrayList<>();
        for (int i = 0; i < state.questions.size(); i++) {
            RoundQuestion rq = state.questions.get(i);
            ArenaRoomResponse.ArenaQuestionItem item = new ArenaRoomResponse.ArenaQuestionItem();
            item.setQuestionId(rq.questionId);
            item.setPartNo(rq.partNo);
            item.setType(rq.type);
            item.setQuestionText(rq.questionText);
            item.setWordLength(rq.targetWord != null ? rq.targetWord.length() : null);
            if (i == state.currentRoundIndex) {
                item.setHintMask(computeHintMask(rq, state, now));
            } else if (i < state.currentRoundIndex || "FINISHED".equals(state.status)) {
                item.setHintMask(rq.targetWord);
            } else {
                item.setHintMask(rq.targetWord != null ? "_".repeat(rq.targetWord.length()) : null);
            }
            item.setExplanation(rq.explanation);
            item.setExplanationVi(rq.explanationVi);
            item.setMeaningVi(rq.meaningVi);
            item.setMaskedExample(rq.maskedExample);
            item.setExampleTranslation(rq.exampleTranslation);
            item.setQuestionTranslationVi(rq.questionTranslationVi);
            item.setPartOfSpeech(rq.partOfSpeech);
            boolean exposePronunciation = i < state.currentRoundIndex
                    || "FINISHED".equals(state.status)
                    || (i == state.currentRoundIndex && audioHintUnlocked);
            item.setPronunciation(exposePronunciation ? rq.pronunciation : null);
            item.setTopicName(rq.topicName);
            item.setOptions(rq.options);
            qItems.add(item);
        }
        res.setQuestions(qItems);
        return res;
    }

    public ArenaRoomResponse sendEmote(String email, String roomCode, String rawEmoteCode) {
        User player = findUser(email);
        RoomState state = findRoom(roomCode);

        String code = rawEmoteCode != null ? rawEmoteCode.trim().toUpperCase(Locale.ROOT) : "";
        EmotePreset preset = EMOTE_PRESETS.get(code);
        if (preset == null) {
            throw new AppException(ErrorCode.ARENA_ROOM_INVALID);
        }

        synchronized (state) {
            long now = System.currentTimeMillis();
            advanceRoomClockIfNeeded(state, now);

            ArenaRoomResponse.ArenaPlayerState ps = state.players.get(player.getEmail());
            if (ps == null) {
                throw new AppException(ErrorCode.ARENA_ROOM_INVALID);
            }

            ArenaRoomResponse.ArenaEmoteEvent prev = ps.getActiveEmote();
            if (prev != null && (now - prev.getSentAtEpochMs()) < EMOTE_COOLDOWN_MS) {
                return toResponse(state, player.getEmail());
            }

            ArenaRoomResponse.ArenaEmoteEvent event = new ArenaRoomResponse.ArenaEmoteEvent();
            event.setId(state.emoteSeq.incrementAndGet());
            event.setSenderEmail(player.getEmail());
            event.setSenderName(ps.getFullName());
            event.setEmoteCode(preset.code());
            event.setEmoji(preset.emoji());
            event.setLabel(preset.label());
            event.setSentAtEpochMs(now);

            ps.setActiveEmote(event);
            state.latestEmote = event;

            ArenaRoomResponse snapshot = toResponse(state, player.getEmail());
            broadcastRoom(state.roomCode, toResponse(state, null));
            return snapshot;
        }
    }

    private ArenaRoomResponse.ArenaPlayerState copyPlayerState(ArenaRoomResponse.ArenaPlayerState src, long now) {
        ArenaRoomResponse.ArenaPlayerState dst = new ArenaRoomResponse.ArenaPlayerState();
        dst.setUserId(src.getUserId());
        dst.setEmail(src.getEmail());
        dst.setFullName(src.getFullName());
        dst.setUsername(src.getUsername());
        dst.setAvatarUrl(src.getAvatarUrl());
        dst.setEquippedFrameId(src.getEquippedFrameId());
        dst.setLevel(src.getLevel());
        dst.setScore(src.getScore());
        dst.setRoundWins(src.getRoundWins());
        dst.setCorrectCount(src.getCorrectCount());
        dst.setAnsweredCount(src.getAnsweredCount());
        dst.setDiamonds(src.getDiamonds());
        dst.setDiamondDelta(src.getDiamondDelta());
        dst.setTotalResponseMs(src.getTotalResponseMs());
        dst.setLastRoundResponseMs(src.getLastRoundResponseMs());
        dst.setAnsweredCurrentRound(src.isAnsweredCurrentRound());
        dst.setEloRating(src.getEloRating());
        dst.setWins(src.getWins());
        dst.setLosses(src.getLosses());
        if (src.getActiveEmote() != null && (now - src.getActiveEmote().getSentAtEpochMs()) <= EMOTE_TTL_MS) {
            dst.setActiveEmote(copyEmote(src.getActiveEmote()));
        }
        return dst;
    }

    private ArenaRoomResponse.ArenaEmoteEvent copyEmote(ArenaRoomResponse.ArenaEmoteEvent src) {
        ArenaRoomResponse.ArenaEmoteEvent copy = new ArenaRoomResponse.ArenaEmoteEvent();
        copy.setId(src.getId());
        copy.setSenderEmail(src.getSenderEmail());
        copy.setSenderName(src.getSenderName());
        copy.setEmoteCode(src.getEmoteCode());
        copy.setEmoji(src.getEmoji());
        copy.setLabel(src.getLabel());
        copy.setSentAtEpochMs(src.getSentAtEpochMs());
        return copy;
    }

    private void broadcastRoom(String roomCode, ArenaRoomResponse snapshot) {
        if (messagingTemplate == null)
            return;
        try {
            messagingTemplate.convertAndSend("/topic/arena/" + roomCode, snapshot);
        } catch (Exception ignored) {
        }
    }

    private ArenaRoomResponse.ArenaPlayerState newPlayerState(User user) {
        ArenaRoomResponse.ArenaPlayerState ps = new ArenaRoomResponse.ArenaPlayerState();
        ps.setUserId(user.getId());
        ps.setEmail(user.getEmail());
        ps.setFullName(resolveDisplayName(user));
        ps.setUsername(DiamondRewardService.resolveUsername(user));
        ps.setAvatarUrl(user.getAvatarUrl());
        ps.setEquippedFrameId(user.getEquippedFrameId());
        int xp = user.getLearningXp() != null ? user.getLearningXp() : 0;
        ps.setLevel(LevelCalculator.fromXp(xp).level());
        ps.setDiamonds(user.getDiamonds() != null ? user.getDiamonds() : 50);
        ps.setEloRating(user.getArenaElo() != null ? user.getArenaElo() : 1000);
        ps.setWins(user.getArenaWins() != null ? user.getArenaWins() : 0);
        ps.setLosses(user.getArenaLosses() != null ? user.getArenaLosses() : 0);
        return ps;
    }

    private String resolveDisplayName(User user) {
        return user.getFullName() != null && !user.getFullName().isBlank() ? user.getFullName() : user.getEmail();
    }

    private String normalizeMode(String rawMode) {
        if (rawMode == null)
            return MODE_PART5;
        String upper = rawMode.trim().toUpperCase(Locale.ROOT);
        return MODE_VOCAB.equals(upper) ? MODE_VOCAB : MODE_PART5;
    }

    private String generateUniqueRoomCode() {
        for (int i = 0; i < 10; i++) {
            String code = UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase(Locale.ROOT);
            if (!rooms.containsKey(code)) {
                return code;
            }
        }
        return UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase(Locale.ROOT);
    }

    private RoomState findRoom(String code) {
        if (code == null || code.isBlank()) {
            throw new AppException(ErrorCode.ARENA_ROOM_NOT_FOUND);
        }
        RoomState room = rooms.get(code.trim().toUpperCase(Locale.ROOT));
        if (room == null) {
            throw new AppException(ErrorCode.ARENA_ROOM_NOT_FOUND);
        }
        return room;
    }

    private User findUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
    }

    private boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }

    private static final class RoomState {
        String roomCode;
        String mode = MODE_PART5;
        String matchType = "ROOM";
        boolean privateRoom;
        String password;
        String status = "WAITING";
        String hostName;
        String hostEmail;
        String winnerName;
        String winnerEmail;
        int currentRoundIndex = 0;
        String roundPhase = "WAITING";
        int roundDurationSeconds = DEFAULT_ROUND_SECONDS_PART5;
        long matchStartedAtEpochMs;
        long matchEndedAtEpochMs;
        long roundStartedAtEpochMs;
        long roundEndsAtEpochMs;
        long revealEndsAtEpochMs;
        String roundWinnerName;
        String roundWinnerEmail;
        int roundDiamondReward;
        String feedbackMessage;
        boolean rewardsPersisted;
        LocalDateTime createdAt;
        AtomicLong emoteSeq = new AtomicLong(0);
        ArenaRoomResponse.ArenaEmoteEvent latestEmote;
        List<RoundQuestion> questions = new ArrayList<>();
        Map<String, ArenaRoomResponse.ArenaPlayerState> players = new ConcurrentHashMap<>();
        Map<Integer, Map<String, RoundSubmission>> roundSubmissionsByRound = new ConcurrentHashMap<>();
    }

    private record EmotePreset(String code, String emoji, String label) {
    }

    private static final class RoundQuestion {
        Long questionId;
        Integer partNo;
        String type;
        String questionText;
        String questionTranslationVi;
        String correctLabel;
        String targetWord;
        String meaningVi;
        String explanation;
        String explanationVi;
        String rawExample;
        String maskedExample;
        String exampleTranslation;
        String partOfSpeech;
        String pronunciation;
        String topicName;
        List<ArenaRoomResponse.ArenaOptionItem> options;
    }

    private record RoundSubmission(String email, String selectedLabel, boolean correct, long elapsedMs) {
    }

    private static final class QueueTicket {
        final String email;
        final String mode;
        final int questionCount;
        final long joinedAtMs;
        long lastHeartbeatMs;

        QueueTicket(String email, String mode, int questionCount, long joinedAtMs, long lastHeartbeatMs) {
            this.email = email;
            this.mode = mode;
            this.questionCount = questionCount;
            this.joinedAtMs = joinedAtMs;
            this.lastHeartbeatMs = lastHeartbeatMs;
        }
    }

    private static final class StarterPrompt {
        final Long id;
        final String text;
        final String textVi;
        final String correctLabel;
        final String explanation;
        final Map<String, String> options;

        StarterPrompt(Long id, String text, String textVi, String correctLabel, String explanation,
                Map<String, String> options) {
            this.id = id;
            this.text = text;
            this.textVi = textVi;
            this.correctLabel = correctLabel;
            this.explanation = explanation;
            this.options = options;
        }
    }

    private static final class VocabStarterPrompt {
        final Long id;
        final String word;
        final String partOfSpeech;
        final String ipa;
        final String meaningVi;
        final String explanation;
        final String explanationVi;
        final String example;
        final String exampleVi;

        VocabStarterPrompt(
                Long id,
                String word,
                String partOfSpeech,
                String ipa,
                String meaningVi,
                String explanation,
                String explanationVi,
                String example,
                String exampleVi) {
            this.id = id;
            this.word = word;
            this.partOfSpeech = partOfSpeech;
            this.ipa = ipa;
            this.meaningVi = meaningVi;
            this.explanation = explanation;
            this.explanationVi = explanationVi;
            this.example = example;
            this.exampleVi = exampleVi;
        }
    }

    private static final List<StarterPrompt> STARTER_PART5_PROMPTS = List.of(
            new StarterPrompt(-101L,
                    "The quarterly budget report must be submitted _______ Friday at 5:00 PM.",
                    "Báo cáo ngân sách hàng quý phải được nộp _______ thứ Sáu lúc 5 giờ chiều.",
                    "A",
                    "'by + mốc thời gian' dùng để chỉ hạn chót phải hoàn thành việc gì.",
                    Map.of("A", "by", "B", "until", "C", "since", "D", "within")),
            new StarterPrompt(-102L,
                    "Ms. Sato was promoted because she handled the client negotiations very _______.",
                    "Bà Sato được thăng chức vì đã xử lý các cuộc đàm phán khách hàng rất _______.",
                    "C",
                    "Cần trạng từ 'effectively' để bổ nghĩa cho động từ 'handled'.",
                    Map.of("A", "effect", "B", "effective", "C", "effectively", "D", "effectiveness")),
            new StarterPrompt(-103L,
                    "All conference attendees are asked to wear their identification badges _______ the seminar.",
                    "Tất cả người tham dự hội nghị được yêu cầu đeo thẻ nhận dạng _______ buổi hội thảo.",
                    "B",
                    "'during + danh từ' dùng để chỉ khoảng thời gian diễn ra sự kiện.",
                    Map.of("A", "while", "B", "during", "C", "among", "D", "between")),
            new StarterPrompt(-104L,
                    "The maintenance team _______ the lobby lighting before the VIP guests arrived.",
                    "Đội bảo trì _______ hệ thống đèn sảnh trước khi các khách VIP đến.",
                    "D",
                    "Hành động xảy ra trước một mốc quá khứ dùng quá khứ hoàn thành 'had replaced'.",
                    Map.of("A", "will replace", "B", "replaces", "C", "replacing", "D", "had replaced")),
            new StarterPrompt(-105L,
                    "_______ the heavy rain, the outdoor company picnic was moved to the main hall.",
                    "_______ cơn mưa lớn, buổi dã ngoại ngoài trời của công ty đã được chuyển vào sảnh chính.",
                    "A",
                    "'Due to + cụm danh từ' nghĩa là bởi vì.",
                    Map.of("A", "Due to", "B", "Because", "C", "Although", "D", "Despite")),
            new StarterPrompt(-106L,
                    "Mr. Chen has decided to _______ the branch manager position in Singapore.",
                    "Ông Chen đã quyết định _______ vị trí quản lý chi nhánh tại Singapore.",
                    "B",
                    "'accept the position' nghĩa là chấp nhận vị trí công việc.",
                    Map.of("A", "acceptance", "B", "accept", "C", "acceptable", "D", "acceptably")),
            new StarterPrompt(-107L,
                    "Each employee is required to submit a _______ expense report at month-end.",
                    "Mỗi nhân viên được yêu cầu nộp một báo cáo chi phí _______ vào cuối tháng.",
                    "D",
                    "Cần tính từ 'detailed' đứng trước cụm danh từ 'expense report'.",
                    Map.of("A", "detail", "B", "details", "C", "detailing", "D", "detailed")),
            new StarterPrompt(-108L,
                    "The newly installed software allows staff to share files _______ across departments.",
                    "Phần mềm mới cài đặt cho phép nhân viên chia sẻ tệp _______ giữa các phòng ban.",
                    "C",
                    "Cần trạng từ 'seamlessly' (một cách liền mạch) bổ nghĩa cho động từ 'share'.",
                    Map.of("A", "seamless", "B", "seamlessness", "C", "seamlessly", "D", "seams")),
            new StarterPrompt(-109L,
                    "Please contact customer support _______ you have any questions about your invoice.",
                    "Vui lòng liên hệ bộ phận hỗ trợ khách hàng _______ bạn có bất kỳ câu hỏi nào về hóa đơn.",
                    "A",
                    "'if' giới thiệu câu điều kiện loại 1 lịch sự với mệnh lệnh thức.",
                    Map.of("A", "if", "B", "whether", "C", "despite", "D", "unless")),
            new StarterPrompt(-110L,
                    "Factory output increased _______ 15 percent after the automated line opened.",
                    "Sản lượng nhà máy đã tăng _______ 15 phần trăm sau khi dây chuyền tự động đi vào hoạt động.",
                    "B",
                    "'increase by + phần trăm' chỉ mức chênh lệch tăng thêm.",
                    Map.of("A", "at", "B", "by", "C", "to", "D", "with")),
            new StarterPrompt(-111L,
                    "Neither the director nor her assistants _______ available for comment today.",
                    "Cả giám đốc lẫn các trợ lý của bà đều không _______ để bình luận hôm nay.",
                    "D",
                    "Với 'Neither A nor B', động từ chia theo danh từ gần nhất 'assistants' (số nhiều).",
                    Map.of("A", "is", "B", "was", "C", "has been", "D", "are")),
            new StarterPrompt(-112L,
                    "Passengers should arrive at Gate 4 at least 30 minutes _______ to boarding.",
                    "Hành khách nên có mặt tại Cổng 4 ít nhất 30 phút _______ khi lên máy bay.",
                    "C",
                    "Cụm giới từ chuẩn TOEIC 'prior to + V-ing/Noun' nghĩa là trước khi.",
                    Map.of("A", "before", "B", "earlier", "C", "prior", "D", "ahead")),
            new StarterPrompt(-113L,
                    "The logistics team is looking for a more _______ way to ship fragile items.",
                    "Đội hậu cần đang tìm kiếm một cách _______ hơn để vận chuyển các mặt hàng dễ vỡ.",
                    "A",
                    "Cần tính từ 'economical' (tiết kiệm, kinh tế) bổ nghĩa cho 'way'.",
                    Map.of("A", "economical", "B", "economize", "C", "economy", "D", "economically")),
            new StarterPrompt(-114L,
                    "Applications received after June 10 will not be _______ for this scholarship.",
                    "Các hồ sơ nhận được sau ngày 10 tháng 6 sẽ không được _______ cho học bổng này.",
                    "B",
                    "Bị động với tính từ/phân từ 'considered' (được xem xét).",
                    Map.of("A", "consider", "B", "considered", "C", "considering", "D", "consideration")),
            new StarterPrompt(-115L,
                    "Our design department works closely with clients to meet their _______ requirements.",
                    "Phòng thiết kế của chúng tôi phối hợp chặt chẽ với khách hàng để đáp ứng các yêu cầu _______ của họ.",
                    "D",
                    "Cần tính từ 'specific' (cụ thể) đứng trước 'requirements'.",
                    Map.of("A", "specify", "B", "specification", "C", "specifically", "D", "specific")),
            new StarterPrompt(-116L,
                    "Ms. Park reviewed the contract _______ before signing on behalf of the firm.",
                    "Bà Park đã xem xét hợp đồng _______ trước khi thay mặt công ty ký kết.",
                    "C",
                    "Cần trạng từ 'thoroughly' (một cách kỹ lưỡng) bổ nghĩa cho 'reviewed'.",
                    Map.of("A", "thorough", "B", "thoroughness", "C", "thoroughly", "D", "more thorough")),
            new StarterPrompt(-117L,
                    "The training workshop was postponed _______ the keynote speaker missed his flight.",
                    "Hội thảo đào tạo đã bị hoãn _______ diễn giả chính bị lỡ chuyến bay.",
                    "A",
                    "'because + mệnh đề' chỉ nguyên nhân.",
                    Map.of("A", "because", "B", "because of", "C", "instead of", "D", "rather than")),
            new StarterPrompt(-118L,
                    "We apologize for any _______ caused by the temporary elevator maintenance.",
                    "Chúng tôi xin lỗi vì bất kỳ _______ nào gây ra bởi việc bảo trì thang máy tạm thời.",
                    "B",
                    "Sau 'any' cần danh từ 'inconvenience' (sự bất tiện).",
                    Map.of("A", "inconvenient", "B", "inconvenience", "C", "inconveniently", "D", "convenient")),
            new StarterPrompt(-119L,
                    "The warranty covers all parts and labor for a _______ of two years.",
                    "Bảo hành bao gồm toàn bộ linh kiện và nhân công trong một _______ hai năm.",
                    "C",
                    "Cụm danh từ cố định 'for a period of + thời gian'.",
                    Map.of("A", "durable", "B", "during", "C", "period", "D", "interval")),
            new StarterPrompt(-120L,
                    "Visitors must sign in at the front desk _______ entering the research facility.",
                    "Khách tham quan phải ký tên tại quầy lễ tân _______ khi bước vào cơ sở nghiên cứu.",
                    "A",
                    "'before + V-ing' rút gọn mệnh đề cùng chủ ngữ.",
                    Map.of("A", "before", "B", "during", "C", "until", "D", "since")));

    private static final List<VocabStarterPrompt> STARTER_VOCAB_PROMPTS = List.of(
            new VocabStarterPrompt(-201L, "satisfaction", "noun", "/ˌsæt.ɪsˈfæk.ʃən/", "sự hài lòng",
                    "This is the happy feeling you get when you have achieved something or received what you wanted.",
                    "Đây là cảm giác vui vẻ bạn có được khi đạt được điều gì đó hoặc nhận được thứ bạn mong muốn.",
                    "Customer satisfaction is our top priority.",
                    "Sự hài lòng của khách hàng là ưu tiên hàng đầu của chúng tôi."),
            new VocabStarterPrompt(-202L, "deadline", "noun", "/ˈded.laɪn/", "hạn chót",
                    "A specific time or date by which a task or project must be completed.",
                    "Một thời điểm hoặc ngày cụ thể mà công việc hoặc dự án phải được hoàn thành.",
                    "We worked late to meet the project deadline.",
                    "Chúng tôi đã làm việc muộn để kịp hạn chót của dự án."),
            new VocabStarterPrompt(-203L, "negotiate", "verb", "/nɪˈɡəʊ.ʃi.eɪt/", "đàm phán, thương lượng",
                    "To have formal discussions with someone in order to reach a business agreement.",
                    "Tiến hành thảo luận chính thức với ai đó nhằm đạt được một thỏa thuận kinh doanh.",
                    "Both sides agreed to negotiate a new contract next week.",
                    "Cả hai bên đã đồng ý đàm phán một hợp đồng mới vào tuần tới."),
            new VocabStarterPrompt(-204L, "warranty", "noun", "/ˈwɒr.ən.ti/", "bảo hành",
                    "A written guarantee promising to repair or replace a faulty product within a period.",
                    "Giấy cam kết bằng văn bản hứa sửa chữa hoặc thay thế sản phẩm lỗi trong một khoảng thời gian.",
                    "The laptop comes with a two-year manufacturer warranty.",
                    "Chiếc laptop đi kèm gói bảo hành hai năm từ nhà sản xuất."),
            new VocabStarterPrompt(-205L, "reimburse", "verb", "/ˌriː.ɪmˈbɜːs/", "hoàn tiền, bồi hoàn",
                    "To pay back money to someone who has spent it on your behalf.",
                    "Trả lại số tiền cho người đã chi tiêu thay mặt cho bạn hoặc công ty.",
                    "The company will reimburse all approved travel expenses.",
                    "Công ty sẽ hoàn trả toàn bộ chi phí công tác đã được phê duyệt."),
            new VocabStarterPrompt(-206L, "inventory", "noun", "/ˈɪn.vən.tər.i/", "hàng tồn kho",
                    "A complete list or stock of goods stored in a shop or warehouse.",
                    "Danh sách đầy đủ hoặc lượng hàng hóa đang được lưu trữ trong cửa hàng hoặc kho.",
                    "Staff will check the warehouse inventory every Friday.",
                    "Nhân viên sẽ kiểm tra hàng tồn kho trong kho vào mỗi thứ Sáu."),
            new VocabStarterPrompt(-207L, "mandatory", "adjective", "/ˈmæn.də.tər.i/", "bắt buộc",
                    "Required by laws, rules, or official policy without exception.",
                    "Được yêu cầu bởi luật lệ, quy định hoặc chính sách chính thức không có ngoại lệ.",
                    "Safety training is mandatory for all new employees.",
                    "Đào tạo an toàn là bắt buộc đối với tất cả nhân viên mới."),
            new VocabStarterPrompt(-208L, "evaluate", "verb", "/ɪˈvæl.ju.eɪt/", "đánh giá",
                    "To judge or calculate the quality, importance, or value of something.",
                    "Nhận xét, cân nhắc hoặc đo lường chất lượng, tầm quan trọng hay giá trị của điều gì đó.",
                    "Managers evaluate staff performance at the end of the quarter.",
                    "Các quản lý đánh giá hiệu suất nhân viên vào cuối quý."),
            new VocabStarterPrompt(-209L, "revenue", "noun", "/ˈrev.ə.njuː/", "doanh thu",
                    "The total income generated by a business from sales or services.",
                    "Tổng thu nhập mà một doanh nghiệp tạo ra từ hoạt động bán hàng hoặc cung cấp dịch vụ.",
                    "Online sales boosted annual revenue by twenty percent.",
                    "Doanh số trực tuyến đã giúp tăng doanh thu hằng năm thêm hai mươi phần trăm."),
            new VocabStarterPrompt(-210L, "confidential", "adjective", "/ˌkɒn.fɪˈden.ʃəl/", "bảo mật, kín",
                    "Intended to be kept secret and shared only with authorized people.",
                    "Được quy định phải giữ bí mật và chỉ chia sẻ với những người có thẩm quyền.",
                    "Please store confidential client files in a locked cabinet.",
                    "Vui lòng cất giữ hồ sơ khách hàng bảo mật trong tủ có khóa."),
            new VocabStarterPrompt(-211L, "postpone", "verb", "/pəʊstˈpəʊn/", "hoãn lại",
                    "To arrange for an event or meeting to take place at a later time.",
                    "Sắp xếp để một sự kiện hoặc cuộc họp diễn ra vào một thời điểm muộn hơn.",
                    "Due to the storm, we had to postpone the outdoor launch.",
                    "Do cơn bão, chúng tôi đã phải hoãn buổi ra mắt ngoài trời."),
            new VocabStarterPrompt(-212L, "efficiency", "noun", "/ɪˈfɪʃ.ən.si/", "hiệu suất",
                    "The quality of working quickly and effectively without wasting time or resources.",
                    "Khả năng làm việc nhanh chóng và đạt kết quả cao mà không lãng phí thời gian hay nguồn lực.",
                    "Upgrading our software improved office efficiency dramatically.",
                    "Việc nâng cấp phần mềm đã cải thiện đáng kể hiệu suất văn phòng."),
            new VocabStarterPrompt(-213L, "itinerary", "noun", "/aɪˈtɪn.ər.ər.i/", "lịch trình chuyến đi",
                    "A detailed plan or schedule of a journey, including dates and places to visit.",
                    "Kế hoạch hoặc thời gian biểu chi tiết cho một chuyến đi, gồm ngày giờ và các điểm dừng.",
                    "Our secretary emailed the complete conference itinerary yesterday.",
                    "Thư ký của chúng tôi đã gửi email toàn bộ lịch trình hội nghị vào hôm qua."),
            new VocabStarterPrompt(-214L, "distribute", "verb", "/dɪˈstrɪb.juːt/", "phân phối",
                    "To supply or deliver goods or materials to various people or locations.",
                    "Cung cấp hoặc giao hàng hóa, tài liệu đến nhiều người hoặc nhiều địa điểm khác nhau.",
                    "We distribute organic coffee beans to cafes nationwide.",
                    "Chúng tôi phân phối hạt cà phê hữu cơ tới các quán cà phê trên toàn quốc."),
            new VocabStarterPrompt(-215L, "collaborate", "verb", "/kəˈlæb.ə.reɪt/", "hợp tác, cộng tác",
                    "To work jointly with others on a shared project or goal.",
                    "Cùng làm việc chung với những người khác trong một dự án hoặc mục tiêu chung.",
                    "Designers and engineers collaborate closely on every release.",
                    "Các nhà thiết kế và kỹ sư hợp tác chặt chẽ trong mỗi lần phát hành."));
}
