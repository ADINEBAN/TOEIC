package org.example.backend.controller;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.YoutubeSubtitleRequest;
import org.example.backend.dto.request.YoutubeWordLookupRequest;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.YoutubeSubtitleResponse;
import org.example.backend.dto.response.YoutubeWordLookupResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.YoutubeSubtitleService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/users/youtube")
@RequiredArgsConstructor
public class UserYoutubeController {

    private final YoutubeSubtitleService youtubeSubtitleService;

    @PostMapping("/subtitles")
    @PreAuthorize("hasAnyRole('ADMIN', 'CONTENT_MANAGER')")
    public ResponseEntity<ApiResponse<YoutubeSubtitleResponse>> generateSubtitles(
            @RequestBody YoutubeSubtitleRequest request
    ) {
        return ApiResponseUtil.success(
                youtubeSubtitleService.generateSubtitles(request),
                SuccessCode.YOUTUBE_SUBTITLES_GENERATED
        );
    }

    @PostMapping("/word-lookup")
    @PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
    public ResponseEntity<ApiResponse<YoutubeWordLookupResponse>> lookupWord(
            @RequestBody YoutubeWordLookupRequest request
    ) {
        return ApiResponseUtil.success(
                youtubeSubtitleService.lookupWord(request),
                SuccessCode.YOUTUBE_WORD_LOOKED_UP
        );
    }
}
