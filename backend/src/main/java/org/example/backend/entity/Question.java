package org.example.backend.entity;

import lombok.Getter;
import lombok.Setter;
import jakarta.persistence.*;
import org.example.backend.enums.QuestionSourceType;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "questions")
@Getter
@Setter
public class Question extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "part_no", nullable = false)
    private Integer partNo;

    @Column(name = "question_text", nullable = false, columnDefinition = "TEXT")
    private String questionText;

    @Column(columnDefinition = "TEXT")
    private String explanation;

    @Column(name = "difficulty_level", length = 50)
    private String difficultyLevel;

    @Enumerated(EnumType.STRING)
    @Column(name = "source_type", length = 30)
    private QuestionSourceType sourceType;

    @Column(name = "source_year")
    private Integer sourceYear;

    @Column(name = "audio_url")
    private String audioUrl;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "passage_text", columnDefinition = "TEXT")
    private String passageText;

    @Column(columnDefinition = "TEXT")
    private String transcript;

    @Column(name = "question_group_code", length = 100)
    private String questionGroupCode;

    @Column(name = "source_document_id")
    private Long sourceDocumentId;

    @Column(name = "source_page_number")
    private Integer sourcePageNumber;

    @Column(name = "original_question_number")
    private Integer originalQuestionNumber;

    @Column(name = "extraction_confidence")
    private Double extractionConfidence;

    @Column(name = "validation_status", length = 40)
    private String validationStatus;

    @Column(name = "answer_key_verified")
    private Boolean answerKeyVerified;

    @OneToMany(mappedBy = "question", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("optionLabel ASC")
    private List<QuestionOption> options = new ArrayList<>();
}
