package org.example.backend.dto.request;

import lombok.Data;

@Data
public class VideoBookmarkRequest {
    private Double timestampSeconds;
    private String label;
    private String note;
}
