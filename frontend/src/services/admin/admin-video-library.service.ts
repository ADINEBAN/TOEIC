import { BaseAdminService } from '@/src/services/admin/base-admin.service';
import { ApiVoidResponse } from '@/src/types/admin-api';
import {
  ImportedVideoApiResponse,
  ImportedVideoListApiResponse,
  VideoJobApiResponse,
} from '@/src/types/user-api';

export type AdminVideoImportPayload = {
  videoUrl: string;
  title?: string;
  description?: string;
  preferredLevel?: string;
  topicHint?: string;
  customTranscript?: string;
  forceAsr?: boolean;
};

export type AdminVideoMetadataPayload = {
  title?: string;
  description?: string;
  authorName?: string;
  thumbnailUrl?: string;
  level?: string;
  topic?: string;
};

export type AdminSubtitleSegmentPayload = {
  id?: number;
  sequenceNumber?: number;
  startTime: number;
  endTime: number;
  englishText: string;
  vietnameseText: string;
  englishNote?: string;
};

export type AdminSubtitleUpdatePayload = {
  fullEnglishTranscript?: string;
  segments: AdminSubtitleSegmentPayload[];
};

export class AdminVideoLibraryService extends BaseAdminService {
  importVideo(payload: AdminVideoImportPayload) {
    return this.request<ImportedVideoApiResponse>('/api/admin/videos/import', {
      body: JSON.stringify(payload),
      method: 'POST',
    });
  }

  listVideos(params?: { status?: string; search?: string }) {
    const qs = new URLSearchParams();
    if (params?.status && params.status !== 'ALL') {
      qs.set('status', params.status);
    }
    if (params?.search?.trim()) {
      qs.set('search', params.search.trim());
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return this.request<ImportedVideoListApiResponse>(`/api/admin/videos${suffix}`, {
      method: 'GET',
    });
  }

  getVideoDetail(videoId: number) {
    return this.request<ImportedVideoApiResponse>(`/api/admin/videos/${videoId}`, {
      method: 'GET',
    });
  }

  updateMetadata(videoId: number, payload: AdminVideoMetadataPayload) {
    return this.request<ImportedVideoApiResponse>(`/api/admin/videos/${videoId}`, {
      body: JSON.stringify(payload),
      method: 'PUT',
    });
  }

  updateSubtitles(videoId: number, payload: AdminSubtitleUpdatePayload) {
    return this.request<ImportedVideoApiResponse>(`/api/admin/videos/${videoId}/subtitles`, {
      body: JSON.stringify(payload),
      method: 'PUT',
    });
  }

  updateSingleSegment(videoId: number, segmentId: number, payload: AdminSubtitleSegmentPayload) {
    return this.request<ImportedVideoApiResponse>(
      `/api/admin/videos/${videoId}/subtitles/${segmentId}`,
      {
        body: JSON.stringify(payload),
        method: 'PUT',
      }
    );
  }

  publishVideo(videoId: number) {
    return this.request<ImportedVideoApiResponse>(`/api/admin/videos/${videoId}/publish`, {
      body: JSON.stringify({}),
      method: 'POST',
    });
  }

  unpublishVideo(videoId: number) {
    return this.request<ImportedVideoApiResponse>(`/api/admin/videos/${videoId}/unpublish`, {
      body: JSON.stringify({}),
      method: 'POST',
    });
  }

  archiveVideo(videoId: number) {
    return this.request<ImportedVideoApiResponse>(`/api/admin/videos/${videoId}/archive`, {
      body: JSON.stringify({}),
      method: 'POST',
    });
  }

  aiSummarize(videoId: number, overwriteAll = false) {
    return this.request<ImportedVideoApiResponse>(
      `/api/admin/videos/${videoId}/ai-summarize?overwriteAll=${overwriteAll ? 'true' : 'false'}`,
      {
        body: JSON.stringify({}),
        method: 'POST',
      }
    );
  }

  deleteVideo(videoId: number) {
    return this.request<ApiVoidResponse>(`/api/admin/videos/${videoId}`, {
      method: 'DELETE',
    });
  }

  getJobStatus(jobId: number) {
    return this.request<VideoJobApiResponse>(`/api/admin/videos/jobs/${jobId}`, {
      method: 'GET',
    });
  }

  cancelJob(jobId: number) {
    return this.request<VideoJobApiResponse>(`/api/admin/videos/jobs/${jobId}/cancel`, {
      body: JSON.stringify({}),
      method: 'POST',
    });
  }

  retryJob(jobId: number) {
    return this.request<VideoJobApiResponse>(`/api/admin/videos/jobs/${jobId}/retry`, {
      body: JSON.stringify({}),
      method: 'POST',
    });
  }
}
