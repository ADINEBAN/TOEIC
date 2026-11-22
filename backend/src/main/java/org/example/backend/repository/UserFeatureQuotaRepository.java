package org.example.backend.repository;

import org.example.backend.entity.UserFeatureQuota;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserFeatureQuotaRepository extends JpaRepository<UserFeatureQuota, Long> {

    Optional<UserFeatureQuota> findByUserIdAndFeatureKeyAndPeriodKey(
            Long userId,
            String featureKey,
            String periodKey
    );
}
