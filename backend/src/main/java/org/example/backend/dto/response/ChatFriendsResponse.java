package org.example.backend.dto.response;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class ChatFriendsResponse {
    private List<FriendPerson> friends;
    private List<FriendPerson> incomingRequests;
    private List<FriendPerson> outgoingRequests;
    private List<FriendPerson> blockedUsers;

    @Data
    public static class FriendPerson {
        private Long friendshipId;
        private Long userId;
        private String fullName;
        private String username;
        private String avatarUrl;
        private String equippedFrameId;
        private int level;
        private int diamonds;
        private String relationStatus; // ACCEPTED | PENDING_INCOMING | PENDING_OUTGOING | BLOCKED | NONE
        private String lastMessagePreview;
        private LocalDateTime lastMessageAt;
    }
}
