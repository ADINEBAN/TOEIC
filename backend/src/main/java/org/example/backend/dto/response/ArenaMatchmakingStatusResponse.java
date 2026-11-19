package org.example.backend.dto.response;

import lombok.Data;

@Data
public class ArenaMatchmakingStatusResponse {
    private String status; // IDLE, SEARCHING, MATCHED
    private String mode; // VOCAB, PART5
    private int waitedSeconds;
    private int queueSize;
    private ArenaRoomResponse room;
}
