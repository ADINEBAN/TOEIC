package org.example.backend.dto.request;

import lombok.Data;

@Data
public class CosmeticActionRequest {
    private String cosmeticId;
    private String category; // FRAME | AVATAR (used when unequipping)
}
