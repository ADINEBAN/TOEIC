import { API_BASE_URL } from '@/src/config/env';
import { BaseAdminService } from '@/src/services/admin/base-admin.service';
import {
  ApiVoidResponse,
  CreateQuestionRequest,
  DraftQuestionExplainRequest,
  QuestionDraftExplainResponse,
  QuestionImportResponse,
  QuestionListResponse,
  QuestionResponse,
  UpdateQuestionRequest,
} from '@/src/types/admin-api';

export type QuestionImportFileInput =
  | File
  | { uri: string; name: string; type?: string };

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
    const normalizedPath = '/api/admin/questions/import-file';
    const requestUrl =
      API_BASE_URL.endsWith('/api') && normalizedPath.startsWith('/api/')
        ? `${API_BASE_URL}${normalizedPath.slice(4)}`
        : `${API_BASE_URL}${normalizedPath}`;

    const formData = new FormData();
    formData.append('defaultPartNo', String(defaultPartNo));
    formData.append('autoExplainAi', String(autoExplainAi));
    if (typeof File !== 'undefined' && file instanceof File) {
      formData.append('file', file);
    } else {
      formData.append('file', {
        uri: (file as { uri: string; name: string; type?: string }).uri,
        name: (file as { uri: string; name: string; type?: string }).name,
        type: (file as { uri: string; name: string; type?: string }).type || 'application/octet-stream',
      } as unknown as Blob);
    }

    const response = await fetch(requestUrl, {
      body: formData,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
      method: 'POST',
    });

    const payload = (await response.json().catch(() => null)) as QuestionImportResponse | null;
    if (!response.ok || !payload) {
      throw new Error(payload?.message ?? `Import câu hỏi thất bại (${response.status})`);
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
