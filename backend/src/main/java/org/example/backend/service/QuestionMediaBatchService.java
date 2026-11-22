package org.example.backend.service;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.response.QuestionMediaBatchResponse;
import org.example.backend.dto.response.QuestionResponse;
import org.example.backend.entity.Question;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.mapper.QuestionMapper;
import org.example.backend.repository.QuestionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Service
@RequiredArgsConstructor
public class QuestionMediaBatchService {

    private static final int MAX_ZIP_ENTRIES = 600;
    private static final long MAX_ZIP_ENTRY_BYTES = 25L * 1024L * 1024L;
    private static final long MAX_TOTAL_ZIP_BYTES = 300L * 1024L * 1024L;

    public static final class MediaCandidate {
        private final String normalizedRelativePath;
        private final String baseNameLower;
        private final String stemLower;
        private final String displayName;
        private final String mediaType;
        private final String contentType;
        private final byte[] bytes;

        MediaCandidate(
                String normalizedRelativePath,
                String displayName,
                String mediaType,
                String contentType,
                byte[] bytes
        ) {
            this.normalizedRelativePath = normalizedRelativePath;
            this.baseNameLower = extractBaseName(displayName).toLowerCase(Locale.ROOT);
            this.stemLower = stripExtension(this.baseNameLower);
            this.displayName = displayName;
            this.mediaType = mediaType;
            this.contentType = contentType;
            this.bytes = bytes;
        }

        public String displayName() {
            return displayName;
        }

        public String mediaType() {
            return mediaType;
        }

        public String normalizedRelativePath() {
            return normalizedRelativePath;
        }

        public String baseNameLower() {
            return baseNameLower;
        }

        public byte[] bytes() {
            return bytes;
        }

        public String contentType() {
            return contentType;
        }
    }

    private final QuestionRepository questionRepository;
    private final QuestionMapper questionMapper;
    private final CloudinaryUploadService cloudinaryUploadService;

    @Transactional
    public QuestionMediaBatchResponse uploadMediaBatch(
            List<MultipartFile> files,
            String groupPrefix,
            boolean overwriteExisting
    ) {
        if (files == null || files.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_QUESTION_MEDIA);
        }

