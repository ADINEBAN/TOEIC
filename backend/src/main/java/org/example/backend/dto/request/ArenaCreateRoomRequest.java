package org.example.backend.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class ArenaCreateRoomRequest {
    private Integer questionCount;
    private String mode; // VOCAB | PART5
    private Integer maxPlayers; // 2 (1v1) or 3 (Trio)
    @JsonProperty("isPrivate")
    private Boolean privateRoom;
    private String password;
}
