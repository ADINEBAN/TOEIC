package org.example.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class ExpoUpdatesService {

    private static final Pattern SAFE_SEGMENT = Pattern.compile("^[a-zA-Z0-9._-]+$");

    private final ObjectMapper objectMapper;

    @Value("${toeic.updates-dir:./updates}")
    private String updatesDir;

    /**
     * Loads and resolves the active Expo Updates v1 manifest for the given runtimeVersion & platform.
     * Returns empty when no update is staged or the client already runs the latest update id.
     */
    public Optional<String> resolveManifestJson(
            String runtimeVersion,
            String platform,
            String currentUpdateId,
            String contextBaseUrl
    ) throws IOException {
        String safeRuntime = sanitizeSegment(runtimeVersion, "1.2.0");
        String safePlatform = sanitizeSegment(platform, "android").toLowerCase(Locale.ROOT);

        Path rootDir = resolvePlatformDir(safeRuntime, safePlatform);
        Path manifestPath = rootDir.resolve("manifest.json").normalize();
        if (!manifestPath.startsWith(rootDir) || !Files.isRegularFile(manifestPath)) {
            return Optional.empty();
        }

        JsonNode parsed = objectMapper.readTree(manifestPath.toFile());
        if (!(parsed instanceof ObjectNode root)) {
            return Optional.empty();
        }

        String latestId = root.path("id").asText("").trim();
        if (latestId.isEmpty()) {
            return Optional.empty();
        }
        if (currentUpdateId != null && !currentUpdateId.isBlank()
                && latestId.equalsIgnoreCase(currentUpdateId.trim())) {
            return Optional.empty();
        }

        String normalizedBase = normalizeBaseUrl(contextBaseUrl);
        JsonNode launchAsset = root.get("launchAsset");
        if (launchAsset instanceof ObjectNode launchObj) {
            rewriteAssetUrl(launchObj, normalizedBase, safeRuntime, safePlatform);
        }

        JsonNode assets = root.get("assets");
        if (assets instanceof ArrayNode assetsArray) {
            for (JsonNode item : assetsArray) {
                if (item instanceof ObjectNode assetObj) {
                    rewriteAssetUrl(assetObj, normalizedBase, safeRuntime, safePlatform);
                }
            }
        }

        return Optional.of(objectMapper.writeValueAsString(root));
    }

    public Optional<AssetPayload> resolveAsset(String runtimeVersion, String platform, String relativePath) {
        if (runtimeVersion == null || platform == null || relativePath == null) {
            return Optional.empty();
        }
        if (!SAFE_SEGMENT.matcher(runtimeVersion).matches() || !SAFE_SEGMENT.matcher(platform).matches()) {
            return Optional.empty();
        }
        String cleanedRel = relativePath.replace('\\', '/').replaceFirst("^/+", "");
        if (cleanedRel.isBlank() || cleanedRel.contains("..") || cleanedRel.contains("\0")) {
            return Optional.empty();
        }

        Path platformDir = resolvePlatformDir(runtimeVersion, platform.toLowerCase(Locale.ROOT));
        Path target = platformDir.resolve(cleanedRel).normalize();
        if (!target.startsWith(platformDir) || !Files.isRegularFile(target)) {
            return Optional.empty();
        }
        return Optional.of(new AssetPayload(new FileSystemResource(target), detectMediaType(cleanedRel)));
    }

    private void rewriteAssetUrl(ObjectNode assetObj, String baseUrl, String runtimeVersion, String platform) {
        String rawUrl = assetObj.path("url").asText("").trim();
        if (rawUrl.isEmpty() || rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
            return;
        }
        String relative = rawUrl.replaceFirst("^/+", "");
        String prefix = "updates/assets/" + runtimeVersion + "/" + platform + "/";
        String fullPath = relative.startsWith(prefix) || relative.startsWith("api/" + prefix)
                ? "/" + relative.replaceFirst("^api/", "")
                : "/" + prefix + relative;
        assetObj.put("url", baseUrl + fullPath);
    }

    private Path resolvePlatformDir(String runtimeVersion, String platform) {
        return Paths.get(updatesDir).toAbsolutePath().normalize()
                .resolve(runtimeVersion)
                .resolve(platform)
                .normalize();
    }

    private String sanitizeSegment(String value, String fallback) {
        String trimmed = value != null ? value.trim() : "";
        if (!trimmed.isEmpty() && SAFE_SEGMENT.matcher(trimmed).matches()) {
            return trimmed;
        }
        return fallback;
    }

    private String normalizeBaseUrl(String raw) {
        if (raw == null || raw.isBlank()) {
            return "";
        }
        return raw.trim().replaceAll("/+$", "");
    }

    private MediaType detectMediaType(String path) {
        String low = path.toLowerCase(Locale.ROOT);
        if (low.endsWith(".js") || low.endsWith(".hbc")) return MediaType.parseMediaType("application/javascript");
        if (low.endsWith(".png")) return MediaType.IMAGE_PNG;
        if (low.endsWith(".jpg") || low.endsWith(".jpeg")) return MediaType.IMAGE_JPEG;
        if (low.endsWith(".webp")) return MediaType.parseMediaType("image/webp");
        if (low.endsWith(".svg")) return MediaType.parseMediaType("image/svg+xml");
        if (low.endsWith(".ttf")) return MediaType.parseMediaType("font/ttf");
        if (low.endsWith(".otf")) return MediaType.parseMediaType("font/otf");
        if (low.endsWith(".json")) return MediaType.APPLICATION_JSON;
        return MediaType.APPLICATION_OCTET_STREAM;
    }

    public record AssetPayload(Resource resource, MediaType mediaType) {
    }
}
