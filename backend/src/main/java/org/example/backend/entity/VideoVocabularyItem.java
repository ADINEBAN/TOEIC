package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "video_vocabulary_items")
@Getter
@Setter
public class VideoVocabularyItem extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "imported_video_id", nullable = false)
    private ImportedVideo importedVideo;

    @Column(name = "segment_id")
    private Long segmentId;

    @Column(name = "word", nullable = false, length = 150)
    private String word;

    @Column(name = "normalized_word", nullable = false, length = 150)
    private String normalizedWord;

    @Column(name = "pronunciation", length = 150)
    private String pronunciation;

    @Column(name = "part_of_speech", length = 100)
    private String partOfSpeech;

    @Column(name = "meaning_vi", columnDefinition = "TEXT")
    private String meaningVi;

    @Column(name = "meaning_en", columnDefinition = "TEXT")
    private String meaningEn;

    @Column(name = "example_sentence", columnDefinition = "TEXT")
    private String exampleSentence;

    @Column(name = "example_translation", columnDefinition = "TEXT")
    private String exampleTranslation;

    @Column(name = "grammar_note", columnDefinition = "TEXT")
    private String grammarNote;

    @Column(name = "source", length = 50)
    private String source;
}
