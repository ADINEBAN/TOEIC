package org.example.backend.dto.request;

import lombok.Data;

import java.util.List;

@Data
public class ConfirmDocumentExamRequest {
    private String testTitle;
    private String description;
    private List<Integer> selectedParts;
    private Integer durationMinutes;
}
