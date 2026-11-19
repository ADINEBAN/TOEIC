package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "cosmetic_items")
public class CosmeticItem {

    @Id
    @Column(length = 64)
    private String id;

    @Column(nullable = false, length = 20)
    private String category; // FRAME | AVATAR

    @Column(name = "animation_type", nullable = false, length = 20)
    private String animationType; // STATIC | ANIMATED

    @Column(nullable = false, length = 20)
    private String rarity; // COMMON | RARE | EPIC | LEGENDARY

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, length = 255)
    private String description;

    @Column(name = "price_diamonds", nullable = false)
    private Integer priceDiamonds;

    @Column(name = "badge_emoji", length = 16)
    private String badgeEmoji;

    @Column(name = "primary_color", length = 20)
    private String primaryColor;

    @Column(name = "secondary_color", length = 20)
    private String secondaryColor;

    @Column(name = "preview_key", nullable = false, length = 100)
    private String previewKey;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @Column(nullable = false)
    private Boolean active = true;
}
