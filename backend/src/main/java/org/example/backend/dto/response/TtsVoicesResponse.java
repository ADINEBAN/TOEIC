package org.example.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TtsVoicesResponse {
    private boolean configured;
    private String provider;
    private String defaultUsVoiceId;
    private String defaultUkVoiceId;
    private String statusMessage;
    private List<TtsVoiceItemResponse> voices;
}
