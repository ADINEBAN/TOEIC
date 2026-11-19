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
public class YoutubeExerciseItemResponse {
    private int index;
    private String questionText;
    private String question;
    private List<String> options;
    private String correctLabel;
    private Integer correctIndex;
    private String explanation;
    private String explanationVi;
}
