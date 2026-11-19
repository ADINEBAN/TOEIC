package org.example.backend.repository;

import org.example.backend.entity.ImportedDocumentPassage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ImportedDocumentPassageRepository extends JpaRepository<ImportedDocumentPassage, Long> {
    List<ImportedDocumentPassage> findByDocumentIdOrderBySortOrderAsc(Long documentId);
}
