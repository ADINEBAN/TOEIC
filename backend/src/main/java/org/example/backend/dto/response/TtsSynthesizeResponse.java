package org.example.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TtsSynthesizeResponse {
    private boolean available;
    private String provider;
    private String cacheId;
    private String streamPath;
    private String audioBase64;
    private String audioFormat;
    private String mimeType;
    private String voiceId;
    private String voiceName;
    private String locale;
    private Integer billableCharacters;
    private String message;
}
