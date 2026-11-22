package org.example.backend.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentOrderResponse {
    private Long id;
    private String orderCode;
    private String planCode;
    private String planTier;
    private int durationDays;
    private long amountVnd;
    private int bonusDiamonds;
    private String status;
    private String bankCode;
    private String accountNumber;
    private String accountName;
    private String transferContent;
    private String qrImageUrl;
    private LocalDateTime expiresAt;
    private LocalDateTime paidAt;
    private LocalDateTime createdAt;
}
