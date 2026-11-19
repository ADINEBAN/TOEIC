package org.example.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportedDocumentPassageResponse {
    private Long id;
    private String passageCode;
    private Integer partNo;
    private String passageType;
    private String documentKind;
    private Integer pageNumber;
    private String content;
    private String tableJson;
    private String linkedPassageCodes;
    private Integer sortOrder;
}
