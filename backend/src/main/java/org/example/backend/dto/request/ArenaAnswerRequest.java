package org.example.backend.dto.request;

import lombok.Data;

@Data
public class ArenaAnswerRequest {
    private String email;
    private Long questionId;
    private String selectedLabel;
    private String textAnswer;
    private Integer roundIndex;
}
