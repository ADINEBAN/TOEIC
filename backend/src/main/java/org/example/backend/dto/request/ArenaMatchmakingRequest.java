package org.example.backend.dto.request;

import lombok.Data;

@Data
public class ArenaMatchmakingRequest {
    private String mode; // VOCAB | PART5
    private Integer questionCount;
    private Integer maxPlayers; // 2 or 3
}
