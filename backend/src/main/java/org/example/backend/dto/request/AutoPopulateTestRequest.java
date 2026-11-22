package org.example.backend.dto.request;

import lombok.Data;

@Data
public class AutoPopulateTestRequest {
    private String groupPrefix;
    private Boolean replaceExisting;
}
