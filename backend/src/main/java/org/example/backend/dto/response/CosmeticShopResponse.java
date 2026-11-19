package org.example.backend.dto.response;

import lombok.Data;

import java.util.List;

@Data
public class CosmeticShopResponse {
    private int myDiamonds;
    private String equippedFrameId;
    private String equippedAvatarId;
    private List<CosmeticCatalogItem> items;

    @Data
    public static class CosmeticCatalogItem {
        private String id;
        private String category; // FRAME | AVATAR
        private String animationType; // STATIC | ANIMATED
        private String rarity; // COMMON | RARE | EPIC | LEGENDARY
        private String name;
        private String description;
        private int priceDiamonds;
        private String badgeEmoji;
        private String primaryColor;
        private String secondaryColor;
        private String previewKey;
        private boolean owned;
        private boolean equipped;
    }
}
