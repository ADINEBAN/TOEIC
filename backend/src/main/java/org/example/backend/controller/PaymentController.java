package org.example.backend.controller;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.CreatePaymentOrderRequest;
import org.example.backend.dto.request.SepayWebhookRequest;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.PaymentOrderResponse;
import org.example.backend.dto.response.SubscriptionPlansOverviewResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.SubscriptionService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final SubscriptionService subscriptionService;

    @GetMapping("/plans")
    @PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
    public ResponseEntity<ApiResponse<SubscriptionPlansOverviewResponse>> getPlansOverview(
            Authentication authentication
    ) {
        return ApiResponseUtil.success(
                subscriptionService.getPlansOverview(authentication.getName()),
                SuccessCode.SUBSCRIPTION_PLANS_RETRIEVED
        );
    }

    @PostMapping("/orders")
    @PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
    public ResponseEntity<ApiResponse<PaymentOrderResponse>> createOrder(
            Authentication authentication,
            @RequestBody CreatePaymentOrderRequest request
    ) {
        return ApiResponseUtil.success(
                subscriptionService.createPaymentOrder(
                        authentication.getName(),
                        request != null ? request.getPlanCode() : null
                ),
                SuccessCode.PAYMENT_ORDER_CREATED
        );
    }

    @PostMapping("/redeem-diamonds")
    @PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
    public ResponseEntity<ApiResponse<SubscriptionPlansOverviewResponse>> redeemPlanWithDiamonds(
            Authentication authentication,
            @RequestBody CreatePaymentOrderRequest request
    ) {
        return ApiResponseUtil.success(
                subscriptionService.redeemPlanWithDiamonds(
                        authentication.getName(),
                        request != null ? request.getPlanCode() : null
                ),
                SuccessCode.PLAN_REDEEMED_WITH_DIAMONDS
        );
    }

    @GetMapping("/orders/mine")
    @PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
    public ResponseEntity<ApiResponse<List<PaymentOrderResponse>>> getMyOrders(
            Authentication authentication
    ) {
        return ApiResponseUtil.success(
                subscriptionService.getMyOrders(authentication.getName()),
                SuccessCode.PAYMENT_ORDERS_LISTED
        );
    }

    @GetMapping("/orders/{orderCode}")
    @PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
    public ResponseEntity<ApiResponse<PaymentOrderResponse>> getOrderStatus(
            Authentication authentication,
            @PathVariable String orderCode
    ) {
        return ApiResponseUtil.success(
                subscriptionService.getOrderByCode(authentication.getName(), orderCode),
                SuccessCode.PAYMENT_ORDER_RETRIEVED
        );
    }

    @PostMapping("/orders/{orderCode}/simulate-webhook")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<PaymentOrderResponse>> simulateOrderWebhook(
            Authentication authentication,
            @PathVariable String orderCode
    ) {
        return ApiResponseUtil.success(
                subscriptionService.simulateWebhookForOrder(authentication.getName(), orderCode),
                SuccessCode.SEPAY_WEBHOOK_PROCESSED
        );
    }

    @PostMapping("/sepay/webhook")
    public ResponseEntity<Map<String, Object>> receiveSepayWebhook(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody(required = false) SepayWebhookRequest payload
    ) {
        Map<String, Object> result = subscriptionService.processSepayWebhook(authorization, payload);
        return ResponseEntity.ok(result);
    }
}
