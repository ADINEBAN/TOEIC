import { API_BASE_URL } from '@/src/config/env';
import { BaseAdminService } from '@/src/services/admin/base-admin.service';
import {
  ApiVoidResponse,
  CreateQuestionRequest,
  DraftQuestionExplainRequest,
  QuestionApiItem,
  QuestionDraftExplainResponse,
  QuestionImportResponse,
  QuestionListResponse,
  QuestionMediaBatchResponse,
  QuestionMediaUploadResponse,
  QuestionResponse,
  UpdateQuestionRequest,
} from '@/src/types/admin-api';

export type QuestionImportFileInput =
  | File
  | { uri: string; name: string; type?: string };

function buildEndpointUrl(normalizedPath: string) {
  return API_BASE_URL.endsWith('/api') && normalizedPath.startsWith('/api/')
    ? `${API_BASE_URL}${normalizedPath.slice(4)}`
    : `${API_BASE_URL}${normalizedPath}`;
}

function appendMultipartFile(
  formData: FormData,
  fieldName: string,
  file: QuestionImportFileInput,
) {
  if (typeof File !== 'undefined' && file instanceof File) {
    formData.append(fieldName, file);
  } else {
    const asset = file as { uri: string; name: string; type?: string };
    formData.append(fieldName, {
      uri: asset.uri,
      name: asset.name,
      type: asset.type || 'application/octet-stream',
    } as unknown as Blob);
  }
}

export class AdminQuestionService extends BaseAdminService {
  getAll(keyword?: string) {
    const query = keyword?.trim()
      ? `?keyword=${encodeURIComponent(keyword.trim())}`
      : '';

    return this.request<QuestionListResponse>(`/api/admin/questions${query}`, {
      method: 'GET',
    });
  }

  getById(questionId: number) {
    return this.request<QuestionResponse>(`/api/admin/questions/${questionId}`, {
      method: 'GET',
    });
  }

  create(request: CreateQuestionRequest) {
    return this.request<QuestionResponse>('/api/admin/questions', {
      body: JSON.stringify(request),
      method: 'POST',
    });
  }

  bulkImport(questions: CreateQuestionRequest[]) {
    return this.request<QuestionListResponse>('/api/admin/questions/bulk-import', {
      body: JSON.stringify({ questions }),
      method: 'POST',
    });
  }

  explainDraft(request: DraftQuestionExplainRequest) {
    return this.request<QuestionDraftExplainResponse>('/api/admin/questions/ai-explain-draft', {
      body: JSON.stringify(request),
      method: 'POST',
    });
  }

  async importFile(
    file: QuestionImportFileInput,
    defaultPartNo = 5,
    autoExplainAi = false,
  ) {
    const formData = new FormData();
    formData.append('defaultPartNo', String(defaultPartNo));
    formData.append('autoExplainAi', String(autoExplainAi));
    appendMultipartFile(formData, 'file', file);

    return this.postMultipart<QuestionImportResponse>(
      '/api/admin/questions/import-file',
      formData,
      'Import câu hỏi thất bại',
    );
  }

  async uploadMedia(file: QuestionImportFileInput) {
    const formData = new FormData();
    appendMultipartFile(formData, 'file', file);

    return this.postMultipart<QuestionMediaUploadResponse>(
      '/api/admin/questions/upload-media',
      formData,
      'Upload media câu hỏi thất bại',
    );
  }

  async uploadMediaBatch(
    files: QuestionImportFileInput[],
    options?: {
      groupPrefix?: string;
      overwriteExisting?: boolean;
      onProgress?: (batchIndex: number, totalBatches: number) => void;
    },
  ) {
    const CHUNK_SIZE = 25;
    if (files.length <= CHUNK_SIZE) {
      options?.onProgress?.(1, 1);
      return this.postMediaBatchChunk(files, options);
    }

    let uploadedFileCount = 0;
    let storedAssetCount = 0;
    let skippedAlreadyLinkedCount = 0;
    const unmatchedFiles: string[] = [];
    const itemsById = new Map<number, QuestionApiItem>();
    let lastResponse: QuestionMediaBatchResponse | null = null;
    const totalBatches = Math.ceil(files.length / CHUNK_SIZE);

    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      const batchIndex = Math.floor(i / CHUNK_SIZE) + 1;
      options?.onProgress?.(batchIndex, totalBatches);
      const chunk = files.slice(i, i + CHUNK_SIZE);
      const res = await this.postMediaBatchChunk(chunk, options);
      lastResponse = res;
      if (res.data) {
        uploadedFileCount += res.data.uploadedFileCount ?? 0;
        storedAssetCount += res.data.storedAssetCount ?? 0;
        skippedAlreadyLinkedCount += res.data.skippedAlreadyLinkedCount ?? 0;
        if (Array.isArray(res.data.unmatchedFiles)) {
          unmatchedFiles.push(...res.data.unmatchedFiles);
        }
        for (const item of res.data.items ?? []) {
          itemsById.set(item.id, item);
        }
      }
    }

    const mergedItems = Array.from(itemsById.values());
    return {
      ...(lastResponse ?? { code: 1175, message: 'OK', status: 'OK' }),
      data: {
        uploadedFileCount,
        storedAssetCount,
        matchedQuestionCount: mergedItems.length,
        skippedAlreadyLinkedCount,
        unmatchedFiles,
        items: mergedItems,
      },
    } as QuestionMediaBatchResponse;
  }

  private postMediaBatchChunk(
    files: QuestionImportFileInput[],
    options?: { groupPrefix?: string; overwriteExisting?: boolean },
  ) {
    const formData = new FormData();
    for (const file of files) {
      appendMultipartFile(formData, 'files', file);
    }
    if (options?.groupPrefix?.trim()) {
      formData.append('groupPrefix', options.groupPrefix.trim());
    }
    formData.append('overwriteExisting', String(Boolean(options?.overwriteExisting)));

    return this.postMultipart<QuestionMediaBatchResponse>(
      '/api/admin/questions/upload-media-batch',
      formData,
      'Upload audio/ảnh hàng loạt thất bại',
    );
  }

  private async postMultipart<T extends { message?: string }>(
    normalizedPath: string,
    formData: FormData,
    fallbackError: string,
  ): Promise<T> {
    const response = await fetch(buildEndpointUrl(normalizedPath), {
      body: formData,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
      method: 'POST',
    });

    const payload = (await response.json().catch(() => null)) as T | null;
    if (!response.ok || !payload) {
      throw new Error(payload?.message ?? `${fallbackError} (${response.status})`);
    }

    return payload;
  }

  update(questionId: number, request: UpdateQuestionRequest) {
    return this.request<QuestionResponse>(`/api/admin/questions/${questionId}`, {
      body: JSON.stringify(request),
      method: 'PUT',
    });
  }

  delete(questionId: number) {
    return this.request<ApiVoidResponse>(`/api/admin/questions/${questionId}`, {
      method: 'DELETE',
    });
  }
}
