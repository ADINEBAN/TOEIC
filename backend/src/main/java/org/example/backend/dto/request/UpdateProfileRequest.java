package org.example.backend.dto.request;

import lombok.Data;

@Data
public class UpdateProfileRequest {
    private String fullName;
    private String username;
    private String bio;
    private String avatarUrl;
    private String equippedFrameId;
    private String equippedAvatarId;
    private String currentLevel;
    private Integer targetScore;
}
