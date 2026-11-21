package org.example.backend.dto.response;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class ChatMessageResponse {
    private Long id;
    private String channelType; // COMMUNITY | DIRECT
    private String messageType; // TEXT | SYSTEM_MILESTONE
    private Long senderId;
    private String senderFullName;
    private String senderUsername;
    private String senderAvatarUrl;
    private String senderEquippedFrameId;
    private boolean senderVerified;
    private int senderLevel;
    private Long recipientId;
    private String content;
    private LocalDateTime createdAt;
    private boolean mine;
}
