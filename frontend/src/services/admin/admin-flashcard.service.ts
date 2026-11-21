import { API_BASE_URL } from '@/src/config/env';
import { BaseAdminService } from '@/src/services/admin/base-admin.service';
import {
  ApiVoidResponse,
  CreateAdminFlashcardRequest,
  FlashcardAiSuggestResponse,
  FlashcardImportResponse,
  FlashcardListResponse,
  FlashcardResponse,
  UpdateAdminFlashcardRequest,
} from '@/src/types/admin-api';

export type FlashcardImportFileInput =
  | File
  | { uri: string; name: string; type?: string };

export class AdminFlashcardService extends BaseAdminService {
  getByModuleId(moduleId: number) {
    return this.request<FlashcardListResponse>(`/api/admin/flashcards/modules/${moduleId}`, {
      method: 'GET',
    });
  }

  aiSuggest(word: string) {
    return this.request<FlashcardAiSuggestResponse>(
      `/api/admin/flashcards/ai-suggest?word=${encodeURIComponent(word)}`,
      {
        method: 'GET',
      },
    );
  }

  async importFile(
    moduleId: number,
    file: FlashcardImportFileInput,
    autoFillAi = true,
  ) {
    const normalizedPath = '/api/admin/flashcards/import';
    const requestUrl =
      API_BASE_URL.endsWith('/api') && normalizedPath.startsWith('/api/')
        ? `${API_BASE_URL}${normalizedPath.slice(4)}`
        : `${API_BASE_URL}${normalizedPath}`;

    const formData = new FormData();
    formData.append('moduleId', String(moduleId));
    formData.append('autoFillAi', String(autoFillAi));
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

    const payload = (await response.json().catch(() => null)) as FlashcardImportResponse | null;
    if (!response.ok || !payload) {
      throw new Error(payload?.message ?? `Import flashcard thất bại (${response.status})`);
    }

    return payload;
  }

  create(request: CreateAdminFlashcardRequest) {
    return this.request<FlashcardResponse>('/api/admin/flashcards', {
      body: JSON.stringify(request),
      method: 'POST',
    });
  }

  update(flashcardId: number, request: UpdateAdminFlashcardRequest) {
    return this.request<FlashcardResponse>(`/api/admin/flashcards/${flashcardId}`, {
      body: JSON.stringify(request),
      method: 'PUT',
    });
  }

  delete(flashcardId: number) {
    return this.request<ApiVoidResponse>(`/api/admin/flashcards/${flashcardId}`, {
      method: 'DELETE',
    });
  }
}
