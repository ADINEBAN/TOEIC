package org.example.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.example.backend.dto.request.ConfirmDocumentExamRequest;
import org.example.backend.dto.request.DocumentQuestionUpdateRequest;
import org.example.backend.dto.response.ImportedDocumentPassageResponse;
import org.example.backend.dto.response.ImportedDocumentQuestionResponse;
import org.example.backend.dto.response.ImportedDocumentResponse;
import org.example.backend.dto.response.TestPartResponse;
import org.example.backend.dto.response.TestResponse;
import org.example.backend.entity.*;
import org.example.backend.enums.ErrorCode;
import org.example.backend.enums.QuestionSourceType;
import org.example.backend.exception.AppException;
import org.example.backend.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class DocumentExamService {

    private static final Logger logger = LoggerFactory.getLogger(DocumentExamService.class);
    private static final MediaType JSON_MEDIA_TYPE = MediaType.parse("application/json; charset=utf-8");

    private final UserRepository userRepository;
    private final ImportedDocumentRepository importedDocumentRepository;
    private final ImportedDocumentPassageRepository importedDocumentPassageRepository;
    private final ImportedDocumentQuestionRepository importedDocumentQuestionRepository;
    private final TestRepository testRepository;
    private final TestPartRepository testPartRepository;
    private final QuestionRepository questionRepository;
    private final TestPartQuestionRepository testPartQuestionRepository;
    private final DocumentTextExtractionService extractionService;
    private final ToeicDocumentParserService parserService;
    private final ToeicDocumentValidationService validationService;
    private final ObjectMapper objectMapper;

    @Value("${openai.api-key:}")
    private String openAiApiKey;

    @Value("${openai.model:gpt-4o-mini}")
    private String openAiModel;

    @Value("${openai.base-url:https://api.openai.com/v1/chat/completions}")
    private String openAiBaseUrl;

    private final OkHttpClient httpClient = new OkHttpClient.Builder()
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(45, TimeUnit.SECONDS)
            .build();

    @Transactional
    public ImportedDocumentResponse uploadAndExtractDocument(String email, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_FILE);
        }
        User user = findUser(email);
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException ex) {
            throw new AppException(ErrorCode.FILE_PROCESSING_ERROR);
        }

        String originalName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "toeic_document.txt";
        String sha256 = extractionService.computeSha256Hex(bytes);

        // Duplicate import guard per user
        Optional<ImportedDocument> existing = importedDocumentRepository.findFirstByUserIdAndSha256Hash(user.getId(), sha256);
        if (existing.isPresent()) {
            return buildDocumentResponse(existing.get());
        }

        DocumentTextExtractionService.DocumentExtractionResult extracted = extractionService.extract(originalName, bytes);
        String storagePath = extractionService.storeUploadedDocument(user.getId(), sha256, originalName, bytes);

        ImportedDocument doc = new ImportedDocument();
        doc.setUser(user);
        doc.setFileName(originalName);
        doc.setFileFormat(extracted.detectedFormat());
        doc.setFileSizeBytes((long) bytes.length);
        doc.setSha256Hash(sha256);
        doc.setStoragePath(storagePath);
        doc.setPageCount(extracted.pageCount());
        doc.setOcrUsed(extracted.ocrUsed());
        doc.setOcrEngine(extracted.ocrEngine());
        doc.setRawExtractedText(extracted.fullAnnotatedText());
        doc.setStatus("EXTRACTED");
        doc = importedDocumentRepository.save(doc);

        ToeicDocumentParserService.ParsedDocumentResult parsed = parserService.parse(extracted);

        Map<String, ImportedDocumentPassage> passageByCode = new LinkedHashMap<>();
        List<ImportedDocumentPassage> savedPassages = new ArrayList<>();
        int pOrder = 1;
        for (ToeicDocumentParserService.ParsedPassage pp : parsed.passages()) {
            ImportedDocumentPassage entity = new ImportedDocumentPassage();
            entity.setDocument(doc);
            entity.setPassageCode(pp.passageCode());
            entity.setPartNo(pp.partNo());
            entity.setPassageType(pp.passageType());
            entity.setDocumentKind(pp.documentKind());
            entity.setPageNumber(pp.pageNumber());
            entity.setContent(pp.content());
            entity.setTableJson(pp.tableJson());
            entity.setLinkedPassageCodes(pp.linkedPassageCodes());
            entity.setSortOrder(pOrder++);
            entity = importedDocumentPassageRepository.save(entity);
            savedPassages.add(entity);
            passageByCode.put(entity.getPassageCode(), entity);
        }

        List<ImportedDocumentQuestion> savedQuestions = new ArrayList<>();
        int qOrder = 1;
        for (ToeicDocumentParserService.ParsedQuestion pq : parsed.questions()) {
            ImportedDocumentQuestion entity = new ImportedDocumentQuestion();
            entity.setDocument(doc);
            if (pq.passageCode() != null && passageByCode.containsKey(pq.passageCode())) {
                entity.setPassage(passageByCode.get(pq.passageCode()));
            }
            entity.setPartNo(pq.partNo());
            entity.setOriginalQuestionNumber(pq.originalQuestionNumber());
            entity.setPageNumber(pq.pageNumber());
            entity.setQuestionText(pq.questionText());
            entity.setOptionsJson(serializeOptions(pq.options()));
            entity.setOfficialCorrectLabel(pq.officialCorrectLabel());
            entity.setAnswerKeyVerified(pq.answerKeyVerified());
            entity.setExtractionConfidence(pq.extractionConfidence());
            entity.setIncluded(true);
            entity.setSortOrder(qOrder++);
            savedQuestions.add(entity);
        }
        savedQuestions = importedDocumentQuestionRepository.saveAll(savedQuestions);

        Map<String, Object> summary = validationService.validateAndAnnotate(
                doc, savedPassages, savedQuestions, parsed.extractedAnswerKeys(), parsed.parserNotices()
        );
        importedDocumentQuestionRepository.saveAll(savedQuestions);

        int invalidCount = ((Number) summary.getOrDefault("invalidCount", 0)).intValue();
        int warningCount = ((Number) summary.getOrDefault("warningCount", 0)).intValue();
        doc.setStatus((invalidCount > 0 || warningCount > 0 || savedQuestions.isEmpty()) ? "NEEDS_REVIEW" : "EXTRACTED");
        doc.setValidationSummaryJson(toJson(summary));
        importedDocumentRepository.save(doc);

        return buildDocumentResponse(doc);
    }

    @Transactional(readOnly = true)
    public List<ImportedDocumentResponse> getMyDocuments(String email) {
        User user = findUser(email);
        List<ImportedDocument> docs = importedDocumentRepository.findByUserIdOrderByCreatedAtDesc(user.getId());
        List<ImportedDocumentResponse> out = new ArrayList<>();
        for (ImportedDocument doc : docs) {
            out.add(buildDocumentResponse(doc));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public ImportedDocumentResponse getDocumentDetail(String email, Long documentId) {
        ImportedDocument doc = findOwnedDocument(email, documentId);
        return buildDocumentResponse(doc);
    }

    @Transactional
    public ImportedDocumentResponse updateExtractedQuestion(
            String email,
            Long documentId,
            Long docQuestionId,
            DocumentQuestionUpdateRequest request
    ) {
        ImportedDocument doc = findOwnedDocument(email, documentId);
        ImportedDocumentQuestion q = importedDocumentQuestionRepository.findById(docQuestionId)
                .orElseThrow(() -> new AppException(ErrorCode.QUESTION_NOT_FOUND));
        if (!q.getDocument().getId().equals(doc.getId())) {
            throw new AppException(ErrorCode.INVALID_TOKEN);
        }

        if (request.getPartNo() != null) {
            if (request.getPartNo() < 5 || request.getPartNo() > 7) {
                throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
            }
            q.setPartNo(request.getPartNo());
        }
        if (request.getOriginalQuestionNumber() != null) {
            q.setOriginalQuestionNumber(request.getOriginalQuestionNumber());
        }
        if (request.getPageNumber() != null && request.getPageNumber() > 0) {
            q.setPageNumber(request.getPageNumber());
        }
        if (request.getQuestionText() != null && !request.getQuestionText().isBlank()) {
            q.setQuestionText(request.getQuestionText().trim());
        }
        if (request.getOptions() != null && !request.getOptions().isEmpty()) {
            List<ToeicDocumentParserService.ParsedOption> updated = request.getOptions().stream()
                    .map(o -> new ToeicDocumentParserService.ParsedOption(
                            o.getOptionLabel().trim().toUpperCase(Locale.ROOT),
                            o.getOptionText() != null ? o.getOptionText().trim() : ""
                    ))
                    .toList();
            q.setOptionsJson(serializeOptions(updated));
        }
        if (request.getOfficialCorrectLabel() != null) {
            String lbl = request.getOfficialCorrectLabel().trim().toUpperCase(Locale.ROOT);
            if (lbl.isEmpty()) {
                q.setOfficialCorrectLabel(null);
                q.setAnswerKeyVerified(false);
            } else if (lbl.matches("[A-D]")) {
                q.setOfficialCorrectLabel(lbl);
                q.setAnswerKeyVerified(request.getAnswerKeyVerified() == null || request.getAnswerKeyVerified());
            }
        }
        if (request.getPassageId() != null) {
            if (request.getPassageId() <= 0) {
                q.setPassage(null);
            } else {
                ImportedDocumentPassage passage = importedDocumentPassageRepository.findById(request.getPassageId())
                        .orElseThrow(() -> new AppException(ErrorCode.QUESTION_NOT_FOUND));
                if (!passage.getDocument().getId().equals(doc.getId())) {
                    throw new AppException(ErrorCode.INVALID_TOKEN);
                }
                q.setPassage(passage);
            }
        }
        if (request.getIncluded() != null) {
            q.setIncluded(request.getIncluded());
        }

        importedDocumentQuestionRepository.save(q);
        revalidateAndPersistSummary(doc);
        return buildDocumentResponse(doc);
    }

    @Transactional
    public ImportedDocumentResponse removeExtractedQuestion(String email, Long documentId, Long docQuestionId) {
        ImportedDocument doc = findOwnedDocument(email, documentId);
        ImportedDocumentQuestion q = importedDocumentQuestionRepository.findById(docQuestionId)
                .orElseThrow(() -> new AppException(ErrorCode.QUESTION_NOT_FOUND));
        if (!q.getDocument().getId().equals(doc.getId())) {
            throw new AppException(ErrorCode.INVALID_TOKEN);
        }
        importedDocumentQuestionRepository.delete(q);
        revalidateAndPersistSummary(doc);
        return buildDocumentResponse(doc);
    }

    @Transactional
    public ImportedDocumentResponse analyzeAnswersWithAi(String email, Long documentId) {
        ImportedDocument doc = findOwnedDocument(email, documentId);
        List<ImportedDocumentQuestion> questions = importedDocumentQuestionRepository.findByDocumentIdOrderBySortOrderAsc(doc.getId());

        for (ImportedDocumentQuestion q : questions) {
            if (!Boolean.TRUE.equals(q.getIncluded())) {
                continue;
            }
            List<ImportedDocumentQuestionResponse.OptionDto> opts = parseOptionsDto(q.getOptionsJson());
            if (opts.isEmpty()) {
                continue;
            }

            if (openAiApiKey != null && !openAiApiKey.isBlank()) {
                AiSuggestion sug = suggestAnswerViaOpenAi(q, opts);
                if (sug != null) {
                    q.setAiSuggestedLabel(sug.label());
                    q.setAiSuggestedExplanation(sug.explanation());
                    // CRITICAL: Never mark AI suggestion as official verified answer key
                    if (!Boolean.TRUE.equals(q.getAnswerKeyVerified())) {
                        q.setOfficialCorrectLabel(null);
                    }
                    continue;
                }
            }

            // Explicit offline fallback clearly tagged as AI heuristic (never official)
            q.setAiSuggestedLabel(null);
            q.setAiSuggestedExplanation(
                    "Cần cấu hình OPENAI_API_KEY để kích hoạt phân tích đáp án gợi ý cho câu chưa có đáp án gốc."
            );
        }

        importedDocumentQuestionRepository.saveAll(questions);
        return buildDocumentResponse(doc);
    }

    @Transactional
    public TestResponse confirmAndGenerateExam(
            String email,
            Long documentId,
            ConfirmDocumentExamRequest request
    ) {
        User user = findUser(email);
        ImportedDocument doc = findOwnedDocument(email, documentId);
        List<ImportedDocumentQuestion> allDocQuestions =
                importedDocumentQuestionRepository.findByDocumentIdOrderBySortOrderAsc(doc.getId());

        Set<Integer> allowedParts = new LinkedHashSet<>();
        if (request != null && request.getSelectedParts() != null && !request.getSelectedParts().isEmpty()) {
            for (Integer p : request.getSelectedParts()) {
                if (p != null && p >= 5 && p <= 7) {
                    allowedParts.add(p);
                }
            }
        }
        if (allowedParts.isEmpty()) {
            allowedParts.addAll(List.of(5, 6, 7));
        }

        List<ImportedDocumentQuestion> selected = allDocQuestions.stream()
                .filter(q -> Boolean.TRUE.equals(q.getIncluded()))
                .filter(q -> q.getPartNo() != null && allowedParts.contains(q.getPartNo()))
                .filter(q -> !parseOptionsDto(q.getOptionsJson()).isEmpty())
                .toList();

        if (selected.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }

        String partTag = allowedParts.size() == 3
                ? "Part 5-6-7"
                : "Part " + allowedParts.stream().sorted().map(String::valueOf).reduce((a, b) -> a + "+" + b).orElse("5");

        Test test = new Test();
        test.setOwnerUserId(user.getId());
        test.setSourceDocumentId(doc.getId());
        test.setTitle(request != null && request.getTestTitle() != null && !request.getTestTitle().isBlank()
                ? request.getTestTitle().trim()
                : stripExt(doc.getFileName()) + " (" + partTag + ")");
        test.setDescription(request != null && request.getDescription() != null && !request.getDescription().isBlank()
                ? request.getDescription().trim()
                : "Generated from uploaded document: " + doc.getFileName() + " [" + partTag + "]");
        test.setTestType(allowedParts.size() == 1 ? "PART_" + allowedParts.iterator().next() : "READING_ONLY");
        int estMinutes = request != null && request.getDurationMinutes() != null && request.getDurationMinutes() > 0
                ? request.getDurationMinutes()
                : Math.max(5, selected.size() * 2);
        test.setTotalDurationMinutes(estMinutes);
        test.setPublished(false); // Private to owner user (multi-user isolated)
        test = testRepository.save(test);

        Map<Integer, List<ImportedDocumentQuestion>> byPart = new TreeMap<>();
        for (ImportedDocumentQuestion q : selected) {
            byPart.computeIfAbsent(q.getPartNo(), k -> new ArrayList<>()).add(q);
        }

        int partOrder = 1;
        List<TestPartResponse> partResponses = new ArrayList<>();
        for (Map.Entry<Integer, List<ImportedDocumentQuestion>> entry : byPart.entrySet()) {
            int partNo = entry.getKey();
            List<ImportedDocumentQuestion> partQuestions = entry.getValue();

            TestPart testPart = new TestPart();
            testPart.setTest(test);
            testPart.setPartNumber(partNo);
            testPart.setPartName(switch (partNo) {
                case 5 -> "Reading Part 5 - Incomplete Sentences";
                case 6 -> "Reading Part 6 - Text Completion";
                default -> "Reading Part 7 - Reading Comprehension";
            });
            testPart.setPartSection("READING");
            testPart.setDescription("Extracted faithfully from " + doc.getFileName());
            testPart.setSortOrder(partOrder++);
            testPart.setDurationMinutes(Math.max(3, partQuestions.size()));
            testPart.setQuestionCount(partQuestions.size());
            testPart = testPartRepository.save(testPart);

            int qOrder = 1;
            for (ImportedDocumentQuestion dq : partQuestions) {
                Question qEntity = new Question();
                qEntity.setPartNo(partNo);
                qEntity.setQuestionText(dq.getQuestionText());
                qEntity.setSourceType(QuestionSourceType.INTERNAL);
                qEntity.setDifficultyLevel("INTERMEDIATE");
                qEntity.setSourceDocumentId(doc.getId());
                qEntity.setSourcePageNumber(dq.getPageNumber());
                qEntity.setOriginalQuestionNumber(dq.getOriginalQuestionNumber());
                qEntity.setExtractionConfidence(dq.getExtractionConfidence());
                qEntity.setValidationStatus(dq.getValidationStatus());
                qEntity.setAnswerKeyVerified(Boolean.TRUE.equals(dq.getAnswerKeyVerified()));

                if (dq.getPassage() != null) {
                    qEntity.setPassageText(dq.getPassage().getContent());
                    qEntity.setQuestionGroupCode("DOC_" + doc.getId() + "_" + dq.getPassage().getPassageCode());
                }
                if (Boolean.TRUE.equals(dq.getAnswerKeyVerified()) && dq.getOfficialCorrectLabel() != null) {
                    qEntity.setExplanation("Official document answer key: (" + dq.getOfficialCorrectLabel() + ") [Source page " + dq.getPageNumber() + "]");
                } else {
                    qEntity.setExplanation("Unverified answer key in source document [Source page " + dq.getPageNumber() + "]. "
                            + (dq.getAiSuggestedLabel() != null ? "AI suggested (" + dq.getAiSuggestedLabel() + ") - unverified." : ""));
                }

                List<ImportedDocumentQuestionResponse.OptionDto> optDtos = parseOptionsDto(dq.getOptionsJson());
                List<QuestionOption> optionEntities = new ArrayList<>();
                for (ImportedDocumentQuestionResponse.OptionDto od : optDtos) {
                    QuestionOption opt = new QuestionOption();
                    opt.setQuestion(qEntity);
                    opt.setOptionLabel(od.getOptionLabel());
                    opt.setOptionText(od.getOptionText());
                    // CRITICAL: Strictly only mark isCorrect=true if official answer key from document is verified
                    boolean isCorrect = Boolean.TRUE.equals(dq.getAnswerKeyVerified())
                            && dq.getOfficialCorrectLabel() != null
                            && dq.getOfficialCorrectLabel().equalsIgnoreCase(od.getOptionLabel());
                    opt.setCorrect(isCorrect);
                    optionEntities.add(opt);
                }
                qEntity.setOptions(optionEntities);
                qEntity = questionRepository.save(qEntity);

                dq.setSavedQuestionId(qEntity.getId());
                importedDocumentQuestionRepository.save(dq);

                TestPartQuestion tpq = new TestPartQuestion();
                tpq.setTestPart(testPart);
                tpq.setQuestion(qEntity);
                tpq.setSortOrder(qOrder++);
                testPartQuestionRepository.save(tpq);
            }

            TestPartResponse pr = new TestPartResponse();
            pr.setId(testPart.getId());
            pr.setPartName(testPart.getPartName());
            pr.setPartNumber(testPart.getPartNumber());
            pr.setPartSection(testPart.getPartSection());
            pr.setQuestionCount(testPart.getQuestionCount());
            partResponses.add(pr);
        }

        doc.setGeneratedTestId(test.getId());
        doc.setStatus("CONFIRMED");
        importedDocumentRepository.save(doc);

        TestResponse resp = new TestResponse();
        resp.setId(test.getId());
        resp.setTitle(test.getTitle());
        resp.setDescription(test.getDescription());
        resp.setTestType(test.getTestType());
        resp.setTotalDurationMinutes(test.getTotalDurationMinutes());
        resp.setPublished(test.getPublished());
        resp.setPartCount(partResponses.size());
        resp.setQuestionCount(selected.size());
        resp.setCreatedAt(test.getCreatedAt());
        resp.setUpdatedAt(test.getUpdatedAt());
        resp.setParts(partResponses);
        return resp;
    }

    @Transactional(readOnly = true)
    public List<TestResponse> getMyGeneratedExams(String email) {
        User user = findUser(email);
        List<Test> tests = testRepository.findByOwnerUserIdOrderByCreatedAtDesc(user.getId());
        List<TestResponse> out = new ArrayList<>();
        for (Test t : tests) {
            TestResponse r = new TestResponse();
            r.setId(t.getId());
            r.setTitle(t.getTitle());
            r.setDescription(t.getDescription());
            r.setTestType(t.getTestType());
            r.setTotalDurationMinutes(t.getTotalDurationMinutes());
            r.setPublished(t.getPublished());
            int qCount = t.getParts() == null ? 0 : t.getParts().stream()
                    .mapToInt(p -> p.getQuestionCount() == null ? 0 : p.getQuestionCount()).sum();
            r.setPartCount(t.getParts() != null ? t.getParts().size() : 0);
            r.setQuestionCount(qCount);
            r.setCreatedAt(t.getCreatedAt());
            r.setUpdatedAt(t.getUpdatedAt());
            out.add(r);
        }
        return out;
    }

    private void revalidateAndPersistSummary(ImportedDocument doc) {
        List<ImportedDocumentPassage> passages = importedDocumentPassageRepository.findByDocumentIdOrderBySortOrderAsc(doc.getId());
        List<ImportedDocumentQuestion> questions = importedDocumentQuestionRepository.findByDocumentIdOrderBySortOrderAsc(doc.getId());
        Map<String, Object> summary = validationService.validateAndAnnotate(doc, passages, questions, Map.of(), List.of());
        importedDocumentQuestionRepository.saveAll(questions);
        doc.setValidationSummaryJson(toJson(summary));
        importedDocumentRepository.save(doc);
    }

    private ImportedDocumentResponse buildDocumentResponse(ImportedDocument doc) {
        List<ImportedDocumentPassage> passages = importedDocumentPassageRepository.findByDocumentIdOrderBySortOrderAsc(doc.getId());
        List<ImportedDocumentQuestion> questions = importedDocumentQuestionRepository.findByDocumentIdOrderBySortOrderAsc(doc.getId());
        List<Test> generated = testRepository.findBySourceDocumentIdOrderByCreatedAtDesc(doc.getId());

        List<ImportedDocumentPassageResponse> passageDtos = passages.stream()
                .map(p -> ImportedDocumentPassageResponse.builder()
                        .id(p.getId())
                        .passageCode(p.getPassageCode())
                        .partNo(p.getPartNo())
                        .passageType(p.getPassageType())
                        .documentKind(p.getDocumentKind())
                        .pageNumber(p.getPageNumber())
                        .content(p.getContent())
                        .tableJson(p.getTableJson())
                        .linkedPassageCodes(p.getLinkedPassageCodes())
                        .sortOrder(p.getSortOrder())
                        .build())
                .toList();

        List<ImportedDocumentQuestionResponse> questionDtos = questions.stream()
                .map(q -> ImportedDocumentQuestionResponse.builder()
                        .id(q.getId())
                        .passageId(q.getPassage() != null ? q.getPassage().getId() : null)
                        .passageCode(q.getPassage() != null ? q.getPassage().getPassageCode() : null)
                        .partNo(q.getPartNo())
                        .originalQuestionNumber(q.getOriginalQuestionNumber())
                        .pageNumber(q.getPageNumber())
                        .questionText(q.getQuestionText())
                        .options(parseOptionsDto(q.getOptionsJson()))
                        .officialCorrectLabel(q.getOfficialCorrectLabel())
                        .answerKeyVerified(q.getAnswerKeyVerified())
                        .aiSuggestedLabel(q.getAiSuggestedLabel())
                        .aiSuggestedExplanation(q.getAiSuggestedExplanation())
                        .extractionConfidence(q.getExtractionConfidence())
                        .validationStatus(q.getValidationStatus())
                        .validationIssues(parseStringList(q.getValidationIssuesJson()))
                        .included(q.getIncluded())
                        .savedQuestionId(q.getSavedQuestionId())
                        .sortOrder(q.getSortOrder())
                        .build())
                .toList();

        List<TestResponse> examDtos = generated.stream().map(t -> {
            TestResponse r = new TestResponse();
            r.setId(t.getId());
            r.setTitle(t.getTitle());
            r.setDescription(t.getDescription());
            r.setTestType(t.getTestType());
            r.setTotalDurationMinutes(t.getTotalDurationMinutes());
            r.setPublished(t.getPublished());
            int qCount = t.getParts() == null ? 0 : t.getParts().stream()
                    .mapToInt(p -> p.getQuestionCount() == null ? 0 : p.getQuestionCount()).sum();
            r.setPartCount(t.getParts() != null ? t.getParts().size() : 0);
            r.setQuestionCount(qCount);
            r.setCreatedAt(t.getCreatedAt());
            return r;
        }).toList();

        String rawText = doc.getRawExtractedText() != null ? doc.getRawExtractedText() : "";
        String preview = rawText.length() > 3000 ? rawText.substring(0, 3000) + "\n..." : rawText;

        return ImportedDocumentResponse.builder()
                .id(doc.getId())
                .fileName(doc.getFileName())
                .fileFormat(doc.getFileFormat())
                .fileSizeBytes(doc.getFileSizeBytes())
                .sha256Hash(doc.getSha256Hash())
                .pageCount(doc.getPageCount())
                .ocrUsed(doc.getOcrUsed())
                .ocrEngine(doc.getOcrEngine())
                .status(doc.getStatus())
                .rawTextPreview(preview)
                .generatedTestId(doc.getGeneratedTestId())
                .validationSummary(parseMap(doc.getValidationSummaryJson()))
                .passages(passageDtos)
                .questions(questionDtos)
                .generatedExams(examDtos)
                .createdAt(doc.getCreatedAt())
                .updatedAt(doc.getUpdatedAt())
                .build();
    }

    private record AiSuggestion(String label, String explanation) {}

    @SuppressWarnings("unchecked")
    private AiSuggestion suggestAnswerViaOpenAi(
            ImportedDocumentQuestion q,
            List<ImportedDocumentQuestionResponse.OptionDto> opts
    ) {
        try {
            StringBuilder optText = new StringBuilder();
            for (ImportedDocumentQuestionResponse.OptionDto o : opts) {
                optText.append("(").append(o.getOptionLabel()).append(") ").append(o.getOptionText()).append("\n");
            }
            String passage = q.getPassage() != null ? q.getPassage().getContent() : "";
            String prompt = (passage.isBlank() ? "" : "Passage:\n" + passage + "\n\n")
                    + "Question #" + q.getOriginalQuestionNumber() + " (Part " + q.getPartNo() + "):\n"
                    + q.getQuestionText() + "\n" + optText
                    + "\nRespond with ONLY JSON: {\"label\":\"A|B|C|D\",\"explanation\":\"short explanation in Vietnamese\"}";

            Map<String, Object> body = Map.of(
                    "model", openAiModel == null || openAiModel.isBlank() ? "gpt-4o-mini" : openAiModel,
                    "messages", List.of(
                            Map.of("role", "system", "content", "You analyze TOEIC Part 5-7 questions strictly based on the text provided."),
                            Map.of("role", "user", "content", prompt)
                    )
            );
            String endpoint = openAiBaseUrl == null || openAiBaseUrl.isBlank()
                    ? "https://api.openai.com/v1/chat/completions"
                    : openAiBaseUrl;
            Request req = new Request.Builder()
                    .url(endpoint)
                    .header("Authorization", "Bearer " + openAiApiKey.trim())
                    .header("Content-Type", "application/json")
                    .post(okhttp3.RequestBody.create(objectMapper.writeValueAsString(body), JSON_MEDIA_TYPE))
                    .build();
            try (Response res = httpClient.newCall(req).execute()) {
                if (res.isSuccessful() && res.body() != null) {
                    Map<String, Object> root = objectMapper.readValue(res.body().string(), new TypeReference<>() {});
                    if (root.get("choices") instanceof List<?> choices && !choices.isEmpty()) {
                        Map<String, Object> c0 = (Map<String, Object>) choices.get(0);
                        if (c0.get("message") instanceof Map<?, ?> msg && msg.get("content") != null) {
                            String raw = String.valueOf(msg.get("content"));
                            int s = raw.indexOf('{');
                            int e = raw.lastIndexOf('}');
                            if (s >= 0 && e > s) {
                                Map<String, Object> parsed = objectMapper.readValue(raw.substring(s, e + 1), new TypeReference<>() {});
                                String lbl = parsed.get("label") != null ? String.valueOf(parsed.get("label")).trim().toUpperCase(Locale.ROOT) : "";
                                String exp = parsed.get("explanation") != null ? String.valueOf(parsed.get("explanation")).trim() : "";
                                if (lbl.matches("[A-D]")) {
                                    return new AiSuggestion(lbl, "[AI Suggestion - Unverified] " + exp);
                                }
                            }
                        }
                    }
                }
            }
        } catch (Exception ex) {
            logger.debug("AI answer analysis skipped: {}", ex.getMessage());
        }
        return null;
    }

    private ImportedDocument findOwnedDocument(String email, Long documentId) {
        User user = findUser(email);
        ImportedDocument doc = importedDocumentRepository.findById(documentId)
                .orElseThrow(() -> new AppException(ErrorCode.DOCUMENT_NOT_FOUND));
        if (!doc.getUser().getId().equals(user.getId()) && !"ADMIN".equals(user.getRole().name())) {
            throw new AppException(ErrorCode.INVALID_TOKEN);
        }
        return doc;
    }

    private User findUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_FOUND));
    }

    private String serializeOptions(List<ToeicDocumentParserService.ParsedOption> options) {
        List<ImportedDocumentQuestionResponse.OptionDto> dtos = options.stream()
                .map(o -> ImportedDocumentQuestionResponse.OptionDto.builder()
                        .optionLabel(o.optionLabel())
                        .optionText(o.optionText())
                        .build())
                .toList();
        return toJson(dtos);
    }

    private List<ImportedDocumentQuestionResponse.OptionDto> parseOptionsDto(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception ex) {
            return List.of();
        }
    }

    private List<String> parseStringList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception ex) {
            return List.of();
        }
    }

    private Map<String, Object> parseMap(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (Exception ex) {
            return Map.of();
        }
    }

    private String toJson(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception ex) {
            return "{}";
        }
    }

    private String stripExt(String fileName) {
        int dot = fileName.lastIndexOf('.');
        return dot > 0 ? fileName.substring(0, dot) : fileName;
    }
}
