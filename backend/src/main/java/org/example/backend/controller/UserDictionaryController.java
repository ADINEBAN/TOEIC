package org.example.backend.controller;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.DictionaryHistoryItemResponse;
import org.example.backend.dto.response.ImageObjectRecognitionResponse;
import org.example.backend.dto.response.SemanticDictionaryResponse;
import org.example.backend.dto.response.SemanticDictionaryResponse.SemanticNode;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.SmartDictionaryService;
import org.example.backend.service.SubscriptionService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/users/dictionary")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('USER', 'ADMIN', 'CONTENT_MANAGER')")
public class UserDictionaryController {

    private final SmartDictionaryService smartDictionaryService;

    @Autowired(required = false)
    private SubscriptionService subscriptionService;

    @GetMapping("/suggest")
    public ResponseEntity<ApiResponse<List<SemanticNode>>> suggestWords(
            @RequestParam("q") String query,
            @RequestParam(required = false) Integer limit
    ) {
        return ApiResponseUtil.success(
                smartDictionaryService.suggestWords(query, limit),
                SuccessCode.DICTIONARY_LOOKED_UP
        );
    }

    @GetMapping("/lookup")
    public ResponseEntity<ApiResponse<SemanticDictionaryResponse>> lookupSemanticDictionary(
            Authentication authentication,
            @RequestParam("word") String word,
            @RequestParam(defaultValue = "false") boolean fast
    ) {
        String email = authentication != null ? authentication.getName() : null;
        return ApiResponseUtil.success(
                smartDictionaryService.lookupSemanticDictionary(word, email, fast),
                SuccessCode.DICTIONARY_LOOKED_UP
        );
    }

    @GetMapping("/history")
    public ResponseEntity<ApiResponse<List<DictionaryHistoryItemResponse>>> getLookupHistory(
            Authentication authentication,
            @RequestParam(defaultValue = "30") Integer limit
    ) {
        String email = authentication != null ? authentication.getName() : null;
        return ApiResponseUtil.success(
                smartDictionaryService.getUserHistory(email, limit),
                SuccessCode.DICTIONARY_HISTORY_LISTED
        );
    }

    @DeleteMapping("/history/{word}")
    public ResponseEntity<ApiResponse<Void>> deleteHistoryWord(
            Authentication authentication,
            @PathVariable String word
    ) {
        String email = authentication != null ? authentication.getName() : null;
        smartDictionaryService.deleteUserHistoryWord(email, word);
        return ApiResponseUtil.success(null, SuccessCode.DICTIONARY_HISTORY_DELETED);
    }

    @DeleteMapping("/history")
    public ResponseEntity<ApiResponse<Void>> clearHistory(Authentication authentication) {
        String email = authentication != null ? authentication.getName() : null;
        smartDictionaryService.clearUserHistory(email);
        return ApiResponseUtil.success(null, SuccessCode.DICTIONARY_HISTORY_DELETED);
    }

    @PostMapping(value = "/recognize-image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<ImageObjectRecognitionResponse>> recognizeObjectImage(
            Authentication authentication,
            @RequestParam("file") MultipartFile file
    ) {
        if (subscriptionService != null && authentication != null) {
            subscriptionService.consumeQuotaOrThrow(authentication.getName(), SubscriptionService.FEATURE_CAMERA_AI);
        }
        return ApiResponseUtil.success(
                smartDictionaryService.recognizeObjectsFromImage(file),
                SuccessCode.IMAGE_OBJECT_RECOGNIZED
        );
    }
}
