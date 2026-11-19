package org.example.backend.dto.request;

import lombok.Data;

@Data
public class AdminVideoUpdateRequest {
    private String title;
    private String description;
    private String authorName;
    private String thumbnailUrl;
    private String level;
    private String topic;
}
