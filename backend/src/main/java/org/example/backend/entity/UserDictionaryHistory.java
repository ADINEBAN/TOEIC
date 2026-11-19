package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "user_dictionary_history",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_user_dict_history_word", columnNames = {"user_id", "normalized_word"})
        },
        indexes = {
                @Index(name = "idx_user_dict_history_recent", columnList = "user_id,last_looked_up_at")
        }
)
@Getter
@Setter
public class UserDictionaryHistory extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

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

    @Column(name = "lookup_count", nullable = false)
    private Integer lookupCount = 1;

    @Column(name = "last_looked_up_at", nullable = false)
    private LocalDateTime lastLookedUpAt = LocalDateTime.now();
}
