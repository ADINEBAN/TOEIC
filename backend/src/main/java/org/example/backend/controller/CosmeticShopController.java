package org.example.backend.controller;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.CosmeticActionRequest;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.CosmeticShopResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.CosmeticShopService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/users/shop")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class CosmeticShopController {

    private final CosmeticShopService cosmeticShopService;

    @GetMapping
    public ResponseEntity<ApiResponse<CosmeticShopResponse>> getCatalog(Authentication authentication) {
        return ApiResponseUtil.success(
                cosmeticShopService.getShopCatalog(authentication.getName()),
                SuccessCode.COSMETIC_SHOP_RETRIEVED
        );
    }

    @PostMapping("/purchase")
    public ResponseEntity<ApiResponse<CosmeticShopResponse>> purchase(
            Authentication authentication,
            @RequestBody CosmeticActionRequest request
    ) {
        return ApiResponseUtil.success(
                cosmeticShopService.purchaseCosmetic(authentication.getName(), request != null ? request.getCosmeticId() : null),
                SuccessCode.COSMETIC_PURCHASED
        );
    }

    @PostMapping("/equip")
    public ResponseEntity<ApiResponse<CosmeticShopResponse>> equip(
            Authentication authentication,
            @RequestBody CosmeticActionRequest request
    ) {
        return ApiResponseUtil.success(
                cosmeticShopService.equipCosmetic(
                        authentication.getName(),
                        request != null ? request.getCosmeticId() : null,
                        request != null ? request.getCategory() : null
                ),
                SuccessCode.COSMETIC_EQUIPPED
        );
    }
}
