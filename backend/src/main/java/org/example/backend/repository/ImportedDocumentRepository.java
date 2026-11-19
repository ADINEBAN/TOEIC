package org.example.backend.repository;

import org.example.backend.entity.ImportedDocument;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ImportedDocumentRepository extends JpaRepository<ImportedDocument, Long> {
    List<ImportedDocument> findByUserIdOrderByCreatedAtDesc(Long userId);
    Optional<ImportedDocument> findFirstByUserIdAndSha256Hash(Long userId, String sha256Hash);
}
