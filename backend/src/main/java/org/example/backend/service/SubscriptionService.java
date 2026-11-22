package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.SepayWebhookRequest;
import org.example.backend.dto.response.PaymentOrderResponse;
import org.example.backend.dto.response.SubscriptionPlansOverviewResponse;
import org.example.backend.dto.response.SubscriptionPlansOverviewResponse.PlanOptionDto;
import org.example.backend.dto.response.SubscriptionPlansOverviewResponse.QuotaStatusDto;
import org.example.backend.entity.DiamondTransaction;
import org.example.backend.entity.PaymentOrder;
import org.example.backend.entity.User;
import org.example.backend.entity.UserFeatureQuota;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.repository.DiamondTransactionRepository;
import org.example.backend.repository.PaymentOrderRepository;
import org.example.backend.repository.UserFeatureQuotaRepository;
import org.example.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class SubscriptionService {

    public static final ZoneId VN_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    public static final String FEATURE_AI_EXPLAIN = "AI_EXPLAIN";
    public static final String FEATURE_DOCUMENT_IMPORT = "DOCUMENT_IMPORT";
    public static final String FEATURE_PERSONAL_VIDEO = "PERSONAL_VIDEO";
    public static final String FEATURE_CAMERA_AI = "CAMERA_AI";

    public static final String PLAN_PLUS_MONTHLY = "PLUS_MONTHLY";
    public static final String PLAN_PLUS_YEARLY = "PLUS_YEARLY";
    public static final String PLAN_PRO_MONTHLY = "PRO_MONTHLY";
    public static final String PLAN_PRO_YEARLY = "PRO_YEARLY";

    private final UserRepository userRepository;
    private final PaymentOrderRepository paymentOrderRepository;
    private final UserFeatureQuotaRepository userFeatureQuotaRepository;
    private final DiamondTransactionRepository diamondTransactionRepository;

    @Value("${sepay.api-key:}")
    private String sepayApiKey;

    @Value("${sepay.bank-code:MBBank}")
    private String sepayBankCode;

    @Value("${sepay.account-number:0782733887}")
    private String sepayAccountNumber;

    @Value("${sepay.account-name:Y A DIN BYA}")
    private String sepayAccountName;

    @Value("${sepay.order-prefix:TOEIC}")
    private String sepayOrderPrefix;

    private static final Map<String, PlanOptionDto> PLAN_CATALOG = new LinkedHashMap<>();

    static {
        PLAN_CATALOG.put(PLAN_PLUS_MONTHLY, PlanOptionDto.builder()
                .planCode(PLAN_PLUS_MONTHLY)
                .tier("PLUS")
                .title("Gói PLUS 30 Ngày")
                .cycleLabel("30 ngày")
                .durationDays(30)
                .priceVnd(10_000L)
                .bonusDiamonds(100)
                .badgeText("Phổ biến")
                .highlights(List.of(
                        "Mở khóa 100% Video bài giảng & Full Test 200 câu",
                        "30 lượt AI Giải thích & 20 lượt Camera AI / ngày",
                        "10 đề PDF/Word + 5 Video AI / tháng • Tặng +100 💎"
                ))
                .build());

        PLAN_CATALOG.put(PLAN_PLUS_YEARLY, PlanOptionDto.builder()
                .planCode(PLAN_PLUS_YEARLY)
                .tier("PLUS")
                .title("Gói PLUS 365 Ngày")
                .cycleLabel("365 ngày")
                .durationDays(365)
                .priceVnd(49_000L)
                .bonusDiamonds(500)
                .badgeText("Tiết kiệm 59%")
                .highlights(List.of(
                        "Trọn bộ quyền lợi gói PLUS suốt 365 ngày",
                        "30 lượt AI Giải thích / ngày & 10 đề tài liệu / tháng",
                        "Tặng ngay +500 Kim cương 💎 khi kích hoạt"
                ))
                .build());

        PLAN_CATALOG.put(PLAN_PRO_MONTHLY, PlanOptionDto.builder()
                .planCode(PLAN_PRO_MONTHLY)
                .tier("PRO")
                .title("Gói PRO 30 Ngày")
                .cycleLabel("30 ngày")
                .durationDays(30)
                .priceVnd(30_000L)
                .bonusDiamonds(300)
                .badgeText("Không giới hạn AI")
                .highlights(List.of(
                        "KHÔNG GIỚI HẠN AI Giải thích, Đề tài liệu, Video & Camera AI",
                        "Giọng đọc Speechify AI cao cấp + Nhân x1.5 💎 học tập",
                        "Tích xanh Verified ✓ + Tặng ngay +300 Kim cương 💎"
                ))
                .build());

        PLAN_CATALOG.put(PLAN_PRO_YEARLY, PlanOptionDto.builder()
                .planCode(PLAN_PRO_YEARLY)
                .tier("PRO")
                .title("Gói PRO 365 Ngày (VIP)")
                .cycleLabel("365 ngày")
                .durationDays(365)
                .priceVnd(1_000_000L)
                .bonusDiamonds(1_500)
                .badgeText("VIP Trọn Năm")
                .highlights(List.of(
                        "Đầy đủ đặc quyền PRO Không giới hạn suốt 365 ngày",
                        "Nhân x1.5 💎 mọi hoạt động học tập & luyện đề",
                        "Tích xanh Verified ✓ + Tặng ngay +1.500 Kim cương 💎"
                ))
                .build());
    }

    @Transactional(readOnly = true)
    public SubscriptionPlansOverviewResponse getPlansOverview(String email) {
        User user = findUserByEmail(email);
        String activeTier = user.getActivePlanTier();
        return SubscriptionPlansOverviewResponse.builder()
                .currentTier(activeTier)
                .planExpiresAt(user.getPlanExpiresAt())
                .verified(Boolean.TRUE.equals(user.getVerified()))
                .diamonds(user.getDiamonds() != null ? user.getDiamonds() : 50)
                .plans(new ArrayList<>(PLAN_CATALOG.values()))
                .quotas(buildUserQuotas(user, activeTier))
                .build();
    }

    @Transactional
    public PaymentOrderResponse createPaymentOrder(String email, String planCodeRaw) {
        User user = findUserByEmail(email);
        String normPlanCode = planCodeRaw != null ? planCodeRaw.trim().toUpperCase(Locale.ROOT) : "";
        PlanOptionDto plan = PLAN_CATALOG.get(normPlanCode);
        if (plan == null) {
            throw new AppException(ErrorCode.INVALID_SUBSCRIPTION_PLAN);
        }

        String prefix = sanitizePrefix(sepayOrderPrefix);
        String orderCode = generateUniqueOrderCode(prefix, user.getId());

        PaymentOrder order = new PaymentOrder();
        order.setOrderCode(orderCode);
        order.setUser(user);
        order.setPlanCode(plan.getPlanCode());
        order.setPlanTier(plan.getTier());
        order.setDurationDays(plan.getDurationDays());
        order.setAmountVnd(plan.getPriceVnd());
        order.setBonusDiamonds(plan.getBonusDiamonds());
        order.setStatus("PENDING");
        order.setExpiresAt(LocalDateTime.now().plusMinutes(30));

        PaymentOrder saved = paymentOrderRepository.save(order);
        return toPaymentOrderResponse(saved);
    }

    @Transactional
    public PaymentOrderResponse getOrderByCode(String email, String orderCode) {
        User user = findUserByEmail(email);
        PaymentOrder order = paymentOrderRepository.findByOrderCodeIgnoreCase(orderCode != null ? orderCode.trim() : "")
                .orElseThrow(() -> new AppException(ErrorCode.PAYMENT_ORDER_NOT_FOUND));
        if (!order.getUser().getId().equals(user.getId())
                && (user.getRole() == null || !"ADMIN".equalsIgnoreCase(user.getRole().name()))) {
            throw new AppException(ErrorCode.ACCESS_DENIED);
        }
        refreshExpiredStatusIfNeeded(order);
        return toPaymentOrderResponse(order);
    }

    @Transactional(readOnly = true)
    public List<PaymentOrderResponse> getMyOrders(String email) {
        User user = findUserByEmail(email);
        return paymentOrderRepository.findTop20ByUserIdOrderByCreatedAtDesc(user.getId())
                .stream()
                .map(this::toPaymentOrderResponse)
                .toList();
    }

    @Transactional
    public Map<String, Object> processSepayWebhook(String authorizationHeader, SepayWebhookRequest payload) {
        verifySepayAuthorizationIfNeeded(authorizationHeader);
        if (payload == null) {
            return Map.of("success", true, "message", "Empty payload ignored");
        }
        if (payload.getTransferType() != null && !"in".equalsIgnoreCase(payload.getTransferType().trim())) {
            return Map.of("success", true, "message", "Ignored non-incoming transfer");
        }
        if (payload.getId() != null && paymentOrderRepository.findBySepayTransactionId(payload.getId()).isPresent()) {
            return Map.of("success", true, "message", "Duplicate transaction ignored");
        }

        String extractedOrderCode = extractOrderCode(payload.getCode(), payload.getContent(), payload.getDescription());
        if (extractedOrderCode == null) {
            return Map.of("success", true, "message", "No matching order code found in transfer content");
        }

        Optional<PaymentOrder> orderOpt = paymentOrderRepository.findByOrderCodeIgnoreCase(extractedOrderCode);
        if (orderOpt.isEmpty()) {
            return Map.of("success", true, "message", "Order not found: " + extractedOrderCode);
        }

        PaymentOrder order = orderOpt.get();
        if ("PAID".equalsIgnoreCase(order.getStatus())) {
            return Map.of("success", true, "message", "Order already paid", "orderCode", order.getOrderCode());
        }

        long paidAmount = payload.getTransferAmount() != null ? payload.getTransferAmount() : 0L;
        if (paidAmount < order.getAmountVnd()) {
            return Map.of(
                    "success", true,
                    "message", "Underpaid transfer ignored (" + paidAmount + " < " + order.getAmountVnd() + ")",
                    "orderCode", order.getOrderCode()
            );
        }

        activateOrderForUser(order, payload);
        return Map.of(
                "success", true,
                "orderCode", order.getOrderCode(),
                "status", "PAID",
                "planTier", order.getPlanTier()
        );
    }

    @Transactional
    public PaymentOrderResponse simulateWebhookForOrder(String email, String orderCode) {
        User user = findUserByEmail(email);
        PaymentOrder order = paymentOrderRepository.findByOrderCodeIgnoreCase(orderCode != null ? orderCode.trim() : "")
                .orElseThrow(() -> new AppException(ErrorCode.PAYMENT_ORDER_NOT_FOUND));
        if (!order.getUser().getId().equals(user.getId())
                && (user.getRole() == null || !"ADMIN".equalsIgnoreCase(user.getRole().name()))) {
            throw new AppException(ErrorCode.ACCESS_DENIED);
        }
        if (!"PAID".equalsIgnoreCase(order.getStatus())) {
            SepayWebhookRequest simulated = new SepayWebhookRequest();
            simulated.setId(System.currentTimeMillis());
            simulated.setGateway(sepayBankCode != null ? sepayBankCode : "MBBank");
            simulated.setAccountNumber(sepayAccountNumber);
            simulated.setCode(order.getOrderCode());
            simulated.setContent(order.getOrderCode() + " thanh toan goi " + order.getPlanCode());
            simulated.setTransferType("in");
            simulated.setTransferAmount(order.getAmountVnd());
            simulated.setReferenceCode("SIM-" + order.getOrderCode());
            activateOrderForUser(order, simulated);
        }
        return toPaymentOrderResponse(order);
    }

    @Transactional
    public void requireMinimumTierOrThrow(String email, String minimumTier, String customReasonVi) {
        User user = findUserByEmail(email);
        if (isPrivilegeBypassed(user)) {
            return;
        }
        String activeTier = user.getActivePlanTier();
        if (tierRank(activeTier) < tierRank(minimumTier)) {
            throw new AppException(
                    ErrorCode.PLAN_UPGRADE_REQUIRED,
                    customReasonVi != null && !customReasonVi.isBlank()
                            ? customReasonVi
                            : "Tính năng này yêu cầu nâng cấp gói " + minimumTier + " để sử dụng."
            );
        }
    }

    @Transactional
    public void consumeQuotaOrThrow(String email, String featureKey) {
        User user = findUserByEmail(email);
        if (isPrivilegeBypassed(user)) {
            return;
        }
        String activeTier = user.getActivePlanTier();
        int limit = resolveFeatureLimit(activeTier, featureKey);
        if (limit < 0) {
            return; // Unlimited (e.g. PRO)
        }
        if (limit == 0) {
            throw new AppException(
                    ErrorCode.PLAN_UPGRADE_REQUIRED,
                    buildUpgradeRequiredMessage(featureKey, activeTier)
            );
        }

        String periodKey = resolvePeriodKey(featureKey);
        UserFeatureQuota quota = userFeatureQuotaRepository
                .findByUserIdAndFeatureKeyAndPeriodKey(user.getId(), featureKey, periodKey)
                .orElseGet(() -> {
                    UserFeatureQuota created = new UserFeatureQuota();
                    created.setUser(user);
                    created.setFeatureKey(featureKey);
                    created.setPeriodKey(periodKey);
                    created.setUsedCount(0);
                    return created;
                });

        int used = quota.getUsedCount() != null ? quota.getUsedCount() : 0;
        if (used >= limit) {
            throw new AppException(
                    ErrorCode.FEATURE_QUOTA_EXCEEDED,
                    buildQuotaExceededMessage(featureKey, activeTier, limit)
            );
        }

        quota.setUsedCount(used + 1);
        userFeatureQuotaRepository.save(quota);
    }

    private void activateOrderForUser(PaymentOrder order, SepayWebhookRequest payload) {
        LocalDateTime now = LocalDateTime.now();
        order.setStatus("PAID");
        order.setPaidAt(now);
        if (payload.getId() != null) {
            order.setSepayTransactionId(payload.getId());
        }
        order.setGateway(payload.getGateway());
        order.setReferenceCode(payload.getReferenceCode());
        order.setTransferContent(payload.getContent() != null ? payload.getContent() : payload.getDescription());
        paymentOrderRepository.save(order);

        User user = order.getUser();
        String currentActiveTier = user.getActivePlanTier();
        String purchasedTier = order.getPlanTier() != null ? order.getPlanTier().trim().toUpperCase(Locale.ROOT) : "PLUS";

        LocalDateTime baseExpiry = user.getPlanExpiresAt();
        if (baseExpiry == null || baseExpiry.isBefore(now)) {
            baseExpiry = now;
        }
        user.setPlanExpiresAt(baseExpiry.plusDays(order.getDurationDays() != null ? order.getDurationDays() : 30));

        if (tierRank(purchasedTier) >= tierRank(currentActiveTier)) {
            user.setPlanTier(purchasedTier);
        }
        user.setPremium(true);
        if ("PRO".equalsIgnoreCase(user.getPlanTier())) {
            user.setVerified(true);
        }

        int bonus = order.getBonusDiamonds() != null ? order.getBonusDiamonds() : 0;
        if (bonus > 0) {
            int currentDiamonds = user.getDiamonds() != null ? user.getDiamonds() : 50;
            user.setDiamonds(currentDiamonds + bonus);

            if (diamondTransactionRepository != null) {
                DiamondTransaction tx = new DiamondTransaction();
                tx.setUser(user);
                tx.setSourceType("SUBSCRIPTION_BONUS");
                tx.setReferenceKey(order.getOrderCode());
                tx.setDiamondsDelta(bonus);
                tx.setStudyReward(false);
                tx.setDescriptionVi("Thưởng nâng cấp " + order.getPlanCode() + " (" + order.getOrderCode() + ")");
                tx.setWeekStartDate(LocalDate.now(VN_ZONE));
                diamondTransactionRepository.save(tx);
            }
        }

        userRepository.save(user);
    }

    private void verifySepayAuthorizationIfNeeded(String authorizationHeader) {
        if (sepayApiKey == null || sepayApiKey.isBlank()) {
            return;
        }
        String expected = "Apikey " + sepayApiKey.trim();
        String provided = authorizationHeader != null ? authorizationHeader.trim() : "";
        boolean valid = MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                provided.getBytes(StandardCharsets.UTF_8)
        );
        if (!valid) {
            throw new AppException(ErrorCode.SEPAY_WEBHOOK_UNAUTHORIZED);
        }
    }

    public String extractOrderCode(String codeField, String contentField, String descriptionField) {
        String prefix = sanitizePrefix(sepayOrderPrefix);
        Pattern pattern = Pattern.compile("\\b(" + Pattern.quote(prefix) + "[A-Z0-9]{4,24})\\b", Pattern.CASE_INSENSITIVE);

        for (String candidate : new String[]{codeField, contentField, descriptionField}) {
            if (candidate == null || candidate.isBlank()) {
                continue;
            }
            Matcher matcher = pattern.matcher(candidate.trim());
            if (matcher.find()) {
                return matcher.group(1).toUpperCase(Locale.ROOT);
            }
        }
        if (codeField != null && !codeField.isBlank()) {
            return codeField.trim().toUpperCase(Locale.ROOT);
        }
        return null;
    }

    private List<QuotaStatusDto> buildUserQuotas(User user, String activeTier) {
        List<QuotaStatusDto> list = new ArrayList<>();
        list.add(buildSingleQuotaStatus(user, activeTier, FEATURE_AI_EXPLAIN, "AI Giải thích đáp án", "Hôm nay"));
        list.add(buildSingleQuotaStatus(user, activeTier, FEATURE_CAMERA_AI, "Camera AI nhận diện đồ vật", "Hôm nay"));
        list.add(buildSingleQuotaStatus(user, activeTier, FEATURE_DOCUMENT_IMPORT, "Upload đề thi PDF/Word/Excel", "Tháng này"));
        list.add(buildSingleQuotaStatus(user, activeTier, FEATURE_PERSONAL_VIDEO, "Import Video AI phụ đề song ngữ", "Tháng này"));
        return list;
    }

    private QuotaStatusDto buildSingleQuotaStatus(
            User user,
            String activeTier,
            String featureKey,
            String title,
            String periodLabel
    ) {
        int limit = resolveFeatureLimit(activeTier, featureKey);
        String periodKey = resolvePeriodKey(featureKey);
        int used = userFeatureQuotaRepository
                .findByUserIdAndFeatureKeyAndPeriodKey(user.getId(), featureKey, periodKey)
                .map(q -> q.getUsedCount() != null ? q.getUsedCount() : 0)
                .orElse(0);

        return QuotaStatusDto.builder()
                .featureKey(featureKey)
                .featureTitle(title)
                .periodLabel(periodLabel)
                .usedCount(used)
                .limitCount(Math.max(0, limit))
                .unlimited(limit < 0)
                .locked(limit == 0)
                .build();
    }

    public int resolveFeatureLimit(String tier, String featureKey) {
        String normTier = tier != null ? tier.trim().toUpperCase(Locale.ROOT) : "FREE";
        if ("PRO".equals(normTier)) {
            return -1; // Unlimited
        }
        boolean isPlus = "PLUS".equals(normTier);
        return switch (featureKey) {
            case FEATURE_AI_EXPLAIN -> isPlus ? 30 : 3;
            case FEATURE_CAMERA_AI -> isPlus ? 20 : 2;
            case FEATURE_DOCUMENT_IMPORT -> isPlus ? 10 : 1;
            case FEATURE_PERSONAL_VIDEO -> isPlus ? 5 : 0;
            default -> -1;
        };
    }

    private String resolvePeriodKey(String featureKey) {
        return switch (featureKey) {
            case FEATURE_DOCUMENT_IMPORT, FEATURE_PERSONAL_VIDEO ->
                    YearMonth.now(VN_ZONE).format(DateTimeFormatter.ofPattern("yyyy-MM"));
            default ->
                    LocalDate.now(VN_ZONE).format(DateTimeFormatter.ISO_LOCAL_DATE);
        };
    }

    private String buildUpgradeRequiredMessage(String featureKey, String activeTier) {
        return switch (featureKey) {
            case FEATURE_PERSONAL_VIDEO ->
                    "Gói " + activeTier + " chưa mở khóa tính năng Import Video AI cá nhân. Nâng cấp PLUS (10.000đ/30 ngày) hoặc PRO để mở khóa ngay!";
            default ->
                    "Tính năng này yêu cầu nâng cấp gói PLUS hoặc PRO để mở khóa.";
        };
    }

    private String buildQuotaExceededMessage(String featureKey, String activeTier, int limit) {
        return switch (featureKey) {
            case FEATURE_AI_EXPLAIN ->
                    "Bạn đã dùng hết " + limit + "/" + limit + " lượt AI giải thích đáp án hôm nay của gói " + activeTier
                            + ". Nâng cấp PLUS (30 lượt/ngày) hoặc PRO (Không giới hạn) để tiếp tục!";
            case FEATURE_CAMERA_AI ->
                    "Bạn đã dùng hết " + limit + "/" + limit + " lượt Camera AI hôm nay của gói " + activeTier
                            + ". Nâng cấp PLUS (20 lượt/ngày) hoặc PRO (Không giới hạn) để tiếp tục!";
            case FEATURE_DOCUMENT_IMPORT ->
                    "Bạn đã dùng hết " + limit + "/" + limit + " lượt Upload đề thi trong tháng của gói " + activeTier
                            + ". Nâng cấp PLUS (10 đề/tháng) hoặc PRO (Không giới hạn) để tiếp tục!";
            case FEATURE_PERSONAL_VIDEO ->
                    "Bạn đã dùng hết " + limit + "/" + limit + " lượt Import Video AI trong tháng của gói " + activeTier
                            + ". Nâng cấp gói PRO để mở khóa Không giới hạn!";
            default ->
                    "Bạn đã hết lượt sử dụng trong kỳ của gói " + activeTier + ". Vui lòng nâng cấp gói để tiếp tục!";
        };
    }

    private void refreshExpiredStatusIfNeeded(PaymentOrder order) {
        if ("PENDING".equalsIgnoreCase(order.getStatus())
                && order.getExpiresAt() != null
                && order.getExpiresAt().isBefore(LocalDateTime.now())) {
            order.setStatus("EXPIRED");
            paymentOrderRepository.save(order);
        }
    }

    private PaymentOrderResponse toPaymentOrderResponse(PaymentOrder order) {
        String bank = sepayBankCode != null && !sepayBankCode.isBlank() ? sepayBankCode.trim() : "MBBank";
        String acc = sepayAccountNumber != null && !sepayAccountNumber.isBlank() ? sepayAccountNumber.trim() : "0782733887";
        String accName = sepayAccountName != null && !sepayAccountName.isBlank() ? sepayAccountName.trim() : "Y A DIN BYA";
        String qrUrl = String.format(
                "https://qr.sepay.vn/img?acc=%s&bank=%s&amount=%d&des=%s&template=compact",
                URLEncoder.encode(acc, StandardCharsets.UTF_8),
                URLEncoder.encode(bank, StandardCharsets.UTF_8),
                order.getAmountVnd() != null ? order.getAmountVnd() : 0L,
                URLEncoder.encode(order.getOrderCode(), StandardCharsets.UTF_8)
        );
        return PaymentOrderResponse.builder()
                .id(order.getId())
                .orderCode(order.getOrderCode())
                .planCode(order.getPlanCode())
                .planTier(order.getPlanTier())
                .durationDays(order.getDurationDays() != null ? order.getDurationDays() : 30)
                .amountVnd(order.getAmountVnd() != null ? order.getAmountVnd() : 0L)
                .bonusDiamonds(order.getBonusDiamonds() != null ? order.getBonusDiamonds() : 0)
                .status(order.getStatus())
                .bankCode(bank)
                .accountNumber(acc)
                .accountName(accName)
                .transferContent(order.getOrderCode())
                .qrImageUrl(qrUrl)
                .expiresAt(order.getExpiresAt())
                .paidAt(order.getPaidAt())
                .createdAt(order.getCreatedAt())
                .build();
    }

    private String sanitizePrefix(String rawPrefix) {
        if (rawPrefix == null || rawPrefix.isBlank()) {
            return "TOEIC";
        }
        String cleaned = rawPrefix.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
        return cleaned.isEmpty() ? "TOEIC" : cleaned;
    }

    private String generateUniqueOrderCode(String prefix, Long userId) {
        long timePart = System.currentTimeMillis() % 1_000_000L;
        int randPart = ThreadLocalRandom.current().nextInt(10, 99);
        long uidPart = userId != null ? (userId % 1000L) : 0L;
        return String.format("%s%d%06d%02d", prefix, uidPart, timePart, randPart);
    }

    private int tierRank(String tier) {
        if ("PRO".equalsIgnoreCase(tier)) {
            return 2;
        }
        if ("PLUS".equalsIgnoreCase(tier)) {
            return 1;
        }
        return 0;
    }

    private boolean isPrivilegeBypassed(User user) {
        return user.getRole() != null
                && ("ADMIN".equalsIgnoreCase(user.getRole().name())
                || "CONTENT_MANAGER".equalsIgnoreCase(user.getRole().name()));
    }

    private User findUserByEmail(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
    }
}
