package org.example.backend.controller;

import lombok.RequiredArgsConstructor;
import org.example.backend.dto.request.BulkImportQuestionsRequest;
import org.example.backend.dto.request.CreateQuestionRequest;
import org.example.backend.dto.request.DraftQuestionExplainRequest;
import org.example.backend.dto.request.UpdateQuestionRequest;
import org.example.backend.dto.response.AIExplainResponse;
import org.example.backend.dto.response.ApiResponse;
import org.example.backend.dto.response.QuestionImportResponse;
import org.example.backend.dto.response.QuestionMediaBatchResponse;
import org.example.backend.dto.response.QuestionResponse;
import org.example.backend.enums.ErrorCode;
import org.example.backend.enums.SuccessCode;
import org.example.backend.exception.AppException;
import org.example.backend.service.AdminQuestionBankService;
import org.example.backend.service.CloudinaryUploadService;
import org.example.backend.service.OpenAIAnswerExplainService;
import org.example.backend.service.QuestionImportService;
import org.example.backend.service.QuestionMediaBatchService;
import org.example.backend.util.ApiResponseUtil;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/admin/questions")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminQuestionBankController {

    private final AdminQuestionBankService adminQuestionBankService;
    private final QuestionImportService questionImportService;
    private final QuestionMediaBatchService questionMediaBatchService;
    private final CloudinaryUploadService cloudinaryUploadService;
    private final OpenAIAnswerExplainService openAIAnswerExplainService;

    @PostMapping
    public ResponseEntity<ApiResponse<QuestionResponse>> createQuestion(@RequestBody CreateQuestionRequest request) {
        QuestionResponse response = adminQuestionBankService.createQuestion(request);
        return ApiResponseUtil.success(response, SuccessCode.QUESTION_CREATED);
    }

    @PostMapping(value = "/import-file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<QuestionImportResponse>> importQuestionsFromFile(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "defaultPartNo", required = false) Integer defaultPartNo,
            @RequestParam(value = "autoExplainAi", defaultValue = "false") boolean autoExplainAi
    ) {
        QuestionImportResponse response = questionImportService.importFromFile(file, defaultPartNo, autoExplainAi);
        return ApiResponseUtil.success(response, SuccessCode.QUESTIONS_BULK_IMPORTED);
    }

    @PostMapping(value = "/upload-media-batch", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<QuestionMediaBatchResponse>> uploadQuestionMediaBatch(
            @RequestParam("files") List<MultipartFile> files,
            @RequestParam(value = "groupPrefix", required = false) String groupPrefix,
            @RequestParam(value = "overwriteExisting", defaultValue = "false") boolean overwriteExisting
    ) {
        QuestionMediaBatchResponse response =
                questionMediaBatchService.uploadMediaBatch(files, groupPrefix, overwriteExisting);
        return ApiResponseUtil.success(response, SuccessCode.QUESTION_MEDIA_BATCH_UPLOADED);
    }

    @PostMapping(value = "/upload-media", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<CloudinaryUploadService.QuestionMediaAssetResult>> uploadSingleQuestionMedia(
            @RequestParam("file") MultipartFile file
    ) {
        if (file == null || file.isEmpty()) {
            throw new AppException(ErrorCode.INVALID_QUESTION_MEDIA);
        }
        try {
            CloudinaryUploadService.QuestionMediaAssetResult response =
                    cloudinaryUploadService.uploadQuestionAsset(
                            file.getBytes(),
                            file.getOriginalFilename(),
                            file.getContentType()
                    );
            return ApiResponseUtil.success(response, SuccessCode.QUESTION_MEDIA_UPLOADED);
        } catch (AppException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new AppException(ErrorCode.INVALID_QUESTION_MEDIA);
        }
    }

    @PostMapping("/ai-explain-draft")
    public ResponseEntity<ApiResponse<AIExplainResponse>> generateDraftExplanation(
            @RequestBody DraftQuestionExplainRequest request
    ) {
        AIExplainResponse response = openAIAnswerExplainService.generateDraftExplanation(request);
        return ApiResponseUtil.success(response, SuccessCode.QUESTION_GET);
    }

    @PostMapping("/bulk-import")
    public ResponseEntity<ApiResponse<List<QuestionResponse>>> bulkImportQuestions(
            @RequestBody BulkImportQuestionsRequest request
    ) {
        List<QuestionResponse> response = adminQuestionBankService.bulkCreateQuestions(
                request != null ? request.getQuestions() : null
        );
        return ApiResponseUtil.success(response, SuccessCode.QUESTIONS_BULK_IMPORTED);
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<QuestionResponse>>> getQuestions(
            @RequestParam(value = "keyword", required = false) String keyword
    ) {
        List<QuestionResponse> response = adminQuestionBankService.getQuestions(keyword);
        return ApiResponseUtil.success(response, SuccessCode.QUESTION_LISTED);
    }

    @PreAuthorize("hasAnyRole('ADMIN', 'CONTENT_MANAGER', 'USER')")
    @GetMapping("/parts/{partNo}")
    public ResponseEntity<ApiResponse<List<QuestionResponse>>> getQuestionsByPart(
            @PathVariable Integer partNo,
            @RequestParam(value = "keyword", required = false) String keyword
    ) {
        List<QuestionResponse> response = adminQuestionBankService.getQuestionsByPart(partNo, keyword);
        return ApiResponseUtil.success(response, SuccessCode.QUESTION_LISTED);
    }

    @GetMapping("/{questionId}")
    public ResponseEntity<ApiResponse<QuestionResponse>> getQuestionById(@PathVariable Long questionId) {
        QuestionResponse response = adminQuestionBankService.getQuestionById(questionId);
        return ApiResponseUtil.success(response, SuccessCode.QUESTION_GET);
    }

    @PutMapping("/{questionId}")
    public ResponseEntity<ApiResponse<QuestionResponse>> updateQuestion(
            @PathVariable Long questionId,
            @RequestBody UpdateQuestionRequest request
    ) {
        QuestionResponse response = adminQuestionBankService.updateQuestion(questionId, request);
        return ApiResponseUtil.success(response, SuccessCode.QUESTION_UPDATED);
    }

    @DeleteMapping("/{questionId}")
    public ResponseEntity<ApiResponse<Void>> deleteQuestion(@PathVariable Long questionId) {
        adminQuestionBankService.deleteQuestion(questionId);
        return ApiResponseUtil.success(SuccessCode.QUESTION_DELETED);
    }
}

