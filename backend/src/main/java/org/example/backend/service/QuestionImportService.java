package org.example.backend.service;

import org.example.backend.dto.request.CreateQuestionRequest;
import org.example.backend.dto.response.QuestionImportResponse;
import org.example.backend.dto.response.QuestionResponse;
import org.example.backend.entity.Question;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.repository.QuestionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Service
public class QuestionImportService {

    private static final int MAX_ZIP_ENTRIES = 600;
    private static final long MAX_DOC_ENTRY_BYTES = 25L * 1024L * 1024L;

    private final QuestionImportParser questionImportParser;
    private final AdminQuestionBankService adminQuestionBankService;
    private final QuestionRepository questionRepository;
    private final OpenAIAnswerExplainService openAIAnswerExplainService;
    private final QuestionMediaBatchService questionMediaBatchService;

    public QuestionImportService(
            QuestionImportParser questionImportParser,
            AdminQuestionBankService adminQuestionBankService,
            QuestionRepository questionRepository,
            OpenAIAnswerExplainService openAIAnswerExplainService
    ) {
        this(questionImportParser, adminQuestionBankService, questionRepository, openAIAnswerExplainService, null);
    }

    @Autowired
    public QuestionImportService(
            QuestionImportParser questionImportParser,
            AdminQuestionBankService adminQuestionBankService,
            QuestionRepository questionRepository,
            OpenAIAnswerExplainService openAIAnswerExplainService,
            QuestionMediaBatchService questionMediaBatchService
    ) {
        this.questionImportParser = questionImportParser;
        this.adminQuestionBankService = adminQuestionBankService;
        this.questionRepository = questionRepository;
        this.openAIAnswerExplainService = openAIAnswerExplainService;
        this.questionMediaBatchService = questionMediaBatchService;
    }

    @Transactional
    public QuestionImportResponse importFromFile(
            MultipartFile file,
            Integer defaultPartNo,
            boolean autoExplainAi
    ) {
        if (file == null || file.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (Exception ex) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }

        ZipQuestionBundle zipBundle = tryReadZipQuestionBundle(file.getOriginalFilename(), bytes);
        List<CreateQuestionRequest> parsed = zipBundle != null
                ? questionImportParser.parse(zipBundle.questionFilename(), zipBundle.questionBytes(), defaultPartNo)
                : questionImportParser.parse(file.getOriginalFilename(), bytes, defaultPartNo);

        Set<String> existingKeys = new HashSet<>();
        for (Question existing : questionRepository.findAllByOrderByCreatedAtDesc()) {
            existingKeys.add(dedupKey(existing.getPartNo(), existing.getQuestionText()));
        }

        List<CreateQuestionRequest> uniqueRequests = new ArrayList<>();
        int skippedDuplicates = 0;
        for (CreateQuestionRequest req : parsed) {
            String key = dedupKey(req.getPartNo(), req.getQuestionText());
            if (existingKeys.add(key)) {
                uniqueRequests.add(req);
            } else {
                skippedDuplicates++;
            }
        }

        if (zipBundle != null && questionMediaBatchService != null && !uniqueRequests.isEmpty()) {
            attachBundleMediaUrls(zipBundle.mediaCandidates(), uniqueRequests);
        }

        int aiExplainedCount = 0;
        if (autoExplainAi && !uniqueRequests.isEmpty()) {
            aiExplainedCount = openAIAnswerExplainService.batchFillMissingExplanations(uniqueRequests);
        }

        List<QuestionResponse> saved = uniqueRequests.isEmpty()
                ? List.of()
                : adminQuestionBankService.bulkCreateQuestions(uniqueRequests);

        return QuestionImportResponse.builder()
                .totalParsed(parsed.size())
                .importedCount(saved.size())
                .skippedDuplicateCount(skippedDuplicates)
                .aiExplainedCount(aiExplainedCount)
                .items(saved)
                .build();
    }

