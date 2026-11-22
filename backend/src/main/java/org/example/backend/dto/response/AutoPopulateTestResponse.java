package org.example.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AutoPopulateTestResponse {
    private Long testId;
    private String testTitle;
    private int createdPartCount;
    private int totalAssignedQuestions;
    private Map<Integer, Integer> assignedPerPart;
    private List<TestPartResponse> parts;
}
