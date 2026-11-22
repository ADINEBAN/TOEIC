package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "payment_orders")
@Getter
@Setter
public class PaymentOrder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_code", nullable = false, unique = true, length = 40)
    private String orderCode;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "plan_code", nullable = false, length = 30)
    private String planCode;

    @Column(name = "plan_tier", nullable = false, length = 20)
    private String planTier;

    @Column(name = "duration_days", nullable = false)
    private Integer durationDays;

    @Column(name = "amount_vnd", nullable = false)
    private Long amountVnd;

    @Column(name = "bonus_diamonds", nullable = false)
    private Integer bonusDiamonds = 0;

    @Column(name = "status", nullable = false, length = 20)
    private String status = "PENDING";

    @Column(name = "sepay_transaction_id", unique = true)
    private Long sepayTransactionId;

    @Column(name = "gateway", length = 60)
    private String gateway;

    @Column(name = "reference_code", length = 100)
    private String referenceCode;

    @Column(name = "transfer_content", length = 500)
    private String transferContent;

    @Column(name = "paid_at")
    private LocalDateTime paidAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (this.createdAt == null) {
            this.createdAt = now;
        }
        this.updatedAt = now;
    }

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
