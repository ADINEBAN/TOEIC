package org.example.backend.service;

import org.example.backend.dto.request.SepayWebhookRequest;
import org.example.backend.dto.response.PaymentOrderResponse;
import org.example.backend.dto.response.SubscriptionPlansOverviewResponse;
import org.example.backend.entity.DiamondTransaction;
import org.example.backend.entity.PaymentOrder;
import org.example.backend.entity.User;
import org.example.backend.entity.UserFeatureQuota;
import org.example.backend.enums.ErrorCode;
import org.example.backend.enums.UserRole;
import org.example.backend.exception.AppException;
import org.example.backend.repository.DiamondTransactionRepository;
import org.example.backend.repository.PaymentOrderRepository;
import org.example.backend.repository.UserFeatureQuotaRepository;
import org.example.backend.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SubscriptionAndSepayServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PaymentOrderRepository paymentOrderRepository;

    @Mock
    private UserFeatureQuotaRepository userFeatureQuotaRepository;

    @Mock
    private DiamondTransactionRepository diamondTransactionRepository;

    private SubscriptionService subscriptionService;

    @BeforeEach
    void setUp() {
        subscriptionService = new SubscriptionService(
                userRepository,
                paymentOrderRepository,
                userFeatureQuotaRepository,
                diamondTransactionRepository
        );
        ReflectionTestUtils.setField(subscriptionService, "sepayApiKey", "secret-sepay-key");
        ReflectionTestUtils.setField(subscriptionService, "sepayBankCode", "MBBank");
        ReflectionTestUtils.setField(subscriptionService, "sepayAccountNumber", "0987654321");
        ReflectionTestUtils.setField(subscriptionService, "sepayAccountName", "TOEIC TRAINER");
        ReflectionTestUtils.setField(subscriptionService, "sepayOrderPrefix", "TOEIC");
    }

    @Test
    void getPlansOverviewReturnsConfirmedPricingAndCycles() {
        User user = buildUser(10L, "learner@toeic.local", "FREE");
        when(userRepository.findByEmail("learner@toeic.local")).thenReturn(Optional.of(user));
        when(userFeatureQuotaRepository.findByUserIdAndFeatureKeyAndPeriodKey(anyLong(), anyString(), anyString()))
                .thenReturn(Optional.empty());

        SubscriptionPlansOverviewResponse overview = subscriptionService.getPlansOverview("learner@toeic.local");
        assertEquals("FREE", overview.getCurrentTier());
        assertEquals(4, overview.getPlans().size());

        Map<String, Long> prices = overview.getPlans().stream()
                .collect(java.util.stream.Collectors.toMap(
                        SubscriptionPlansOverviewResponse.PlanOptionDto::getPlanCode,
                        SubscriptionPlansOverviewResponse.PlanOptionDto::getPriceVnd
                ));
        assertEquals(10_000L, prices.get("PLUS_MONTHLY"));
        assertEquals(49_000L, prices.get("PLUS_YEARLY"));
        assertEquals(30_000L, prices.get("PRO_MONTHLY"));
        assertEquals(1_000_000L, prices.get("PRO_YEARLY"));
    }

    @Test
    void consumeQuotaEnforcesFreeAndPlusAndUnlimitedProLimits() {
        User freeUser = buildUser(11L, "free@toeic.local", "FREE");
        when(userRepository.findByEmail("free@toeic.local")).thenReturn(Optional.of(freeUser));

        // Personal video is locked (limit = 0) on FREE
        AppException videoLocked = assertThrows(
                AppException.class,
                () -> subscriptionService.consumeQuotaOrThrow("free@toeic.local", SubscriptionService.FEATURE_PERSONAL_VIDEO)
        );
        assertEquals(ErrorCode.PLAN_UPGRADE_REQUIRED, videoLocked.getErrorCode());

        // AI Explain is 3/day on FREE: when usedCount == 3, throw FEATURE_QUOTA_EXCEEDED
        UserFeatureQuota maxedFreeAi = new UserFeatureQuota();
        maxedFreeAi.setUser(freeUser);
        maxedFreeAi.setFeatureKey(SubscriptionService.FEATURE_AI_EXPLAIN);
        maxedFreeAi.setUsedCount(3);
        when(userFeatureQuotaRepository.findByUserIdAndFeatureKeyAndPeriodKey(eq(11L), eq(SubscriptionService.FEATURE_AI_EXPLAIN), anyString()))
                .thenReturn(Optional.of(maxedFreeAi));

        AppException quotaExceeded = assertThrows(
                AppException.class,
                () -> subscriptionService.consumeQuotaOrThrow("free@toeic.local", SubscriptionService.FEATURE_AI_EXPLAIN)
        );
        assertEquals(ErrorCode.FEATURE_QUOTA_EXCEEDED, quotaExceeded.getErrorCode());

        // PRO user has unlimited (-1) and never touches quota table
        User proUser = buildUser(12L, "pro@toeic.local", "PRO");
        when(userRepository.findByEmail("pro@toeic.local")).thenReturn(Optional.of(proUser));
        assertDoesNotThrow(() ->
                subscriptionService.consumeQuotaOrThrow("pro@toeic.local", SubscriptionService.FEATURE_AI_EXPLAIN)
        );
    }

    @Test
    void sepayWebhookVerifiesApiKeyExtractsOrderCodeAndActivatesPlanWithBonusDiamonds() {
        User user = buildUser(25L, "buyer@toeic.local", "FREE");
        user.setDiamonds(50);

        when(userRepository.findByEmail("buyer@toeic.local")).thenReturn(Optional.of(user));
        when(paymentOrderRepository.save(any(PaymentOrder.class))).thenAnswer(inv -> {
            PaymentOrder o = inv.getArgument(0);
            if (o.getId() == null) {
                o.setId(99L);
            }
            return o;
        });

        PaymentOrderResponse created = subscriptionService.createPaymentOrder("buyer@toeic.local", "PRO_MONTHLY");
        assertEquals(30_000L, created.getAmountVnd());
        assertEquals("PRO", created.getPlanTier());
        assertTrue(created.getQrImageUrl().contains("qr.sepay.vn/img"));

        PaymentOrder storedOrder = new PaymentOrder();
        storedOrder.setId(99L);
        storedOrder.setOrderCode(created.getOrderCode());
        storedOrder.setUser(user);
        storedOrder.setPlanCode("PRO_MONTHLY");
        storedOrder.setPlanTier("PRO");
        storedOrder.setDurationDays(30);
        storedOrder.setAmountVnd(30_000L);
        storedOrder.setBonusDiamonds(300);
        storedOrder.setStatus("PENDING");

        // 1. Unauthorized webhook header must fail
        SepayWebhookRequest payload = new SepayWebhookRequest();
        payload.setId(778899L);
        payload.setGateway("MBBank");
        payload.setTransferType("in");
        payload.setContent("MBVCB.12345 " + created.getOrderCode() + " chuyen khoan");
        payload.setTransferAmount(30_000L);

        AppException unauthorized = assertThrows(
                AppException.class,
                () -> subscriptionService.processSepayWebhook("Apikey wrong-key", payload)
        );
        assertEquals(ErrorCode.SEPAY_WEBHOOK_UNAUTHORIZED, unauthorized.getErrorCode());

        // 2. Valid webhook header activates PRO plan, verified badge, and +300 diamonds
        when(paymentOrderRepository.findBySepayTransactionId(778899L)).thenReturn(Optional.empty());
        when(paymentOrderRepository.findByOrderCodeIgnoreCase(created.getOrderCode()))
                .thenReturn(Optional.of(storedOrder));

        Map<String, Object> result = subscriptionService.processSepayWebhook("Apikey secret-sepay-key", payload);
        assertEquals(Boolean.TRUE, result.get("success"));
        assertEquals("PAID", storedOrder.getStatus());
        assertEquals("PRO", user.getActivePlanTier());
        assertTrue(Boolean.TRUE.equals(user.getPremium()));
        assertTrue(Boolean.TRUE.equals(user.getVerified()));
        assertEquals(350, user.getDiamonds());
        assertNotNull(user.getPlanExpiresAt());
        verify(diamondTransactionRepository, times(1)).save(any(DiamondTransaction.class));
    }

    private User buildUser(Long id, String email, String tier) {
        User u = new User();
        u.setId(id);
        u.setEmail(email);
        u.setRole(UserRole.USER);
        u.setPlanTier(tier);
        u.setPremium(!"FREE".equalsIgnoreCase(tier));
        u.setVerified("PRO".equalsIgnoreCase(tier));
        u.setDiamonds(50);
        return u;
    }
}
