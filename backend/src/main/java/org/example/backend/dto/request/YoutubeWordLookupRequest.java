package org.example.backend.dto.request;

import lombok.Data;

@Data
public class YoutubeWordLookupRequest {
    private String word;
    private String contextSentence;
    private String videoTitle;
}
