package org.example.backend.dto.request;

import lombok.Data;

@Data
public class CreateVideoNoteRequest {
    private Integer timestampSeconds;
    private String noteText;
}
