package org.example.backend.repository;

import org.example.backend.entity.AiQuestionExplanation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AiQuestionExplanationRepository extends JpaRepository<AiQuestionExplanation, Long> {
    Optional<AiQuestionExplanation> findFirstByQuestionIdAndSelectedLabelAndExplainType(
            Long questionId,
            String selectedLabel,
            String explainType
    );
}
