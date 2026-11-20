package org.example.backend.controller;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.SynthesizeSpeechRequest;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.TtsSynthesizeResponse;
import org.example.backend.dto.response.TtsVoicesResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.SpeechifyTtsService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/users/tts")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
public class UserTtsController {

    private final SpeechifyTtsService speechifyTtsService;

    @GetMapping("/voices")
    public ResponseEntity<ApiResponse<TtsVoicesResponse>> getVoices() {
        return ApiResponseUtil.success(speechifyTtsService.getVoices(), SuccessCode.TTS_VOICES_LISTED);
    }

    @PostMapping("/synthesize")
    public ResponseEntity<ApiResponse<TtsSynthesizeResponse>> synthesize(
            @RequestBody SynthesizeSpeechRequest request
    ) {
        return ApiResponseUtil.success(speechifyTtsService.synthesize(request), SuccessCode.TTS_SYNTHESIZED);
    }

    @GetMapping("/audio/{cacheId}")
    public ResponseEntity<byte[]> streamCachedAudio(@PathVariable String cacheId) {
        byte[] bytes = speechifyTtsService.getCachedAudio(cacheId);
        if (bytes == null || bytes.length == 0) {
            return ResponseEntity.notFound().build();
        }
        MediaType mediaType = cacheId.toLowerCase().endsWith(".wav")
                ? MediaType.valueOf("audio/wav")
                : MediaType.valueOf("audio/mpeg");

        return ResponseEntity.ok()
                .contentType(mediaType)
                .contentLength(bytes.length)
                .cacheControl(CacheControl.maxAge(1, TimeUnit.HOURS).cachePrivate())
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .body(bytes);
    }
}
