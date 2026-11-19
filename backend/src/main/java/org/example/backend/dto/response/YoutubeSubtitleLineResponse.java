package org.example.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class YoutubeSubtitleLineResponse {
    private int index;
    private int startSeconds;
    private int endSeconds;
    private String timestampLabel;
    private String rangeLabel;
    private String englishText;
    private String vietnameseText;
    private String englishNote;
}
