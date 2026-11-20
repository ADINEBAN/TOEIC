package org.example.backend.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.example.backend.entity.Vocabulary;
import org.example.backend.entity.VocabularyTopic;
import org.example.backend.repository.VocabularyRepository;
import org.example.backend.repository.VocabularyTopicRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.zip.GZIPInputStream;

@Service
@Order(20)
@RequiredArgsConstructor
public class VocabularyCatalogSeeder implements ApplicationRunner {

    private static final Logger logger = LoggerFactory.getLogger(VocabularyCatalogSeeder.class);
    private static final String CATALOG_PATH = "data/vocabulary-catalog.json.gz";
    private static final int BATCH_SIZE = 500;

    private final VocabularyTopicRepository vocabularyTopicRepository;
    private final VocabularyRepository vocabularyRepository;
    private final ObjectMapper objectMapper;

    @Override
    public void run(ApplicationArguments args) {
        try {
            ensureCatalogSeeded();
        } catch (Exception ex) {
            logger.warn("Skipping vocabulary catalog auto-seed cleanly: {}", ex.getMessage());
        }
    }

    @Transactional
    public synchronized void ensureCatalogSeeded() throws Exception {
        ClassPathResource resource = new ClassPathResource(CATALOG_PATH);
        if (!resource.exists()) {
            logger.warn("Vocabulary catalog resource missing: {}", CATALOG_PATH);
            return;
        }

        CatalogPayload payload;
        try (InputStream raw = resource.getInputStream();
             GZIPInputStream gzip = new GZIPInputStream(raw)) {
            payload = objectMapper.readValue(gzip, CatalogPayload.class);
        }
        if (payload == null || payload.getTopics() == null || payload.getTopics().isEmpty()) {
            return;
        }

        Set<String> existingTopicNames = new HashSet<>();
        for (String name : vocabularyTopicRepository.findAllTopicNames()) {
            if (name != null) {
                existingTopicNames.add(name.trim().toLowerCase());
            }
        }

        int addedTopics = 0;
        int addedWords = 0;
        List<Vocabulary> batchBuffer = new ArrayList<>(BATCH_SIZE);

        for (CatalogTopic topicDto : payload.getTopics()) {
            if (topicDto.getName() == null || topicDto.getName().isBlank()) {
                continue;
            }
            String key = topicDto.getName().trim().toLowerCase();
            if (existingTopicNames.contains(key)) {
                continue;
            }

            VocabularyTopic topic = new VocabularyTopic();
            topic.setName(topicDto.getName().trim());
            topic.setDescription(topicDto.getDescription());
            topic.setLevel(topicDto.getLevel());
            topic.setActive(true);
            VocabularyTopic savedTopic = vocabularyTopicRepository.save(topic);
            existingTopicNames.add(key);
            addedTopics++;

            if (topicDto.getWords() != null) {
                for (CatalogWord wordDto : topicDto.getWords()) {
                    if (wordDto.getWord() == null || wordDto.getWord().isBlank() || wordDto.getMeaningVi() == null) {
                        continue;
                    }
                    Vocabulary vocab = new Vocabulary();
                    vocab.setTopic(savedTopic);
                    vocab.setWord(wordDto.getWord().trim());
                    vocab.setIpa(wordDto.getIpa());
                    vocab.setPartOfSpeech(wordDto.getPartOfSpeech());
                    vocab.setDifficultyLevel(wordDto.getDifficultyLevel());
                    vocab.setMeaningVi(wordDto.getMeaningVi().trim());
                    vocab.setMeaningEn(wordDto.getMeaningEn());
                    vocab.setExampleSentence(wordDto.getExampleSentence());
                    vocab.setExampleTranslation(wordDto.getExampleTranslation());
                    batchBuffer.add(vocab);
                    addedWords++;

                    if (batchBuffer.size() >= BATCH_SIZE) {
                        vocabularyRepository.saveAll(batchBuffer);
                        batchBuffer.clear();
                    }
                }
            }
        }

        if (!batchBuffer.isEmpty()) {
            vocabularyRepository.saveAll(batchBuffer);
            batchBuffer.clear();
        }

        if (addedTopics > 0 || addedWords > 0) {
            logger.info("Seeded {} vocabulary topics and {} words from {}.", addedTopics, addedWords, CATALOG_PATH);
        }
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    private static class CatalogPayload {
        private Integer version;
        private List<CatalogTopic> topics;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    private static class CatalogTopic {
        private String name;
        private String description;
        private String level;
        private List<CatalogWord> words;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    private static class CatalogWord {
        private String word;
        private String ipa;
        private String partOfSpeech;
        private String difficultyLevel;
        private String meaningVi;
        private String meaningEn;
        private String exampleSentence;
        private String exampleTranslation;
    }
}
