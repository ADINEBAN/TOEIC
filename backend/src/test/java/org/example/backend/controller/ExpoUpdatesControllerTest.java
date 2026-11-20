package org.example.backend.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.example.backend.service.ExpoUpdatesService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

class ExpoUpdatesControllerTest {

    @TempDir
    Path tempDir;

    @Test
    void manifestReturns204WhenEmptyOrUpToDateAnd200WithResolvedUrlsWhenNewUpdateAvailable() throws Exception {
        ExpoUpdatesService service = new ExpoUpdatesService(new ObjectMapper());
        ReflectionTestUtils.setField(service, "updatesDir", tempDir.toString());
        ExpoUpdatesController controller = new ExpoUpdatesController(service);

        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/updates/manifest");
        req.setContextPath("/api");
        req.setScheme("https");
        req.setServerName("toeic-trainer-api.koreacentral.cloudapp.azure.com");
        req.setServerPort(443);

        // No staged manifest yet -> 204 No Content with protocol header 1
        var emptyRes = controller.getManifest("1.2.0", "android", null, null, null, req);
        assertEquals(204, emptyRes.getStatusCode().value());
        assertEquals("1", emptyRes.getHeaders().getFirst("expo-protocol-version"));

        Path androidDir = tempDir.resolve("1.2.0").resolve("android");
        Files.createDirectories(androidDir.resolve("_expo/static/js/android"));
        Files.writeString(androidDir.resolve("_expo/static/js/android/entry-abc.hbc"), "hermes-bytecode");
        Files.writeString(androidDir.resolve("manifest.json"), """
                {
                  "id": "11111111-2222-4333-8444-555555555555",
                  "createdAt": "2026-11-20T12:00:00.000Z",
                  "runtimeVersion": "1.2.0",
                  "launchAsset": {
                    "key": "abc123",
                    "contentType": "application/javascript",
                    "fileExtension": ".hbc",
                    "hash": "hashval",
                    "url": "_expo/static/js/android/entry-abc.hbc"
                  },
                  "assets": [],
                  "metadata": {},
                  "extra": {}
                }
                """);

        // Fresh client -> 200 OK with full resolved URLs
        var updateRes = controller.getManifest("1.2.0", "android", null, null, null, req);
        assertEquals(200, updateRes.getStatusCode().value());
        assertEquals("1", updateRes.getHeaders().getFirst("expo-protocol-version"));
        assertEquals("0", updateRes.getHeaders().getFirst("expo-sfv-version"));
        assertTrue(updateRes.getBody().contains(
                "https://toeic-trainer-api.koreacentral.cloudapp.azure.com/api/updates/assets/1.2.0/android/_expo/static/js/android/entry-abc.hbc"
        ));

        // Client already on same update id -> 204 No Content
        var sameRes = controller.getManifest(
                "1.2.0",
                "android",
                "11111111-2222-4333-8444-555555555555",
                null,
                null,
                req
        );
        assertEquals(204, sameRes.getStatusCode().value());

        // Asset download works and blocks traversal
        MockHttpServletRequest assetReq = new MockHttpServletRequest(
                "GET",
                "/api/updates/assets/1.2.0/android/_expo/static/js/android/entry-abc.hbc"
        );
        var assetRes = controller.getAsset("1.2.0", "android", assetReq);
        assertEquals(200, assetRes.getStatusCode().value());

        MockHttpServletRequest traversalReq = new MockHttpServletRequest(
                "GET",
                "/api/updates/assets/1.2.0/android/../../secret.txt"
        );
        var blockedRes = controller.getAsset("1.2.0", "android", traversalReq);
        assertEquals(404, blockedRes.getStatusCode().value());
    }
}
