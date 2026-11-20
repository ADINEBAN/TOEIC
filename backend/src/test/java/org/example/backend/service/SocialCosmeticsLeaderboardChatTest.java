package org.example.backend.service;

import org.example.backend.dto.request.UpdateProfileRequest;
import org.example.backend.dto.response.ChatFriendsResponse;
import org.example.backend.dto.response.ChatMessageResponse;
import org.example.backend.dto.response.CosmeticShopResponse;
import org.example.backend.dto.response.UserResponse;
import org.example.backend.dto.response.WeeklyLeaderboardResponse;
import org.example.backend.entity.ChatMessage;
import org.example.backend.entity.CosmeticItem;
import org.example.backend.entity.DiamondTransaction;
import org.example.backend.entity.User;
import org.example.backend.entity.UserCosmetic;
import org.example.backend.entity.UserFriendship;
import org.example.backend.enums.ErrorCode;
import org.example.backend.enums.UserRole;
import org.example.backend.enums.UserStatus;
import org.example.backend.exception.AppException;
import org.example.backend.mapper.UserMapper;
import org.example.backend.util.LevelCalculator;
import org.example.backend.repository.ChatMessageRepository;
import org.example.backend.repository.CosmeticItemRepository;
import org.example.backend.repository.DiamondTransactionRepository;
import org.example.backend.repository.UserAchievementRepository;
import org.example.backend.repository.UserCosmeticRepository;
import org.example.backend.repository.UserFriendshipRepository;
import org.example.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SocialCosmeticsLeaderboardChatTest {

    @Mock private UserRepository userRepository;
    @Mock private DiamondTransactionRepository diamondTransactionRepository;
    @Mock private UserAchievementRepository userAchievementRepository;
    @Mock private CosmeticItemRepository cosmeticItemRepository;
    @Mock private UserCosmeticRepository userCosmeticRepository;
    @Mock private ChatMessageRepository chatMessageRepository;
    @Mock private UserFriendshipRepository userFriendshipRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private UserMapper userMapper;

    @InjectMocks private DiamondRewardService diamondRewardService;
    @InjectMocks private ChatService chatService;
    @InjectMocks private UserService userService;

    private User buildUser(Long id, String email, String name, String username, int diamonds) {
        User u = new User();
        u.setId(id);
        u.setEmail(email);
        u.setFullName(name);
        u.setUsername(username);
        u.setDiamonds(diamonds);
        u.setLearningXp(120);
        u.setArenaElo(1000);
        u.setArenaWins(0);
        u.setArenaLosses(0);
        u.setCurrentLoginStreak(3);
        u.setLongestLoginStreak(5);
        u.setRole(UserRole.USER);
        u.setStatus(UserStatus.ACTIVE);
        return u;
    }

    @Test
    void studyDiamondRewardIsIdempotentAndWeeklyLeaderboardSeparatesStudyScore() {
        User alice = buildUser(1L, "alice@test.local", "Alice Nguyen", "alice_nguyen", 50);
        User bob = buildUser(2L, "bob@test.local", "Bob Tran", "bob_tran", 90);

        when(diamondTransactionRepository.existsByUserIdAndSourceTypeAndReferenceKey(1L, "LESSON_COMPLETE", "lesson:10"))
                .thenReturn(false)
                .thenReturn(true);
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
        when(diamondTransactionRepository.save(any(DiamondTransaction.class))).thenAnswer(inv -> inv.getArgument(0));

        int firstGrant = diamondRewardService.grantStudyReward(
                alice, "LESSON_COMPLETE", "lesson:10", 15, 35, 3, "Hoàn thành bài học", false);
        int secondGrant = diamondRewardService.grantStudyReward(
                alice, "LESSON_COMPLETE", "lesson:10", 15, 35, 3, "Hoàn thành bài học", false);

        assertEquals(15, firstGrant);
        assertEquals(0, secondGrant);
        assertEquals(65, alice.getDiamonds());
        assertEquals(155, alice.getLearningXp());

        when(userRepository.findByEmail("alice@test.local")).thenReturn(Optional.of(alice));
        when(diamondTransactionRepository.findWeeklyStudyRankings(any(LocalDate.class), any(Pageable.class)))
                .thenReturn(List.of(
                        new Object[]{2L, 140L, 6L},
                        new Object[]{1L, 65L, 3L}
                ));
        when(userRepository.findAllById(List.of(2L, 1L))).thenReturn(List.of(alice, bob));
        when(diamondTransactionRepository.countActiveStudyUsersInWeek(any(LocalDate.class))).thenReturn(2L);
        when(userAchievementRepository.findByUserIdOrderByUnlockedAtDesc(anyLong())).thenReturn(List.of());

        WeeklyLeaderboardResponse lb = diamondRewardService.getWeeklyLeaderboard("alice@test.local", 0);
        assertEquals(2, lb.getEntries().size());
        assertEquals(1, lb.getEntries().get(0).getRank());
        assertEquals("bob_tran", lb.getEntries().get(0).getUsername());
        assertEquals(140, lb.getEntries().get(0).getWeeklyStudyDiamonds());
        assertNotNull(lb.getMyEntry());
        assertEquals(2, lb.getMyEntry().getRank());
        assertEquals(65, lb.getMyEntry().getWeeklyStudyDiamonds());
        assertEquals(4, lb.getRewardTiers().size());
    }

    @Test
    void cosmeticShopEnforcesBalanceAndEquipsAnimatedFrameOrAvatar() {
        CosmeticShopService shopService = new CosmeticShopService(
                cosmeticItemRepository, userCosmeticRepository, userRepository, diamondRewardService);

        User alice = buildUser(1L, "alice@test.local", "Alice", "alice", 250);
        CosmeticItem animatedFrame = new CosmeticItem();
        animatedFrame.setId("frame_anim_neon_pulse");
        animatedFrame.setCategory("FRAME");
        animatedFrame.setAnimationType("ANIMATED");
        animatedFrame.setRarity("RARE");
        animatedFrame.setName("Sóng Neon");
        animatedFrame.setDescription("Khung động");
        animatedFrame.setPriceDiamonds(200);
        animatedFrame.setPreviewKey("anim_neon_pulse");
        animatedFrame.setActive(true);

        CosmeticItem expensiveFrame = new CosmeticItem();
        expensiveFrame.setId("frame_anim_aurora_crown");
        expensiveFrame.setCategory("FRAME");
        expensiveFrame.setAnimationType("ANIMATED");
        expensiveFrame.setRarity("LEGENDARY");
        expensiveFrame.setName("Bắc Cực Quang");
        expensiveFrame.setDescription("Khung động tối thượng");
        expensiveFrame.setPriceDiamonds(850);
        expensiveFrame.setPreviewKey("anim_aurora_crown");
        expensiveFrame.setActive(true);

        when(userRepository.findByEmailForUpdate("alice@test.local")).thenReturn(Optional.of(alice));
        when(cosmeticItemRepository.count()).thenReturn(2L);
        when(cosmeticItemRepository.findById("frame_anim_aurora_crown")).thenReturn(Optional.of(expensiveFrame));
        when(userCosmeticRepository.existsByUserIdAndCosmeticId(1L, "frame_anim_aurora_crown")).thenReturn(false);

        AppException ex = assertThrows(AppException.class,
                () -> shopService.purchaseCosmetic("alice@test.local", "frame_anim_aurora_crown"));
        assertEquals(ErrorCode.INSUFFICIENT_DIAMONDS, ex.getErrorCode());

        when(cosmeticItemRepository.findById("frame_anim_neon_pulse")).thenReturn(Optional.of(animatedFrame));
        when(userCosmeticRepository.existsByUserIdAndCosmeticId(1L, "frame_anim_neon_pulse")).thenReturn(false);
        when(userCosmeticRepository.save(any(UserCosmetic.class))).thenAnswer(inv -> inv.getArgument(0));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
        when(cosmeticItemRepository.findByActiveTrueOrderBySortOrderAsc()).thenReturn(List.of(animatedFrame, expensiveFrame));
        UserCosmetic ownedUc = new UserCosmetic();
        ownedUc.setCosmetic(animatedFrame);
        when(userCosmeticRepository.findByUserId(1L)).thenReturn(List.of(ownedUc));

        CosmeticShopResponse res = shopService.purchaseCosmetic("alice@test.local", "frame_anim_neon_pulse");
        assertEquals(50, res.getMyDiamonds());
        assertEquals("frame_anim_neon_pulse", res.getEquippedFrameId());
        assertEquals("frame_anim_neon_pulse", alice.getEquippedFrameId());
    }

    @Test
    void profileSupportsUniqueUsernameValidationAndAvatarImageUpload(@TempDir Path tempDir) throws Exception {
        ReflectionTestUtils.setField(userService, "storageDir", tempDir.toString());
        User alice = buildUser(1L, "alice@test.local", "Alice", "alice_old", 50);

        when(userRepository.findByEmail("alice@test.local")).thenReturn(Optional.of(alice));
        when(userRepository.existsByUsernameIgnoreCaseAndIdNot("bob_taken", 1L)).thenReturn(true);

        UpdateProfileRequest dupReq = new UpdateProfileRequest();
        dupReq.setUsername("@bob_taken");
        AppException dupEx = assertThrows(AppException.class,
                () -> userService.updateMyProfile("alice@test.local", dupReq));
        assertEquals(ErrorCode.USERNAME_TAKEN, dupEx.getErrorCode());

        UpdateProfileRequest validReq = new UpdateProfileRequest();
        validReq.setUsername("@alice.toeic");
        validReq.setFullName("Alice Master");
        validReq.setBio("Mục tiêu 850+ TOEIC!");
        when(userRepository.existsByUsernameIgnoreCaseAndIdNot("alice.toeic", 1L)).thenReturn(false);
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
        UserResponse mapped = new UserResponse();
        mapped.setUsername("alice.toeic");
        mapped.setFullName("Alice Master");
        when(userMapper.toResponse(any(User.class))).thenReturn(mapped);

        UserResponse updated = userService.updateMyProfile("alice@test.local", validReq);
        assertEquals("alice.toeic", updated.getUsername());
        assertEquals("Mục tiêu 850+ TOEIC!", alice.getBio());

        MockMultipartFile file = new MockMultipartFile("file", "photo.jpg", "image/jpeg", new byte[]{1, 2, 3, 4});
        UserResponse uploadedRes = userService.uploadMyAvatar("alice@test.local", file);
        assertNotNull(uploadedRes);
        assertTrue(alice.getAvatarUrl().startsWith("/api/media/avatars/u1_"));
        assertTrue(Files.exists(tempDir.resolve("uploads").resolve("avatars")
                .resolve(alice.getAvatarUrl().replace("/api/media/avatars/", ""))));
    }

    @Test
    void chatSupportsCommunityMessagesFriendRequestsDirectMessagingAndBlocking() {
        User alice = buildUser(1L, "alice@test.local", "Alice", "alice_u", 50);
        User bob = buildUser(2L, "bob@test.local", "Bob", "bob_u", 50);

        when(userRepository.findByEmail("alice@test.local")).thenReturn(Optional.of(alice));
        when(userRepository.findByUsernameIgnoreCase("bob_u")).thenReturn(Optional.of(bob));
        when(userRepository.findById(2L)).thenReturn(Optional.of(bob));
        when(chatMessageRepository.save(any(ChatMessage.class))).thenAnswer(inv -> {
            ChatMessage m = inv.getArgument(0);
            m.setId(99L);
            return m;
        });

        ChatMessageResponse communityMsg = chatService.sendCommunityMessage("alice@test.local", "Xin chào mọi người!");
        assertEquals("COMMUNITY", communityMsg.getChannelType());
        assertEquals("alice_u", communityMsg.getSenderUsername());
        assertTrue(communityMsg.isMine());

        when(userFriendshipRepository.findBetweenUsers(1L, 2L)).thenReturn(List.of());
        when(userFriendshipRepository.findAllForUser(1L)).thenReturn(List.of());
        ChatFriendsResponse afterReq = chatService.sendFriendRequest("alice@test.local", null, "@bob_u");
        assertNotNull(afterReq);
        verify(userFriendshipRepository).save(any(UserFriendship.class));

        UserFriendship accepted = new UserFriendship();
        accepted.setId(10L);
        accepted.setRequester(alice);
        accepted.setAddressee(bob);
        accepted.setStatus("ACCEPTED");
        when(userFriendshipRepository.findBetweenUsers(1L, 2L)).thenReturn(List.of(accepted));
        ChatMessageResponse dm = chatService.sendDirectMessage("alice@test.local", 2L, "Solo 1v1 không bạn ơi?");
        assertEquals("DIRECT", dm.getChannelType());
        assertEquals(2L, dm.getRecipientId());

        ChatFriendsResponse overview = chatService.getFriendsOverview("alice@test.local");
        assertNotNull(overview);
        assertEquals(0, overview.getTotalUnreadDirectMessages());

        when(chatMessageRepository.countUnreadDirectBySender(1L))
                .thenReturn(List.<Object[]>of(new Object[]{2L, 3L}));
        when(userFriendshipRepository.findAllForUser(1L)).thenReturn(List.of(accepted));
        ChatFriendsResponse unreadOverview = chatService.getFriendsOverview("alice@test.local");
        assertEquals(3, unreadOverview.getTotalUnreadDirectMessages());
        assertEquals(1, unreadOverview.getFriends().size());
        assertEquals(3, unreadOverview.getFriends().get(0).getUnreadCount());

        when(chatMessageRepository.findRecentDirectMessages(eq(1L), eq(2L), any(Pageable.class)))
                .thenReturn(List.of());
        chatService.getDirectMessages("alice@test.local", 2L, 30);
        verify(chatMessageRepository).markDirectMessagesRead(eq(1L), eq(2L), any());

        assertEquals("ACCEPTED", ChatService.resolveRelationStatus(1L, 2L, List.of(accepted)));
        UserFriendship pending = new UserFriendship();
        pending.setRequester(bob);
        pending.setAddressee(alice);
        pending.setStatus("PENDING");
        assertEquals("PENDING_INCOMING", ChatService.resolveRelationStatus(1L, 2L, List.of(pending)));
        assertEquals("PENDING_OUTGOING", ChatService.resolveRelationStatus(2L, 1L, List.of(pending)));

        UserFriendship blocked = new UserFriendship();
        blocked.setId(11L);
        blocked.setRequester(alice);
        blocked.setAddressee(bob);
        blocked.setStatus("BLOCKED");
        assertEquals("BLOCKED", ChatService.resolveRelationStatus(1L, 2L, List.of(blocked)));
        assertEquals("BLOCKED_BY_OTHER", ChatService.resolveRelationStatus(2L, 1L, List.of(blocked)));
        when(userFriendshipRepository.findBetweenUsers(1L, 2L)).thenReturn(List.of(blocked));
        AppException blockEx = assertThrows(AppException.class,
                () -> chatService.sendDirectMessage("alice@test.local", 2L, "Hello"));
        assertEquals(ErrorCode.USER_BLOCKED_COMMUNICATION, blockEx.getErrorCode());
    }

    @Test
    void progressiveLevelCalculatorAwardsTieredLevelsAndTitles() {
        var lv1 = LevelCalculator.fromXp(0);
        assertEquals(1, lv1.level());
        assertEquals(100, lv1.nextLevelXp());
        assertEquals("Tân Binh", lv1.levelTitle());

        var lv2 = LevelCalculator.fromXp(135);
        assertEquals(2, lv2.level());
        assertEquals(100, lv2.currentLevelMinXp());
        assertEquals(250, lv2.nextLevelXp());
        assertEquals(35, lv2.xpIntoLevel());
        assertEquals(23, lv2.progressPercent());

        var lv5 = LevelCalculator.fromXp(700);
        assertEquals(5, lv5.level());
        assertEquals("Học Giả", lv5.levelTitle());

        var lv10 = LevelCalculator.fromXp(2950);
        assertEquals(10, lv10.level());
        assertEquals("Tinh Anh", lv10.levelTitle());
    }
}
