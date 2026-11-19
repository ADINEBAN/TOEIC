package org.example.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(
        name = "ai_question_explanations",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_ai_q_sel_type",
                        columnNames = {"question_id", "selected_label", "explain_type"}
                )
        }
)
@Getter
@Setter
public class AiQuestionExplanation extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "question_id", nullable = false)
    private Long questionId;

    @Column(name = "selected_label", nullable = false, length = 20)
    private String selectedLabel;

    @Column(name = "explain_type", nullable = false, length = 30)
    private String explainType;

    @Column(name = "correct_answer", columnDefinition = "TEXT")
    private String correctAnswer;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String explanation;

    @Column(columnDefinition = "TEXT")
    private String tips;
}
