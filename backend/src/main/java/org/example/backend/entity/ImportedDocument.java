package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "imported_documents")
@Getter
@Setter
public class ImportedDocument extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "file_name", nullable = false, length = 255)
    private String fileName;

    @Column(name = "file_format", nullable = false, length = 30)
    private String fileFormat;

    @Column(name = "file_size_bytes", nullable = false)
    private Long fileSizeBytes = 0L;

    @Column(name = "sha256_hash", nullable = false, length = 64)
    private String sha256Hash;

    @Column(name = "storage_path", length = 512)
    private String storagePath;

    @Column(name = "page_count", nullable = false)
    private Integer pageCount = 1;

    @Column(name = "ocr_used", nullable = false)
    private Boolean ocrUsed = false;

    @Column(name = "ocr_engine", length = 50)
    private String ocrEngine;

    @Column(name = "raw_extracted_text", columnDefinition = "LONGTEXT")
    private String rawExtractedText;

    @Column(name = "status", nullable = false, length = 40)
    private String status = "UPLOADED";

    @Column(name = "validation_summary_json", columnDefinition = "LONGTEXT")
    private String validationSummaryJson;

    @Column(name = "generated_test_id")
    private Long generatedTestId;
}
