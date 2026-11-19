package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "dictionary_cache_entries", uniqueConstraints = {
        @UniqueConstraint(name = "uk_dict_cache_normalized_word", columnNames = {"normalized_word"})
})
@Getter
@Setter
public class DictionaryCacheEntry extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "normalized_word", nullable = false, length = 120)
    private String normalizedWord;

    @Column(nullable = false, length = 120)
    private String word;

    @Column(length = 120)
    private String ipa;

    @Column(name = "part_of_speech", length = 50)
    private String partOfSpeech;

    @Column(name = "cefr_level", length = 20)
    private String cefrLevel;

    @Column(name = "meaning_vi", length = 500)
    private String meaningVi;

    @Column(length = 50)
    private String source;

    @Column(nullable = false)
    private Boolean enriched = true;

    @Lob
    @Column(name = "payload_json", nullable = false, columnDefinition = "LONGTEXT")
    private String payloadJson;

    @Column(name = "hit_count", nullable = false)
    private Integer hitCount = 1;

    @Column(name = "last_accessed_at", nullable = false)
    private LocalDateTime lastAccessedAt = LocalDateTime.now();
}
