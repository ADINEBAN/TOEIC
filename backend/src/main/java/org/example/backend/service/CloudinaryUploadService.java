package org.example.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.example.backend.dto.response.VideoUploadResponse;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class CloudinaryUploadService {

    public record QuestionMediaAssetResult(String url, String mediaType, String format, long bytes) {
    }

    private static final Logger logger = LoggerFactory.getLogger(CloudinaryUploadService.class);

    private final ObjectMapper objectMapper;

    @Value("${cloudinary.cloud-name:}")
    private String cloudName;

    @Value("${cloudinary.api-key:}")
    private String apiKey;

    @Value("${cloudinary.api-secret:}")
    private String apiSecret;

    private static final Set<String> ALLOWED_EXTENSIONS = Set.of("mp4", "mov", "webm", "m4v", "mkv", "avi");
    private static final Set<String> ALLOWED_QUESTION_AUDIO_EXTENSIONS =
            Set.of("mp3", "wav", "m4a", "ogg", "aac", "flac", "mp4", "webm", "mov");
    private static final Set<String> ALLOWED_QUESTION_IMAGE_EXTENSIONS =
            Set.of("jpg", "jpeg", "png", "webp", "gif");

    @Value("${cloudinary.upload-folder:toeic-trainer/videos}")
    private String uploadFolder;

    @Value("${toeic.storage-dir:./data}")
    private String storageDir = "./data";

    @Value("${toeic.ffmpeg-bin:}")
    private String ffmpegBin = "";

    @PostConstruct
    private void initializeAndValidate() {
        if (hasCloudinaryConfig()) {
            String maskedSecret = "***" + apiSecret.substring(Math.max(0, apiSecret.length() - 4));
            logger.info("Cloudinary upload enabled - cloud_name: [{}], api_key: [{}...], api_secret: [{}], upload_folder: [{}]",
                    cloudName,
                    apiKey.substring(0, Math.min(4, apiKey.length())),
                    maskedSecret,
                    isBlank(uploadFolder) ? "default" : uploadFolder);
        } else {
            logger.info("Cloudinary credentials not configured; uploaded videos will be stored locally under [{}].",
                    resolveLocalVideoDir());
        }
    }

    public VideoUploadResponse uploadVideo(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new AppException(ErrorCode.VIDEO_UPLOAD_FAILED);
        }

        if (!hasCloudinaryConfig()) {
            return storeLocally(file);
        }

        return uploadToCloudinary(file);
    }

    public QuestionMediaAssetResult uploadQuestionAsset(byte[] bytes, String originalFilename, String contentType) {
        if (bytes == null || bytes.length == 0) {
            throw new AppException(ErrorCode.INVALID_QUESTION_MEDIA);
        }

        String resolvedName = originalFilename == null ? "asset" : originalFilename.trim();
        String mediaType = classifyQuestionMediaType(resolvedName);
        if (mediaType == null) {
            throw new AppException(ErrorCode.INVALID_QUESTION_MEDIA);
        }

        String ext = extractAllowedQuestionExtension(resolvedName, mediaType);
        if (!hasCloudinaryConfig()) {
            return storeQuestionAssetLocally(bytes, resolvedName, mediaType, ext);
        }

        String resourceType = "IMAGE".equals(mediaType) ? "image" : "video";
        String targetFolder = resolveQuestionMediaFolder(mediaType);
        JsonNode root = executeCloudinaryUpload(
                bytes,
                resolvedName,
                contentType,
                resourceType,
                targetFolder,
                ErrorCode.INVALID_QUESTION_MEDIA
        );
        String secureUrl = asText(root, "secure_url");
        if (isBlank(secureUrl)) {
            throw new AppException(ErrorCode.INVALID_QUESTION_MEDIA);
        }
        String format = asText(root, "format");
        long size = root.path("bytes").isNumber() ? root.path("bytes").asLong() : bytes.length;
        return new QuestionMediaAssetResult(secureUrl, mediaType, isBlank(format) ? ext : format, size);
    }

    public static String classifyQuestionMediaType(String filename) {
        String ext = extractExtension(filename);
        if (ALLOWED_QUESTION_AUDIO_EXTENSIONS.contains(ext)) {
            return "AUDIO";
        }
        if (ALLOWED_QUESTION_IMAGE_EXTENSIONS.contains(ext)) {
            return "IMAGE";
        }
        return null;
    }

    private VideoUploadResponse uploadToCloudinary(MultipartFile file) {
        String originalName = file.getOriginalFilename() == null ? "video" : file.getOriginalFilename();
        String folder = uploadFolder == null ? "" : uploadFolder.trim();
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException exception) {
            throw new AppException(ErrorCode.VIDEO_UPLOAD_FAILED);
        }

        JsonNode root = executeCloudinaryUpload(
                bytes,
                originalName,
                file.getContentType(),
                "video",
                folder,
                ErrorCode.VIDEO_UPLOAD_FAILED
        );
        VideoUploadResponse result = new VideoUploadResponse();
        result.setPublicId(asText(root, "public_id"));
        result.setResourceType(asText(root, "resource_type"));
        result.setFormat(asText(root, "format"));
        result.setSecureUrl(asText(root, "secure_url"));
        result.setPlaybackUrl(result.getSecureUrl());
        result.setDurationSeconds(asIntSeconds(root, "duration"));
        result.setBytes(root.path("bytes").isNumber() ? root.path("bytes").asLong() : null);
        return result;
    }

    private JsonNode executeCloudinaryUpload(
            byte[] bytes,
            String originalName,
            String contentType,
            String resourceType,
            String folder,
            ErrorCode failureCode
    ) {
        long timestamp = Instant.now().getEpochSecond();
        String normalizedFolder = folder == null ? "" : folder.trim();
        String signatureBase = normalizedFolder.isEmpty()
                ? "timestamp=" + timestamp + apiSecret
                : "folder=" + normalizedFolder + "&timestamp=" + timestamp + apiSecret;
        String signature = sha1Hex(signatureBase);
        String endpoint = "https://api.cloudinary.com/v1_1/" + cloudName + "/" + resourceType + "/upload";

        MediaType mediaType = MediaType.parse(defaultMimeType(contentType));
        RequestBody fileBody = RequestBody.create(bytes, mediaType);

        MultipartBody.Builder bodyBuilder = new MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("file", originalName, fileBody)
                .addFormDataPart("api_key", apiKey)
                .addFormDataPart("timestamp", String.valueOf(timestamp))
                .addFormDataPart("signature", signature);
        if (!normalizedFolder.isEmpty()) {
            bodyBuilder.addFormDataPart("folder", normalizedFolder);
        }

        Request request = new Request.Builder()
                .url(endpoint)
                .post(bodyBuilder.build())
                .build();

        OkHttpClient client = new OkHttpClient.Builder().build();
        try (Response response = client.newCall(request).execute()) {
            String raw = response.body() == null ? "" : response.body().string();
            if (!response.isSuccessful()) {
                logger.error("Cloudinary upload failed. HTTP {} - response: {}", response.code(), raw);
                if (response.code() == 401 && raw.contains("Invalid cloud_name")) {
                    logger.error("Cloud name '{}' is invalid or does not exist in Cloudinary account. Check your CLOUDINARY_CLOUD_NAME env var.", cloudName);
                }
                throw new AppException(failureCode);
            }

            try {
                return objectMapper.readTree(raw);
            } catch (IOException parseEx) {
                logger.error("Failed to parse Cloudinary response: {}", raw, parseEx);
                throw new AppException(failureCode);
            }
        } catch (IOException exception) {
            throw new AppException(failureCode);
        }
    }

    private boolean hasCloudinaryConfig() {
        return !isBlank(cloudName) && !isBlank(apiKey) && !isBlank(apiSecret);
    }

    private VideoUploadResponse storeLocally(MultipartFile file) {
        try {
            Path videoDir = resolveLocalVideoDir();
            Files.createDirectories(videoDir);

            String originalName = file.getOriginalFilename() == null ? "video.mp4" : file.getOriginalFilename();
            String ext = resolveVideoExtension(originalName, file.getContentType());
            String safeBase = sanitizeBaseName(originalName);
            String token = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
            String storedFileName = token + "_" + safeBase + "." + ext;
            Path targetPath = videoDir.resolve(storedFileName);

            try (InputStream inputStream = file.getInputStream()) {
                Files.copy(inputStream, targetPath, StandardCopyOption.REPLACE_EXISTING);
            }

            long storedBytes = Files.size(targetPath);
            String playbackUrl = buildLocalPlaybackUrl(storedFileName);

            VideoUploadResponse result = new VideoUploadResponse();
            result.setPublicId("local/" + storedFileName);
            result.setResourceType("video");
            result.setFormat(ext);
            result.setSecureUrl(playbackUrl);
            result.setPlaybackUrl(playbackUrl);
            result.setDurationSeconds(probeDurationSeconds(targetPath));
            result.setBytes(storedBytes);
            return result;
        } catch (IOException exception) {
            logger.error("Failed to store video file locally", exception);
            throw new AppException(ErrorCode.VIDEO_UPLOAD_FAILED);
        }
    }

    private Path resolveLocalVideoDir() {
        String root = isBlank(storageDir) ? "./data" : storageDir.trim();
        return Paths.get(root).toAbsolutePath().normalize().resolve("uploads").resolve("videos");
    }

    private QuestionMediaAssetResult storeQuestionAssetLocally(
            byte[] bytes,
            String originalName,
            String mediaType,
            String ext
    ) {
        try {
            String subDir = "IMAGE".equals(mediaType) ? "images" : "audio";
            String root = isBlank(storageDir) ? "./data" : storageDir.trim();
            Path targetDir = Paths.get(root).toAbsolutePath().normalize()
                    .resolve("uploads")
                    .resolve("question-media")
                    .resolve(subDir);
            Files.createDirectories(targetDir);

            String safeBase = sanitizeBaseName(originalName);
            String token = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
            String storedFileName = token + "_" + safeBase + "." + ext;
            Path targetPath = targetDir.resolve(storedFileName);
            Files.write(targetPath, bytes);

            String playbackUrl = buildLocalMediaUrl("question-media/" + subDir + "/" + storedFileName);
            return new QuestionMediaAssetResult(playbackUrl, mediaType, ext, Files.size(targetPath));
        } catch (IOException exception) {
            logger.error("Failed to store question media locally", exception);
            throw new AppException(ErrorCode.INVALID_QUESTION_MEDIA);
        }
    }

    private String resolveQuestionMediaFolder(String mediaType) {
        String base = isBlank(uploadFolder) ? "toeic-trainer" : uploadFolder.trim();
        if (base.endsWith("/videos")) {
            base = base.substring(0, base.length() - "/videos".length());
        }
        return base + "/question-media/" + ("IMAGE".equals(mediaType) ? "images" : "audio");
    }

    private static String extractExtension(String filename) {
        if (filename == null) {
            return "";
        }
        int dotIdx = filename.lastIndexOf('.');
        if (dotIdx < 0 || dotIdx == filename.length() - 1) {
            return "";
        }
        return filename.substring(dotIdx + 1).toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    private String extractAllowedQuestionExtension(String originalName, String mediaType) {
        String ext = extractExtension(originalName);
        if ("IMAGE".equals(mediaType) && ALLOWED_QUESTION_IMAGE_EXTENSIONS.contains(ext)) {
            return ext;
        }
        if ("AUDIO".equals(mediaType) && ALLOWED_QUESTION_AUDIO_EXTENSIONS.contains(ext)) {
            return ext;
        }
        throw new AppException(ErrorCode.INVALID_QUESTION_MEDIA);
    }

    private String buildLocalMediaUrl(String relativeMediaPath) {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes) {
            return ServletUriComponentsBuilder.fromCurrentContextPath()
                    .path("/media/")
                    .path(relativeMediaPath)
                    .toUriString();
        }
        return "/api/media/" + relativeMediaPath;
    }

    private String buildLocalPlaybackUrl(String storedFileName) {
        return buildLocalMediaUrl("videos/" + storedFileName);
    }

    private String resolveVideoExtension(String originalName, String contentType) {
        int dotIdx = originalName.lastIndexOf('.');
        if (dotIdx >= 0 && dotIdx < originalName.length() - 1) {
            String ext = originalName.substring(dotIdx + 1).toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
            if (ALLOWED_EXTENSIONS.contains(ext)) {
                return ext;
            }
        }
        if (contentType != null) {
            String lower = contentType.toLowerCase(Locale.ROOT);
            if (lower.contains("quicktime")) return "mov";
            if (lower.contains("webm")) return "webm";
            if (lower.contains("m4v")) return "m4v";
        }
        return "mp4";
    }

    private String sanitizeBaseName(String originalName) {
        int slashIdx = Math.max(originalName.lastIndexOf('/'), originalName.lastIndexOf('\\'));
        String filename = slashIdx >= 0 ? originalName.substring(slashIdx + 1) : originalName;
        int dotIdx = filename.lastIndexOf('.');
        String base = dotIdx > 0 ? filename.substring(0, dotIdx) : filename;
        String clean = base.replaceAll("[^a-zA-Z0-9_-]+", "_").replaceAll("^_+|_+$", "");
        if (clean.isEmpty()) {
            return "video";
        }
        return clean.length() > 40 ? clean.substring(0, 40) : clean;
    }

    private Integer probeDurationSeconds(Path videoPath) {
        String probeCmd = resolveFfprobeCommand();
        if (probeCmd == null) {
            return null;
        }
        Process process = null;
        try {
            process = new ProcessBuilder(
                    probeCmd,
                    "-v", "error",
                    "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    videoPath.toAbsolutePath().toString()
            ).redirectErrorStream(true).start();

            boolean finished = process.waitFor(3, TimeUnit.SECONDS);
            if (!finished || process.exitValue() != 0) {
                return null;
            }
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line = reader.readLine();
                if (line != null && !line.isBlank()) {
                    int seconds = (int) Math.round(Double.parseDouble(line.trim()));
                    return seconds > 0 ? seconds : null;
                }
            }
        } catch (Exception ignored) {
            return null;
        } finally {
            if (process != null) {
                process.destroy();
            }
        }
        return null;
    }

    private String resolveFfprobeCommand() {
        if (!isBlank(ffmpegBin)) {
            Path ffmpegPath = Paths.get(ffmpegBin.trim());
            String fileName = ffmpegPath.getFileName() == null ? "" : ffmpegPath.getFileName().toString();
            String probeName = fileName.toLowerCase(Locale.ROOT).endsWith(".exe") ? "ffprobe.exe" : "ffprobe";
            Path sibling = ffmpegPath.getParent() == null ? Paths.get(probeName) : ffmpegPath.getParent().resolve(probeName);
            if (Files.isExecutable(sibling)) {
                return sibling.toAbsolutePath().toString();
            }
        }
        return "ffprobe";
    }

    private String defaultMimeType(String contentType) {
        if (contentType == null || contentType.isBlank()) {
            return "application/octet-stream";
        }
        return contentType;
    }

    private Integer asIntSeconds(JsonNode root, String field) {
        if (!root.path(field).isNumber()) {
            return null;
        }
        return (int) Math.round(root.path(field).asDouble());
    }

    private String asText(JsonNode root, String field) {
        JsonNode node = root.path(field);
        if (node.isMissingNode() || node.isNull()) {
            return null;
        }
        return node.asText();
    }

    private String sha1Hex(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(digest.length * 2);
            for (byte item : digest) {
                builder.append(String.format(Locale.ROOT, "%02x", item));
            }
            return builder.toString();
        } catch (Exception exception) {
            throw new AppException(ErrorCode.VIDEO_UPLOAD_FAILED);
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}

