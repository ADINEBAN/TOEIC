package org.example.backend.repository;

import org.example.backend.entity.CosmeticItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CosmeticItemRepository extends JpaRepository<CosmeticItem, String> {
    List<CosmeticItem> findByActiveTrueOrderBySortOrderAsc();
}
