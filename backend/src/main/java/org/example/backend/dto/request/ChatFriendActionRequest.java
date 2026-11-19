package org.example.backend.dto.request;

import lombok.Data;

@Data
public class ChatFriendActionRequest {
    private Long targetUserId;
    private String username;
}
