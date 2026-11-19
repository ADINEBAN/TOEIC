package org.example.backend.repository;

import org.example.backend.entity.DictionaryCacheEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface DictionaryCacheEntryRepository extends JpaRepository<DictionaryCacheEntry, Long> {
    Optional<DictionaryCacheEntry> findByNormalizedWord(String normalizedWord);

    List<DictionaryCacheEntry> findByNormalizedWordIn(Collection<String> normalizedWords);
}
