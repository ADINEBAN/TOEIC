package org.example.backend.controller;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.ConfirmDocumentExamRequest;
import org.example.backend.dto.request.DocumentQuestionUpdateRequest;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.ImportedDocumentResponse;
import org.example.backend.dto.response.TestResponse;
import org.example.backend.enums.SuccessCode;
import org.example.backend.service.DocumentExamService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/users/documents")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('USER', 'ADMIN')")
public class UserDocumentController {

    private final DocumentExamService documentExamService;

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<ImportedDocumentResponse>> uploadDocument(
            Authentication authentication,
            @RequestParam("file") MultipartFile file
    ) {
        ImportedDocumentResponse response = documentExamService.uploadAndExtractDocument(authentication.getName(), file);
        return ApiResponseUtil.success(response, SuccessCode.DOCUMENT_IMPORTED);
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<ImportedDocumentResponse>>> getMyDocuments(Authentication authentication) {
        List<ImportedDocumentResponse> response = documentExamService.getMyDocuments(authentication.getName());
        return ApiResponseUtil.success(response, SuccessCode.DOCUMENT_LISTED);
    }

    @GetMapping("/exams")
    public ResponseEntity<ApiResponse<List<TestResponse>>> getMyGeneratedExams(Authentication authentication) {
        List<TestResponse> response = documentExamService.getMyGeneratedExams(authentication.getName());
        return ApiResponseUtil.success(response, SuccessCode.TEST_LISTED);
    }

    @GetMapping("/{documentId}")
    public ResponseEntity<ApiResponse<ImportedDocumentResponse>> getDocumentDetail(
            Authentication authentication,
            @PathVariable Long documentId
    ) {
        ImportedDocumentResponse response = documentExamService.getDocumentDetail(authentication.getName(), documentId);
        return ApiResponseUtil.success(response, SuccessCode.DOCUMENT_LISTED);
    }

    @PutMapping("/{documentId}/questions/{questionId}")
    public ResponseEntity<ApiResponse<ImportedDocumentResponse>> updateExtractedQuestion(
            Authentication authentication,
            @PathVariable Long documentId,
            @PathVariable Long questionId,
            @RequestBody DocumentQuestionUpdateRequest request
    ) {
        ImportedDocumentResponse response = documentExamService.updateExtractedQuestion(
                authentication.getName(), documentId, questionId, request
        );
        return ApiResponseUtil.success(response, SuccessCode.DOCUMENT_UPDATED);
    }

    @DeleteMapping("/{documentId}/questions/{questionId}")
    public ResponseEntity<ApiResponse<ImportedDocumentResponse>> removeExtractedQuestion(
            Authentication authentication,
            @PathVariable Long documentId,
            @PathVariable Long questionId
    ) {
        ImportedDocumentResponse response = documentExamService.removeExtractedQuestion(
                authentication.getName(), documentId, questionId
        );
        return ApiResponseUtil.success(response, SuccessCode.DOCUMENT_UPDATED);
    }

    @PostMapping("/{documentId}/analyze-answers")
    public ResponseEntity<ApiResponse<ImportedDocumentResponse>> analyzeAnswersWithAi(
            Authentication authentication,
            @PathVariable Long documentId
    ) {
        ImportedDocumentResponse response = documentExamService.analyzeAnswersWithAi(
                authentication.getName(), documentId
        );
        return ApiResponseUtil.success(response, SuccessCode.DOCUMENT_AI_ANALYZED);
    }

    @PostMapping("/{documentId}/confirm-exam")
    public ResponseEntity<ApiResponse<TestResponse>> confirmAndGenerateExam(
            Authentication authentication,
            @PathVariable Long documentId,
            @RequestBody(required = false) ConfirmDocumentExamRequest request
    ) {
        TestResponse response = documentExamService.confirmAndGenerateExam(
                authentication.getName(), documentId, request
        );
        return ApiResponseUtil.success(response, SuccessCode.DOCUMENT_EXAM_CONFIRMED);
    }
}
