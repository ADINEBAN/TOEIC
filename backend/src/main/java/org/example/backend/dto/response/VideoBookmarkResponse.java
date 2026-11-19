package org.example.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VideoBookmarkResponse {
    private Long id;
    private Double timestampSeconds;
    private String timestampLabel;
    private String label;
    private String note;
    private LocalDateTime createdAt;
}
