package org.example.backend.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
public class ArenaCreateRoomRequest {
    private Integer questionCount;
    private String mode; // VOCAB | PART5
    @JsonProperty("isPrivate")
    private Boolean privateRoom;
    private String password;
}