        List<MediaCandidate> candidates = extractCandidates(files);
        if (candidates.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_QUESTION_MEDIA);
        }

        List<Question> targetQuestions = filterByPrefix(
                questionRepository.findAllByOrderByCreatedAtDesc(),
                groupPrefix
        );

        Map<String, List<MediaCandidate>> byRelPath = new HashMap<>();
        Map<String, List<MediaCandidate>> byBaseName = new HashMap<>();
        Map<String, List<MediaCandidate>> byStem = new HashMap<>();
        indexCandidates(candidates, byRelPath, byBaseName, byStem);

        Map<MediaCandidate, String> uploadedUrlCache = new IdentityHashMap<>();
        Map<MediaCandidate, Boolean> matchedCandidates = new IdentityHashMap<>();
        List<Question> updatedQuestions = new ArrayList<>();
        int skippedAlreadyLinked = 0;

        for (Question question : targetQuestions) {
            boolean changed = false;

            MediaCandidate audioMatch = findBestCandidate(
                    question.getAudioUrl(),
                    question.getQuestionGroupCode(),
                    "AUDIO",
                    byRelPath,
                    byBaseName,
                    byStem
            );
            if (audioMatch != null) {
                matchedCandidates.put(audioMatch, Boolean.TRUE);
                if (isHttpUrl(question.getAudioUrl()) && !overwriteExisting) {
                    skippedAlreadyLinked++;
                } else {
                    String uploadedUrl = getOrUpload(audioMatch, uploadedUrlCache);
                    if (!uploadedUrl.equals(question.getAudioUrl())) {
                        question.setAudioUrl(uploadedUrl);
                        changed = true;
                    }
                }
            }

            MediaCandidate imageMatch = findBestCandidate(
                    question.getImageUrl(),
                    question.getQuestionGroupCode(),
                    "IMAGE",
                    byRelPath,
                    byBaseName,
                    byStem
            );
            if (imageMatch != null) {
                matchedCandidates.put(imageMatch, Boolean.TRUE);
                if (isHttpUrl(question.getImageUrl()) && !overwriteExisting) {
                    skippedAlreadyLinked++;
                } else {
                    String uploadedUrl = getOrUpload(imageMatch, uploadedUrlCache);
                    if (!uploadedUrl.equals(question.getImageUrl())) {
                        question.setImageUrl(uploadedUrl);
                        changed = true;
                    }
                }
            }

            if (changed) {
                updatedQuestions.add(question);
            }
        }

        List<Question> saved = updatedQuestions.isEmpty()
                ? List.of()
                : questionRepository.saveAll(updatedQuestions);
        List<QuestionResponse> responseItems = questionMapper.toResponseList(saved);

        List<String> unmatchedFiles = new ArrayList<>();
        for (MediaCandidate candidate : candidates) {
            if (!matchedCandidates.containsKey(candidate)) {
                unmatchedFiles.add(candidate.displayName());
            }
        }

        return QuestionMediaBatchResponse.builder()
                .uploadedFileCount(candidates.size())
                .storedAssetCount(uploadedUrlCache.size())
                .matchedQuestionCount(saved.size())
                .skippedAlreadyLinkedCount(skippedAlreadyLinked)
                .unmatchedFiles(unmatchedFiles)
                .items(responseItems)
                .build();
    }

    public List<MediaCandidate> extractZipMediaEntries(byte[] zipBytes) {
        List<MediaCandidate> result = new ArrayList<>();
        long totalRead = 0;
        int entryCount = 0;

        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                entryCount++;
                if (entryCount > MAX_ZIP_ENTRIES) {
                    throw new AppException(ErrorCode.FILE_SIZE_EXCEEDED);
                }
                if (entry.isDirectory()) {
                    continue;
                }
                String entryName = normalizePath(entry.getName());
                if (entryName.isEmpty()
                        || entryName.startsWith("__MACOSX/")
                        || extractBaseName(entryName).startsWith("._")) {
                    continue;
                }

                String mediaType = CloudinaryUploadService.classifyQuestionMediaType(entryName);
                if (mediaType == null) {
                    continue;
                }

                byte[] content = readZipEntryLimited(zis);
                totalRead += content.length;
                if (totalRead > MAX_TOTAL_ZIP_BYTES) {
                    throw new AppException(ErrorCode.FILE_SIZE_EXCEEDED);
                }
                result.add(new MediaCandidate(
                        entryName.toLowerCase(Locale.ROOT),
                        entryName,
                        mediaType,
                        guessContentType(entryName, mediaType),
                        content
                ));
            }
        } catch (IOException ex) {
            throw new AppException(ErrorCode.INVALID_QUESTION_MEDIA);
        }
        return result;
    }

    public Map<String, List<MediaCandidate>>[] buildLookupIndexes(List<MediaCandidate> candidates) {
        Map<String, List<MediaCandidate>> byRelPath = new HashMap<>();
        Map<String, List<MediaCandidate>> byBaseName = new HashMap<>();
        Map<String, List<MediaCandidate>> byStem = new HashMap<>();
        indexCandidates(candidates, byRelPath, byBaseName, byStem);
        @SuppressWarnings("unchecked")
        Map<String, List<MediaCandidate>>[] result = new Map[]{byRelPath, byBaseName, byStem};
        return result;
    }

    public MediaCandidate findBestCandidate(
            String currentFieldValue,
            String groupCode,
            String requiredMediaType,
            Map<String, List<MediaCandidate>> byRelPath,
            Map<String, List<MediaCandidate>> byBaseName,
            Map<String, List<MediaCandidate>> byStem
    ) {
        String normalizedField = normalizeLookupPath(currentFieldValue);
        if (!normalizedField.isEmpty()) {
            // 1. Exact suffix match on relative path (handles folder prefixes like Audio_Part1_to_Part4/.../Part1_Q01.mp3)
            for (Map.Entry<String, List<MediaCandidate>> entry : byRelPath.entrySet()) {
                String candidateRel = entry.getKey();
                if (normalizedField.equals(candidateRel)
                        || normalizedField.endsWith("/" + candidateRel)
                        || candidateRel.endsWith("/" + normalizedField)) {
                    MediaCandidate found = firstOfType(entry.getValue(), requiredMediaType);
                    if (found != null) {
                        return found;
                    }
                }
            }

            // 2. Exact basename match (stripping any local UUID prefix like 12hex_ if present)
            String baseName = extractBaseName(normalizedField);
            MediaCandidate byExactName = firstOfType(byBaseName.get(baseName), requiredMediaType);
            if (byExactName != null) {
                return byExactName;
            }
            String withoutUuid = stripLocalUuidPrefix(baseName);
            if (!withoutUuid.equals(baseName)) {
                MediaCandidate byCleanedName = firstOfType(byBaseName.get(withoutUuid), requiredMediaType);
                if (byCleanedName != null) {
                    return byCleanedName;
                }
            }
            return null;
        }

        // 3. Fallback by questionGroupCode only when field is currently empty
        String cleanGroup = groupCode == null ? "" : groupCode.trim().toLowerCase(Locale.ROOT);
        if (!cleanGroup.isEmpty()) {
            return firstOfType(byStem.get(cleanGroup), requiredMediaType);
        }
        return null;
    }

    public String getOrUpload(MediaCandidate candidate, Map<MediaCandidate, String> cache) {
        String existing = cache.get(candidate);
        if (existing != null) {
            return existing;
        }
        CloudinaryUploadService.QuestionMediaAssetResult uploaded = cloudinaryUploadService.uploadQuestionAsset(
                candidate.bytes(),
                candidate.displayName(),
                candidate.contentType()
        );
        cache.put(candidate, uploaded.url());
        return uploaded.url();
    }

    private List<MediaCandidate> extractCandidates(List<MultipartFile> files) {
        List<MediaCandidate> candidates = new ArrayList<>();
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty()) {
                continue;
            }
            String filename = file.getOriginalFilename() == null ? "upload" : file.getOriginalFilename().trim();
            byte[] bytes;
            try {
                bytes = file.getBytes();
            } catch (IOException ex) {
                throw new AppException(ErrorCode.INVALID_QUESTION_MEDIA);
            }

            if (filename.toLowerCase(Locale.ROOT).endsWith(".zip") || isZipHeader(bytes)) {
                candidates.addAll(extractZipMediaEntries(bytes));
                continue;
            }

            String mediaType = CloudinaryUploadService.classifyQuestionMediaType(filename);
            if (mediaType == null) {
                continue;
            }
            String normalizedRel = normalizePath(filename).toLowerCase(Locale.ROOT);
            candidates.add(new MediaCandidate(
                    normalizedRel,
                    filename,
                    mediaType,
                    file.getContentType(),
                    bytes
            ));
        }
        return deduplicateByPathOrder(candidates);
    }

    private List<MediaCandidate> deduplicateByPathOrder(List<MediaCandidate> raw) {
        Map<String, MediaCandidate> deduped = new LinkedHashMap<>();
        for (MediaCandidate c : raw) {
            deduped.put(c.mediaType() + "|" + c.normalizedRelativePath(), c);
        }
        return new ArrayList<>(deduped.values());
    }

    private void indexCandidates(
            List<MediaCandidate> candidates,
            Map<String, List<MediaCandidate>> byRelPath,
            Map<String, List<MediaCandidate>> byBaseName,
            Map<String, List<MediaCandidate>> byStem
    ) {
        for (MediaCandidate candidate : candidates) {
            byRelPath.computeIfAbsent(candidate.normalizedRelativePath(), ignored -> new ArrayList<>()).add(candidate);
            byBaseName.computeIfAbsent(candidate.baseNameLower(), ignored -> new ArrayList<>()).add(candidate);
            byStem.computeIfAbsent(candidate.stemLower, ignored -> new ArrayList<>()).add(candidate);
        }
    }

    private MediaCandidate firstOfType(List<MediaCandidate> list, String mediaType) {
        if (list == null) {
            return null;
        }
        for (MediaCandidate item : list) {
            if (mediaType.equals(item.mediaType())) {
                return item;
            }
        }
        return null;
    }

    private List<Question> filterByPrefix(List<Question> all, String groupPrefix) {
        if (groupPrefix == null || groupPrefix.isBlank()) {
            return all;
        }
        String needle = groupPrefix.trim().toLowerCase(Locale.ROOT);
        List<Question> filtered = new ArrayList<>();
        for (Question q : all) {
            String g = q.getQuestionGroupCode() == null ? "" : q.getQuestionGroupCode().trim().toLowerCase(Locale.ROOT);
            String txt = q.getQuestionText() == null ? "" : q.getQuestionText().toLowerCase(Locale.ROOT);
            if (g.startsWith(needle) || txt.contains(needle)) {
                filtered.add(q);
            }
        }
        return filtered;
    }

    private byte[] readZipEntryLimited(ZipInputStream zis) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        long total = 0;
        while ((read = zis.read(buffer)) != -1) {
            total += read;
            if (total > MAX_ZIP_ENTRY_BYTES) {
                throw new AppException(ErrorCode.FILE_SIZE_EXCEEDED);
            }
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }

    private static boolean isZipHeader(byte[] bytes) {
        return bytes != null && bytes.length >= 4
                && bytes[0] == 0x50 && bytes[1] == 0x4B
                && (bytes[2] == 0x03 || bytes[2] == 0x05 || bytes[2] == 0x07);
    }

    private static boolean isHttpUrl(String value) {
        if (value == null) {
            return false;
        }
        String trimmed = value.trim().toLowerCase(Locale.ROOT);
        return trimmed.startsWith("http://") || trimmed.startsWith("https://");
    }

    private static String normalizeLookupPath(String raw) {
        if (raw == null || raw.isBlank()) {
            return "";
        }
        String cleaned = raw.trim().replace('\\', '/');
        int queryIdx = cleaned.indexOf('?');
        if (queryIdx >= 0) {
            cleaned = cleaned.substring(0, queryIdx);
        }
        return normalizePath(cleaned).toLowerCase(Locale.ROOT);
    }

    private static String normalizePath(String path) {
        String s = path == null ? "" : path.replace('\\', '/').trim();
        while (s.startsWith("./")) {
            s = s.substring(2);
        }
        while (s.startsWith("/")) {
            s = s.substring(1);
        }
        return s;
    }

    private static String extractBaseName(String path) {
        if (path == null) {
            return "";
        }
        int slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
        return slash >= 0 ? path.substring(slash + 1) : path;
    }

    private static String stripExtension(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot > 0 ? filename.substring(0, dot) : filename;
    }

    private static String stripLocalUuidPrefix(String filename) {
        if (filename.length() > 13 && filename.charAt(12) == '_') {
            for (int i = 0; i < 12; i++) {
                char ch = filename.charAt(i);
                boolean hex = (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f');
                if (!hex) {
                    return filename;
                }
            }
            return filename.substring(13);
        }
        return filename;
    }

    private static String guessContentType(String filename, String mediaType) {
        String lower = filename.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".m4a")) return "audio/mp4";
        if (lower.endsWith(".ogg")) return "audio/ogg";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".gif")) return "image/gif";
        return "AUDIO".equals(mediaType) ? "audio/mpeg" : "image/jpeg";
    }
}
