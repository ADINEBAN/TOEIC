package org.example.backend.dto.request;

import lombok.Data;

@Data
public class SynthesizeSpeechRequest {
    private String text;
    private String voiceId;
    private String region;
    private String audioFormat;
}
