package org.example.backend.dto.request;

import lombok.Data;

@Data
public class GoogleLoginRequest {
    private String idToken;
    private String accessToken;
}
