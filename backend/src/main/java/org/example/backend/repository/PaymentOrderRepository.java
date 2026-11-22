package org.example.backend.repository;

import org.example.backend.entity.PaymentOrder;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PaymentOrderRepository extends JpaRepository<PaymentOrder, Long> {

    Optional<PaymentOrder> findByOrderCodeIgnoreCase(String orderCode);

    Optional<PaymentOrder> findBySepayTransactionId(Long sepayTransactionId);

    List<PaymentOrder> findTop20ByUserIdOrderByCreatedAtDesc(Long userId);

    List<PaymentOrder> findAllByStatusOrderByPaidAtDesc(String status);

    long countByStatus(String status);
}
