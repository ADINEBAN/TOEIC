package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.response.ChatFriendsResponse;
import org.example.backend.dto.response.ChatMessageResponse;
import org.example.backend.entity.ChatMessage;
import org.example.backend.entity.User;
import org.example.backend.entity.UserFriendship;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.repository.ChatMessageRepository;
import org.example.backend.repository.UserFriendshipRepository;
import org.example.backend.repository.UserRepository;
import org.example.backend.util.LevelCalculator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ChatService {

    private final ChatMessageRepository chatMessageRepository;
    private final UserFriendshipRepository userFriendshipRepository;
    private final UserRepository userRepository;

    @Autowired(required = false)
    private SimpMessagingTemplate messagingTemplate;

    @Transactional(readOnly = true)
    public List<ChatMessageResponse> getCommunityMessages(String email, int limit) {
        User viewer = findUser(email);
        Set<Long> blockedIds = collectBlockedIdsForViewer(viewer.getId());
        int safeLimit = Math.max(10, Math.min(100, limit));

        List<ChatMessage> recent = chatMessageRepository.findRecentCommunityMessages(PageRequest.of(0, safeLimit));
        List<ChatMessageResponse> out = new ArrayList<>();
        for (ChatMessage m : recent) {
            if (m.getSender() != null && blockedIds.contains(m.getSender().getId()) && !"SYSTEM_MILESTONE".equals(m.getMessageType())) {
                continue;
            }
            out.add(toMessageDto(m, viewer.getId()));
        }
        Collections.reverse(out); // Chronological oldest -> newest
        return out;
    }

    @Transactional
    public ChatMessageResponse sendCommunityMessage(String email, String rawContent) {
        User sender = findUser(email);
        String content = validateAndSanitizeContent(rawContent);

        ChatMessage msg = new ChatMessage();
        msg.setChannelType("COMMUNITY");
        msg.setMessageType("TEXT");
        msg.setSender(sender);
        msg.setContent(content);
        msg.setCreatedAt(LocalDateTime.now(DiamondRewardService.VN_ZONE));
        msg = chatMessageRepository.save(msg);

        ChatMessageResponse dto = toMessageDto(msg, sender.getId());
        broadcastSafe("/topic/chat/community", dto);
        return dto;
    }

    @Transactional
    public void postSystemMilestone(User user, String content) {
        if (content == null || content.isBlank()) {
            return;
        }
        ChatMessage msg = new ChatMessage();
        msg.setChannelType("COMMUNITY");
        msg.setMessageType("SYSTEM_MILESTONE");
        msg.setSender(user);
        msg.setContent(content.trim());
        msg.setCreatedAt(LocalDateTime.now(DiamondRewardService.VN_ZONE));
        msg = chatMessageRepository.save(msg);
        if (user != null) {
            broadcastSafe("/topic/chat/community", toMessageDto(msg, user.getId()));
        }
    }

    @Transactional
    public List<ChatMessageResponse> getDirectMessages(String email, Long peerUserId, int limit) {
        User viewer = findUser(email);
        User peer = userRepository.findById(peerUserId)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        if (isBlockedBetween(viewer.getId(), peer.getId())) {
            throw new AppException(ErrorCode.USER_BLOCKED_COMMUNICATION);
        }
        chatMessageRepository.markDirectMessagesRead(
                viewer.getId(),
                peer.getId(),
                LocalDateTime.now(DiamondRewardService.VN_ZONE)
        );
        int safeLimit = Math.max(10, Math.min(100, limit));
        List<ChatMessage> recent = chatMessageRepository.findRecentDirectMessages(
                viewer.getId(), peer.getId(), PageRequest.of(0, safeLimit));
        List<ChatMessageResponse> out = recent.stream()
                .map(m -> toMessageDto(m, viewer.getId()))
                .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        Collections.reverse(out);
        return out;
    }

    @Transactional
    public ChatMessageResponse sendDirectMessage(String email, Long peerUserId, String rawContent) {
        User sender = findUser(email);
        User recipient = userRepository.findById(peerUserId)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        if (sender.getId().equals(recipient.getId())) {
            throw new AppException(ErrorCode.FRIENDSHIP_ACTION_INVALID);
        }
        if (isBlockedBetween(sender.getId(), recipient.getId())) {
            throw new AppException(ErrorCode.USER_BLOCKED_COMMUNICATION);
        }
        String content = validateAndSanitizeContent(rawContent);

        ChatMessage msg = new ChatMessage();
        msg.setChannelType("DIRECT");
        msg.setMessageType("TEXT");
        msg.setSender(sender);
        msg.setRecipient(recipient);
        msg.setContent(content);
        msg.setCreatedAt(LocalDateTime.now(DiamondRewardService.VN_ZONE));
        msg = chatMessageRepository.save(msg);

        ChatMessageResponse dto = toMessageDto(msg, sender.getId());
        long minId = Math.min(sender.getId(), recipient.getId());
        long maxId = Math.max(sender.getId(), recipient.getId());
        broadcastSafe("/topic/chat/direct/" + minId + "-" + maxId, dto);
        return dto;
    }

    @Transactional(readOnly = true)
    public ChatFriendsResponse getFriendsOverview(String email) {
        User viewer = findUser(email);
        List<UserFriendship> links = userFriendshipRepository.findAllForUser(viewer.getId());
        Map<Long, Integer> unreadBySender = collectUnreadBySender(viewer.getId());

        ChatFriendsResponse out = new ChatFriendsResponse();
        List<ChatFriendsResponse.FriendPerson> friends = new ArrayList<>();
        List<ChatFriendsResponse.FriendPerson> incoming = new ArrayList<>();
        List<ChatFriendsResponse.FriendPerson> outgoing = new ArrayList<>();
        List<ChatFriendsResponse.FriendPerson> blocked = new ArrayList<>();
        int totalUnreadDirectMessages = 0;

        for (UserFriendship link : links) {
            boolean iAmRequester = link.getRequester().getId().equals(viewer.getId());
            User other = iAmRequester ? link.getAddressee() : link.getRequester();
            if (other == null) {
                continue;
            }
            if ("BLOCKED".equals(link.getStatus())) {
                if (iAmRequester) {
                    blocked.add(toFriendDto(viewer.getId(), other, link.getId(), "BLOCKED", false, 0));
                }
                continue;
            }
            if ("ACCEPTED".equals(link.getStatus())) {
                int unread = unreadBySender.getOrDefault(other.getId(), 0);
                totalUnreadDirectMessages += unread;
                friends.add(toFriendDto(viewer.getId(), other, link.getId(), "ACCEPTED", true, unread));
            } else if ("PENDING".equals(link.getStatus())) {
                if (iAmRequester) {
                    outgoing.add(toFriendDto(viewer.getId(), other, link.getId(), "PENDING_OUTGOING", false, 0));
                } else {
                    incoming.add(toFriendDto(viewer.getId(), other, link.getId(), "PENDING_INCOMING", false, 0));
                }
            }
        }

        out.setTotalUnreadDirectMessages(totalUnreadDirectMessages);
        out.setFriends(friends);
        out.setIncomingRequests(incoming);
        out.setOutgoingRequests(outgoing);
        out.setBlockedUsers(blocked);
        return out;
    }

    @Transactional(readOnly = true)
    public List<ChatFriendsResponse.FriendPerson> searchUsers(String email, String rawQuery) {
        User viewer = findUser(email);
        String q = rawQuery != null ? rawQuery.trim().replaceFirst("^@+", "") : "";
        if (q.isEmpty()) {
            return List.of();
        }
        List<User> matched = userRepository.findTop15ByUsernameContainingIgnoreCaseOrFullNameContainingIgnoreCase(q, q);
        List<UserFriendship> myLinks = userFriendshipRepository.findAllForUser(viewer.getId());

        List<ChatFriendsResponse.FriendPerson> out = new ArrayList<>();
        for (User candidate : matched) {
            if (candidate.getId().equals(viewer.getId())) {
                continue;
            }
            UserFriendship matchedLink = findLinkBetween(viewer.getId(), candidate.getId(), myLinks);
            String relStatus = resolveRelationStatus(viewer.getId(), matchedLink);
            Long friendshipId = matchedLink != null ? matchedLink.getId() : null;
            if (!"BLOCKED_BY_OTHER".equals(relStatus)) {
                out.add(toFriendDto(viewer.getId(), candidate, friendshipId, relStatus, false, 0));
            }
        }
        return out;
    }

    /**
     * Resolves the viewer-centric relationship state from a collection of links between two users.
     */
    public static String resolveRelationStatus(Long viewerId, Long otherUserId, List<UserFriendship> links) {
        UserFriendship link = findLinkBetween(viewerId, otherUserId, links);
        return resolveRelationStatus(viewerId, link);
    }

    private static UserFriendship findLinkBetween(Long viewerId, Long otherUserId, List<UserFriendship> links) {
        if (viewerId == null || otherUserId == null || links == null) {
            return null;
        }
        for (UserFriendship link : links) {
            Long reqId = link.getRequester() != null ? link.getRequester().getId() : null;
            Long addrId = link.getAddressee() != null ? link.getAddressee().getId() : null;
            if ((viewerId.equals(reqId) && otherUserId.equals(addrId))
                    || (viewerId.equals(addrId) && otherUserId.equals(reqId))) {
                return link;
            }
        }
        return null;
    }

    private static String resolveRelationStatus(Long viewerId, UserFriendship link) {
        if (viewerId == null || link == null) {
            return "NONE";
        }
        boolean isRequester = link.getRequester() != null && viewerId.equals(link.getRequester().getId());
        if ("BLOCKED".equals(link.getStatus())) {
            return isRequester ? "BLOCKED" : "BLOCKED_BY_OTHER";
        }
        if ("ACCEPTED".equals(link.getStatus())) {
            return "ACCEPTED";
        }
        if ("PENDING".equals(link.getStatus())) {
            return isRequester ? "PENDING_OUTGOING" : "PENDING_INCOMING";
        }
        return "NONE";
    }

    @Transactional
    public ChatFriendsResponse sendFriendRequest(String email, Long targetUserId, String rawUsername) {
        User requester = findUser(email);
        User target = resolveTargetUser(targetUserId, rawUsername);
        if (requester.getId().equals(target.getId())) {
            throw new AppException(ErrorCode.FRIENDSHIP_ACTION_INVALID);
        }

        List<UserFriendship> between = userFriendshipRepository.findBetweenUsers(requester.getId(), target.getId());
        for (UserFriendship existing : between) {
            if ("BLOCKED".equals(existing.getStatus())) {
                throw new AppException(ErrorCode.USER_BLOCKED_COMMUNICATION);
            }
            if ("ACCEPTED".equals(existing.getStatus())) {
                return getFriendsOverview(email);
            }
            if ("PENDING".equals(existing.getStatus())) {
                // If target had already sent us a request, sending back auto-accepts!
                if (existing.getRequester().getId().equals(target.getId())) {
                    existing.setStatus("ACCEPTED");
                    existing.setUpdatedAt(LocalDateTime.now(DiamondRewardService.VN_ZONE));
                    userFriendshipRepository.save(existing);
                }
                return getFriendsOverview(email);
            }
        }

        UserFriendship link = new UserFriendship();
        link.setRequester(requester);
        link.setAddressee(target);
        link.setStatus("PENDING");
        link.setCreatedAt(LocalDateTime.now(DiamondRewardService.VN_ZONE));
        link.setUpdatedAt(LocalDateTime.now(DiamondRewardService.VN_ZONE));
        userFriendshipRepository.save(link);
        return getFriendsOverview(email);
    }

    @Transactional
    public ChatFriendsResponse acceptFriendRequest(String email, Long targetUserId) {
        User viewer = findUser(email);
        List<UserFriendship> between = userFriendshipRepository.findBetweenUsers(viewer.getId(), targetUserId);
        UserFriendship pending = between.stream()
                .filter(f -> "PENDING".equals(f.getStatus()) && f.getAddressee().getId().equals(viewer.getId()))
                .findFirst()
                .orElseThrow(() -> new AppException(ErrorCode.FRIENDSHIP_ACTION_INVALID));

        pending.setStatus("ACCEPTED");
        pending.setUpdatedAt(LocalDateTime.now(DiamondRewardService.VN_ZONE));
        userFriendshipRepository.save(pending);
        return getFriendsOverview(email);
    }

    @Transactional
    public ChatFriendsResponse removeFriendship(String email, Long targetUserId) {
        User viewer = findUser(email);
        List<UserFriendship> between = userFriendshipRepository.findBetweenUsers(viewer.getId(), targetUserId);
        if (!between.isEmpty()) {
            userFriendshipRepository.deleteAll(between);
        }
        return getFriendsOverview(email);
    }

    @Transactional
    public ChatFriendsResponse blockUser(String email, Long targetUserId) {
        User blocker = findUser(email);
        User target = userRepository.findById(targetUserId)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        if (blocker.getId().equals(target.getId())) {
            throw new AppException(ErrorCode.FRIENDSHIP_ACTION_INVALID);
        }

        List<UserFriendship> between = userFriendshipRepository.findBetweenUsers(blocker.getId(), target.getId());
        if (!between.isEmpty()) {
            userFriendshipRepository.deleteAll(between);
        }

        UserFriendship blocked = new UserFriendship();
        blocked.setRequester(blocker);
        blocked.setAddressee(target);
        blocked.setStatus("BLOCKED");
        blocked.setCreatedAt(LocalDateTime.now(DiamondRewardService.VN_ZONE));
        blocked.setUpdatedAt(LocalDateTime.now(DiamondRewardService.VN_ZONE));
        userFriendshipRepository.save(blocked);
        return getFriendsOverview(email);
    }

    @Transactional
    public ChatFriendsResponse unblockUser(String email, Long targetUserId) {
        User blocker = findUser(email);
        Optional<UserFriendship> opt = userFriendshipRepository.findByRequesterIdAndAddresseeId(blocker.getId(), targetUserId);
        opt.filter(f -> "BLOCKED".equals(f.getStatus())).ifPresent(userFriendshipRepository::delete);
        return getFriendsOverview(email);
    }

    private Map<Long, Integer> collectUnreadBySender(Long viewerId) {
        Map<Long, Integer> counts = new HashMap<>();
        List<Object[]> rows = chatMessageRepository.countUnreadDirectBySender(viewerId);
        if (rows != null) {
            for (Object[] row : rows) {
                if (row == null || row.length < 2 || !(row[0] instanceof Number) || !(row[1] instanceof Number)) {
                    continue;
                }
                counts.put(((Number) row[0]).longValue(), ((Number) row[1]).intValue());
            }
        }
        return counts;
    }

    private ChatFriendsResponse.FriendPerson toFriendDto(
            Long viewerId,
            User other,
            Long friendshipId,
            String status,
            boolean includeLastMessage,
            int unreadCount
    ) {
        ChatFriendsResponse.FriendPerson dto = new ChatFriendsResponse.FriendPerson();
        dto.setFriendshipId(friendshipId);
        dto.setUserId(other.getId());
        dto.setFullName(DiamondRewardService.resolveDisplayName(other));
        dto.setUsername(DiamondRewardService.resolveUsername(other));
        dto.setAvatarUrl(other.getAvatarUrl());
        dto.setEquippedFrameId(other.getEquippedFrameId());
        dto.setVerified(Boolean.TRUE.equals(other.getVerified()));
        int xp = other.getLearningXp() != null ? other.getLearningXp() : 0;
        dto.setLevel(LevelCalculator.fromXp(xp).level());
        dto.setDiamonds(other.getDiamonds() != null ? other.getDiamonds() : 50);
        dto.setRelationStatus(status);
        dto.setUnreadCount(unreadCount);

        if (includeLastMessage) {
            List<ChatMessage> last = chatMessageRepository.findRecentDirectMessages(viewerId, other.getId(), PageRequest.of(0, 1));
            if (!last.isEmpty()) {
                ChatMessage latest = last.get(0);
                dto.setLastMessageId(latest.getId());
                dto.setLastMessageSenderId(latest.getSender() != null ? latest.getSender().getId() : null);
                dto.setLastMessagePreview(latest.getContent());
                dto.setLastMessageAt(latest.getCreatedAt());
            }
        }
        return dto;
    }

    private ChatMessageResponse toMessageDto(ChatMessage m, Long viewerId) {
        ChatMessageResponse dto = new ChatMessageResponse();
        dto.setId(m.getId());
        dto.setChannelType(m.getChannelType());
        dto.setMessageType(m.getMessageType());
        dto.setContent(m.getContent());
        dto.setCreatedAt(m.getCreatedAt());
        if (m.getRecipient() != null) {
            dto.setRecipientId(m.getRecipient().getId());
        }
        User sender = m.getSender();
        if (sender != null) {
            dto.setSenderId(sender.getId());
            dto.setSenderFullName(DiamondRewardService.resolveDisplayName(sender));
            dto.setSenderUsername(DiamondRewardService.resolveUsername(sender));
            dto.setSenderAvatarUrl(sender.getAvatarUrl());
            dto.setSenderEquippedFrameId(sender.getEquippedFrameId());
            dto.setSenderVerified(Boolean.TRUE.equals(sender.getVerified()));
            int xp = sender.getLearningXp() != null ? sender.getLearningXp() : 0;
            dto.setSenderLevel(LevelCalculator.fromXp(xp).level());
            dto.setMine(sender.getId().equals(viewerId));
        } else {
            dto.setSenderFullName("Hệ thống");
            dto.setSenderUsername("system");
            dto.setSenderLevel(1);
            dto.setMine(false);
        }
        return dto;
    }

    private String validateAndSanitizeContent(String raw) {
        if (raw == null) {
            throw new AppException(ErrorCode.CHAT_MESSAGE_INVALID);
        }
        String trimmed = raw.trim();
        if (trimmed.isEmpty() || trimmed.length() > 900) {
            throw new AppException(ErrorCode.CHAT_MESSAGE_INVALID);
        }
        return trimmed;
    }

    private Set<Long> collectBlockedIdsForViewer(Long viewerId) {
        Set<Long> ids = new HashSet<>();
        for (UserFriendship f : userFriendshipRepository.findAllForUser(viewerId)) {
            if ("BLOCKED".equals(f.getStatus())) {
                if (f.getRequester().getId().equals(viewerId)) {
                    ids.add(f.getAddressee().getId());
                }
            }
        }
        return ids;
    }

    private boolean isBlockedBetween(Long u1, Long u2) {
        return userFriendshipRepository.findBetweenUsers(u1, u2).stream()
                .anyMatch(f -> "BLOCKED".equals(f.getStatus()));
    }

    private User resolveTargetUser(Long targetUserId, String rawUsername) {
        if (targetUserId != null) {
            return userRepository.findById(targetUserId)
                    .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        }
        if (rawUsername != null && !rawUsername.isBlank()) {
            String clean = rawUsername.trim().replaceFirst("^@+", "").toLowerCase(Locale.ROOT);
            return userRepository.findByUsernameIgnoreCase(clean)
                    .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        }
        throw new AppException(ErrorCode.FRIENDSHIP_ACTION_INVALID);
    }

    private User findUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
    }

    private void broadcastSafe(String destination, Object payload) {
        if (messagingTemplate == null) {
            return;
        }
        try {
            messagingTemplate.convertAndSend(destination, payload);
        } catch (Exception ignored) {
        }
    }
}
