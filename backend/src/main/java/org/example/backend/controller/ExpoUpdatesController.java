package org.example.backend.controller;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.example.backend.service.ExpoUpdatesService;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.io.IOException;
import java.time.Duration;
import java.util.Optional;

@RestController
@RequestMapping("/updates")
@RequiredArgsConstructor
public class ExpoUpdatesController {

    private static final String HEADER_PROTOCOL_VERSION = "expo-protocol-version";
    private static final String HEADER_SFV_VERSION = "expo-sfv-version";
    private static final String CONTENT_TYPE_EXPO_JSON = "application/expo+json; charset=utf-8";

    private final ExpoUpdatesService expoUpdatesService;

    @GetMapping("/manifest")
    public ResponseEntity<String> getManifest(
            @RequestHeader(value = "expo-runtime-version", required = false) String runtimeHeader,
            @RequestHeader(value = "expo-platform", required = false) String platformHeader,
            @RequestHeader(value = "expo-current-update-id", required = false) String currentUpdateId,
            @RequestParam(value = "runtimeVersion", required = false) String runtimeParam,
            @RequestParam(value = "platform", required = false) String platformParam,
            HttpServletRequest request
    ) throws IOException {
        String runtime = runtimeHeader != null && !runtimeHeader.isBlank() ? runtimeHeader : runtimeParam;
        String platform = platformHeader != null && !platformHeader.isBlank() ? platformHeader : platformParam;
        String baseUrl = ServletUriComponentsBuilder.fromRequestUri(request)
                .replacePath(request.getContextPath())
                .replaceQuery(null)
                .build()
                .toUriString();

        Optional<String> manifestJson = expoUpdatesService.resolveManifestJson(
                runtime,
                platform,
                currentUpdateId,
                baseUrl
        );

        HttpHeaders headers = new HttpHeaders();
        headers.set(HEADER_PROTOCOL_VERSION, "1");
        headers.setCacheControl(CacheControl.noStore());

        if (manifestJson.isEmpty()) {
            return new ResponseEntity<>(headers, HttpStatus.NO_CONTENT);
        }

        headers.set(HEADER_SFV_VERSION, "0");
        headers.set(HttpHeaders.CONTENT_TYPE, CONTENT_TYPE_EXPO_JSON);
        return new ResponseEntity<>(manifestJson.get(), headers, HttpStatus.OK);
    }

    @GetMapping("/assets/{runtimeVersion}/{platform}/**")
    public ResponseEntity<Resource> getAsset(
            @PathVariable String runtimeVersion,
            @PathVariable String platform,
            HttpServletRequest request
    ) {
        String uri = request.getRequestURI();
        String marker = "/updates/assets/" + runtimeVersion + "/" + platform + "/";
        int idx = uri.indexOf(marker);
        if (idx < 0) {
            return ResponseEntity.notFound().build();
        }
        String relativePath = uri.substring(idx + marker.length());
        return expoUpdatesService.resolveAsset(runtimeVersion, platform, relativePath)
                .map(asset -> ResponseEntity.ok()
                        .contentType(asset.mediaType())
                        .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                        .body(asset.resource()))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
