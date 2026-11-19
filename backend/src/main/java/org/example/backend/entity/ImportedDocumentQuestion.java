package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "imported_document_questions")
@Getter
@Setter
public class ImportedDocumentQuestion extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "document_id", nullable = false)
    private ImportedDocument document;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "passage_id")
    private ImportedDocumentPassage passage;

    @Column(name = "part_no", nullable = false)
    private Integer partNo;

    @Column(name = "original_question_number")
    private Integer originalQuestionNumber;

    @Column(name = "page_number", nullable = false)
    private Integer pageNumber = 1;

    @Column(name = "question_text", nullable = false, columnDefinition = "TEXT")
    private String questionText;

    @Column(name = "options_json", nullable = false, columnDefinition = "LONGTEXT")
    private String optionsJson;

    @Column(name = "official_correct_label", length = 5)
    private String officialCorrectLabel;

    @Column(name = "answer_key_verified", nullable = false)
    private Boolean answerKeyVerified = false;

    @Column(name = "ai_suggested_label", length = 5)
    private String aiSuggestedLabel;

    @Column(name = "ai_suggested_explanation", columnDefinition = "TEXT")
    private String aiSuggestedExplanation;

    @Column(name = "extraction_confidence")
    private Double extractionConfidence = 0.9;

    @Column(name = "validation_status", nullable = false, length = 40)
    private String validationStatus = "VALID";

    @Column(name = "validation_issues_json", columnDefinition = "TEXT")
    private String validationIssuesJson;

    @Column(name = "included", nullable = false)
    private Boolean included = true;

    @Column(name = "saved_question_id")
    private Long savedQuestionId;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;
}
