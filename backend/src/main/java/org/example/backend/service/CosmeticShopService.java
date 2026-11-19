package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.response.CosmeticShopResponse;
import org.example.backend.entity.CosmeticItem;
import org.example.backend.entity.User;
import org.example.backend.entity.UserCosmetic;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.repository.CosmeticItemRepository;
import org.example.backend.repository.UserCosmeticRepository;
import org.example.backend.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class CosmeticShopService {

    private final CosmeticItemRepository cosmeticItemRepository;
    private final UserCosmeticRepository userCosmeticRepository;
    private final UserRepository userRepository;
    private final DiamondRewardService diamondRewardService;

    @Transactional
    public CosmeticShopResponse getShopCatalog(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        ensureDefaultCatalogSeeded();
        return buildShopResponse(user);
    }

    @Transactional
    public CosmeticShopResponse purchaseCosmetic(String email, String cosmeticId) {
        User user = userRepository.findByEmailForUpdate(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        ensureDefaultCatalogSeeded();

        CosmeticItem item = cosmeticItemRepository.findById(cosmeticId)
                .filter(c -> Boolean.TRUE.equals(c.getActive()))
                .orElseThrow(() -> new AppException(ErrorCode.COSMETIC_NOT_FOUND));

        boolean alreadyOwned = userCosmeticRepository.existsByUserIdAndCosmeticId(user.getId(), item.getId());
        if (!alreadyOwned) {
            int balance = user.getDiamonds() != null ? user.getDiamonds() : 50;
            int price = item.getPriceDiamonds() != null ? item.getPriceDiamonds() : 0;
            if (balance < price) {
                throw new AppException(ErrorCode.INSUFFICIENT_DIAMONDS);
            }
            user.setDiamonds(balance - price);

            UserCosmetic uc = new UserCosmetic();
            uc.setUser(user);
            uc.setCosmetic(item);
            uc.setPurchasedAt(LocalDateTime.now(DiamondRewardService.VN_ZONE));
            userCosmeticRepository.save(uc);

            diamondRewardService.recordSpend(
                    user,
                    "SHOP_PURCHASE",
                    item.getId(),
                    price,
                    "Mua vật phẩm: " + item.getName()
            );
        }

        // Auto-equip newly bought or owned cosmetic for convenience
        applyEquip(user, item);
        userRepository.save(user);
        return buildShopResponse(user);
    }

    @Transactional
    public CosmeticShopResponse equipCosmetic(String email, String cosmeticId, String category) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
        ensureDefaultCatalogSeeded();

        if (cosmeticId == null || cosmeticId.isBlank()) {
            if ("AVATAR".equalsIgnoreCase(category)) {
                user.setEquippedAvatarId(null);
            } else {
                user.setEquippedFrameId(null);
            }
            userRepository.save(user);
            return buildShopResponse(user);
        }

        CosmeticItem item = cosmeticItemRepository.findById(cosmeticId.trim())
                .orElseThrow(() -> new AppException(ErrorCode.COSMETIC_NOT_FOUND));
        if (!userCosmeticRepository.existsByUserIdAndCosmeticId(user.getId(), item.getId())) {
            throw new AppException(ErrorCode.COSMETIC_NOT_OWNED);
        }

        applyEquip(user, item);
        userRepository.save(user);
        return buildShopResponse(user);
    }

    private void applyEquip(User user, CosmeticItem item) {
        if ("AVATAR".equalsIgnoreCase(item.getCategory())) {
            user.setEquippedAvatarId(item.getId());
            user.setAvatarUrl("cosmetic://" + item.getPreviewKey());
        } else {
            user.setEquippedFrameId(item.getId());
        }
    }

    private CosmeticShopResponse buildShopResponse(User user) {
        List<CosmeticItem> items = cosmeticItemRepository.findByActiveTrueOrderBySortOrderAsc();
        Set<String> ownedIds = new HashSet<>();
        for (UserCosmetic uc : userCosmeticRepository.findByUserId(user.getId())) {
            if (uc.getCosmetic() != null) {
                ownedIds.add(uc.getCosmetic().getId());
            }
        }

        CosmeticShopResponse out = new CosmeticShopResponse();
        out.setMyDiamonds(user.getDiamonds() != null ? user.getDiamonds() : 50);
        out.setEquippedFrameId(user.getEquippedFrameId());
        out.setEquippedAvatarId(user.getEquippedAvatarId());

        List<CosmeticShopResponse.CosmeticCatalogItem> list = items.stream().map(c -> {
            CosmeticShopResponse.CosmeticCatalogItem dto = new CosmeticShopResponse.CosmeticCatalogItem();
            dto.setId(c.getId());
            dto.setCategory(c.getCategory());
            dto.setAnimationType(c.getAnimationType());
            dto.setRarity(c.getRarity());
            dto.setName(c.getName());
            dto.setDescription(c.getDescription());
            dto.setPriceDiamonds(c.getPriceDiamonds() != null ? c.getPriceDiamonds() : 0);
            dto.setBadgeEmoji(c.getBadgeEmoji());
            dto.setPrimaryColor(c.getPrimaryColor());
            dto.setSecondaryColor(c.getSecondaryColor());
            dto.setPreviewKey(c.getPreviewKey());
            dto.setOwned(ownedIds.contains(c.getId()));
            boolean equipped = "AVATAR".equalsIgnoreCase(c.getCategory())
                    ? c.getId().equals(user.getEquippedAvatarId())
                    : c.getId().equals(user.getEquippedFrameId());
            dto.setEquipped(equipped);
            return dto;
        }).toList();
        out.setItems(list);
        return out;
    }

    private void ensureDefaultCatalogSeeded() {
        if (cosmeticItemRepository.count() > 0) {
            return;
        }
        List<CosmeticItem> defaults = List.of(
                item("frame_static_bronze", "FRAME", "STATIC", "COMMON", "Viền Đồng Cổ Điển", "Khung tĩnh sắc đồng ấm thanh lịch.", 30, "🛡️", "#CD7F32", "#F59E0B", "static_bronze", 1),
                item("frame_static_emerald", "FRAME", "STATIC", "COMMON", "Ngọc Lục Bảo", "Khung tĩnh xanh ngọc dịu mắt.", 60, "🌿", "#10B981", "#059669", "static_emerald", 2),
                item("frame_static_sakura", "FRAME", "STATIC", "RARE", "Hoa Anh Đào", "Khung tĩnh sắc hồng pastel điểm hoa anh đào.", 120, "🌸", "#F472B6", "#FB7185", "static_sakura", 3),
                item("frame_static_scholar", "FRAME", "STATIC", "RARE", "Vương Miện Học Giả", "Khung tĩnh vàng kim dành riêng cho học viên chăm chỉ.", 180, "🎓", "#F59E0B", "#D97706", "static_scholar", 4),
                item("frame_static_royal", "FRAME", "STATIC", "EPIC", "Hoàng Gia Lam Ngọc", "Khung tĩnh lam ngọc viền hoàng kim sang trọng.", 320, "👑", "#2563EB", "#4F46E5", "static_royal", 5),
                item("frame_anim_neon_pulse", "FRAME", "ANIMATED", "RARE", "Sóng Neon Nhịp Thở", "Khung động phát sáng nhịp thở tím-lam.", 200, "⚡", "#6366F1", "#06B6D4", "anim_neon_pulse", 6),
                item("frame_anim_cyber_orbit", "FRAME", "ANIMATED", "EPIC", "Quỹ Đạo Sao Băng", "Khung động xoay vòng kèm ngôi sao quay quanh.", 380, "✨", "#8B5CF6", "#EC4899", "anim_cyber_orbit", 7),
                item("frame_anim_phoenix_flame", "FRAME", "ANIMATED", "EPIC", "Hào Quang Phượng Hoàng", "Khung động rực lửa vàng cam co giãn mạnh mẽ.", 500, "🔥", "#F97316", "#EF4444", "anim_phoenix_flame", 8),
                item("frame_anim_aurora_crown", "FRAME", "ANIMATED", "LEGENDARY", "Bắc Cực Quang Hoàng Kim", "Khung động đa sắc xoay mượt với vương miện lấp lánh.", 850, "💎", "#14B8A6", "#FBBF24", "anim_aurora_crown", 9),
                item("frame_anim_galactic_dragon", "FRAME", "ANIMATED", "LEGENDARY", "Tinh Vân Bất Bại", "Khung động tối thượng xoay hai lớp ánh sáng.", 1200, "🌌", "#7C3AED", "#F59E0B", "anim_galactic_dragon", 10),
                item("avatar_kitty", "AVATAR", "STATIC", "COMMON", "Mèo Cam May Mắn", "Ảnh đại diện 3D đất sét chú mèo cam.", 80, "🐱", "#FB923C", "#FED7AA", "kitty", 11),
                item("avatar_owl", "AVATAR", "STATIC", "RARE", "Cú Pháp Sư TOEIC", "Ảnh đại diện 3D cú mèo đội mũ phù thủy.", 150, "🦉", "#8B5CF6", "#DDD6FE", "owl", 12),
                item("avatar_panda", "AVATAR", "STATIC", "RARE", "Gấu Trúc Học Giả", "Ảnh đại diện 3D gấu trúc cùng lá trúc.", 150, "🐼", "#10B981", "#D1FAE5", "panda", 13),
                item("avatar_bunny", "AVATAR", "STATIC", "EPIC", "Thỏ Ngọc Mùa Xuân", "Ảnh đại diện 3D thỏ trắng pastel dịu dàng.", 280, "🐰", "#EC4899", "#FCE7F3", "bunny", 14),
                item("avatar_shiba", "AVATAR", "STATIC", "EPIC", "Shiba Ngầu Lòi", "Ảnh đại diện 3D chó Shiba đeo kính râm.", 350, "🐕", "#0EA5E9", "#BAE6FD", "shiba", 15),
                item("avatar_parrot", "AVATAR", "ANIMATED", "LEGENDARY", "Vẹt Parroto Thủ Khoa", "Ảnh đại diện 3D linh vật vẹt xanh huyền thoại.", 600, "🦜", "#2563EB", "#60A5FA", "parrot", 16)
        );
        cosmeticItemRepository.saveAll(defaults);
    }

    private CosmeticItem item(
            String id, String cat, String anim, String rarity, String name, String desc,
            int price, String emoji, String primary, String secondary, String previewKey, int sort
    ) {
        CosmeticItem c = new CosmeticItem();
        c.setId(id);
        c.setCategory(cat);
        c.setAnimationType(anim);
        c.setRarity(rarity);
        c.setName(name);
        c.setDescription(desc);
        c.setPriceDiamonds(price);
        c.setBadgeEmoji(emoji);
        c.setPrimaryColor(primary);
        c.setSecondaryColor(secondary);
        c.setPreviewKey(previewKey);
        c.setSortOrder(sort);
        c.setActive(true);
        return c;
    }
}