    private void attachBundleMediaUrls(
            List<QuestionMediaBatchService.MediaCandidate> candidates,
            List<CreateQuestionRequest> requests
    ) {
        if (candidates == null || candidates.isEmpty()) {
            return;
        }
        Map<String, List<QuestionMediaBatchService.MediaCandidate>>[] indexes =
                questionMediaBatchService.buildLookupIndexes(candidates);
        Map<String, List<QuestionMediaBatchService.MediaCandidate>> byRelPath = indexes[0];
        Map<String, List<QuestionMediaBatchService.MediaCandidate>> byBaseName = indexes[1];
        Map<String, List<QuestionMediaBatchService.MediaCandidate>> byStem = indexes[2];
        Map<QuestionMediaBatchService.MediaCandidate, String> cache = new IdentityHashMap<>();

        for (CreateQuestionRequest req : requests) {
            QuestionMediaBatchService.MediaCandidate audio = questionMediaBatchService.findBestCandidate(
                    req.getAudioUrl(),
                    req.getQuestionGroupCode(),
                    "AUDIO",
                    byRelPath,
                    byBaseName,
                    byStem
            );
            if (audio != null) {
                req.setAudioUrl(questionMediaBatchService.getOrUpload(audio, cache));
            }

            QuestionMediaBatchService.MediaCandidate image = questionMediaBatchService.findBestCandidate(
                    req.getImageUrl(),
                    req.getQuestionGroupCode(),
                    "IMAGE",
                    byRelPath,
                    byBaseName,
                    byStem
            );
            if (image != null) {
                req.setImageUrl(questionMediaBatchService.getOrUpload(image, cache));
            }
        }
    }

    private ZipQuestionBundle tryReadZipQuestionBundle(String filename, byte[] bytes) {
        String lower = filename == null ? "" : filename.trim().toLowerCase(Locale.ROOT);
        if (!lower.endsWith(".zip")) {
            return null;
        }
        String bestName = null;
        byte[] bestBytes = null;
        int bestScore = -1;
        boolean looksLikeOfficeArchive = false;
        int count = 0;

        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                count++;
                if (count > MAX_ZIP_ENTRIES) {
                    break;
                }
                if (entry.isDirectory()) {
                    continue;
                }
                String entryName = entry.getName().replace('\\', '/').trim();
                String entryLower = entryName.toLowerCase(Locale.ROOT);
                if (entryLower.equals("[content_types].xml")
                        || entryLower.startsWith("word/")
                        || entryLower.startsWith("xl/")) {
                    looksLikeOfficeArchive = true;
                    break;
                }
                if (entryLower.startsWith("__macosx/") || entryName.startsWith("._")) {
                    continue;
                }
                int score = scoreQuestionDocumentName(entryLower);
                if (score > bestScore) {
                    bestScore = score;
                    bestName = entryName;
                    bestBytes = readZipEntry(zis);
                }
            }
        } catch (IOException ex) {
            throw new AppException(ErrorCode.INVALID_QUESTION_DATA);
        }

        if (looksLikeOfficeArchive || bestName == null || bestBytes == null) {
            return null;
        }
        List<QuestionMediaBatchService.MediaCandidate> mediaCandidates = questionMediaBatchService == null
                ? List.of()
                : questionMediaBatchService.extractZipMediaEntries(bytes);
        return new ZipQuestionBundle(bestName, bestBytes, mediaCandidates);
    }

    private static int scoreQuestionDocumentName(String lowerName) {
        int base = -1;
        if (lowerName.endsWith(".xlsx")) base = 100;
        else if (lowerName.endsWith(".xls")) base = 90;
        else if (lowerName.endsWith(".csv")) base = 80;
        else if (lowerName.endsWith(".tsv")) base = 70;
        else if (lowerName.endsWith(".docx")) base = 60;
        else if (lowerName.endsWith(".pdf")) base = 50;
        else if (lowerName.endsWith(".txt")) base = 40;
        if (base < 0) {
            return -1;
        }
        if (lowerName.contains("admin_import") || lowerName.contains("import")) {
            base += 15;
        }
        return base;
    }

    private static byte[] readZipEntry(ZipInputStream zis) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int read;
        long total = 0;
        while ((read = zis.read(buf)) != -1) {
            total += read;
            if (total > MAX_DOC_ENTRY_BYTES) {
                throw new AppException(ErrorCode.FILE_SIZE_EXCEEDED);
            }
            out.write(buf, 0, read);
        }
        return out.toByteArray();
    }

    private record ZipQuestionBundle(
            String questionFilename,
            byte[] questionBytes,
            List<QuestionMediaBatchService.MediaCandidate> mediaCandidates
    ) {
    }

    private String dedupKey(Integer partNo, String questionText) {
        String normText = questionText == null
                ? ""
                : questionText.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
        return (partNo == null ? 0 : partNo) + "|" + normText;
    }
}
