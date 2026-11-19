package org.example.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TtsVoiceItemResponse {
    private String id;
    private String displayName;
    private String locale;
    private String gender;
    private String model;
    private String previewAudio;
}
