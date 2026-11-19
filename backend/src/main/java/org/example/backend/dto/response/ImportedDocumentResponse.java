package org.example.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportedDocumentResponse {
    private Long id;
    private String fileName;
    private String fileFormat;
    private Long fileSizeBytes;
    private String sha256Hash;
    private Integer pageCount;
    private Boolean ocrUsed;
    private String ocrEngine;
    private String status;
    private String rawTextPreview;
    private Long generatedTestId;
    private Map<String, Object> validationSummary;
    private List<ImportedDocumentPassageResponse> passages;
    private List<ImportedDocumentQuestionResponse> questions;
    private List<TestResponse> generatedExams;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
