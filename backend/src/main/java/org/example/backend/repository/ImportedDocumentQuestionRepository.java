package org.example.backend.repository;

import org.example.backend.entity.ImportedDocumentQuestion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ImportedDocumentQuestionRepository extends JpaRepository<ImportedDocumentQuestion, Long> {
    List<ImportedDocumentQuestion> findByDocumentIdOrderBySortOrderAsc(Long documentId);
}
