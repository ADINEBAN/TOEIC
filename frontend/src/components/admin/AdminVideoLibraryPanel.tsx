import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radius, spacing } from '@/src/assets/styles/theme';
import {
  AdminSubtitleSegmentPayload,
  AdminVideoLibraryService,
} from '@/src/services/admin/admin-video-library.service';
import { ImportedVideoDetailData } from '@/src/types/user-api';
import { confirmWeb } from '@/src/utils/web-dialog';

type WorkflowFilter = 'ALL' | 'PROCESSING' | 'REVIEWING' | 'PUBLISHED' | 'FAILED_OR_ARCHIVED';

const LEVEL_CHOICES = ['AUTO', 'A2', 'B1', 'B2', 'C1'] as const;

const WORKFLOW_FILTER_OPTIONS: { key: WorkflowFilter; label: string }[] = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'PROCESSING', label: 'Đang xử lý (Draft → Translating)' },
  { key: 'REVIEWING', label: 'Chờ duyệt (Reviewing)' },
  { key: 'PUBLISHED', label: 'Đã xuất bản (Published)' },
  { key: 'FAILED_OR_ARCHIVED', label: 'Lưu trữ / Lỗi' },
];

const ACTIVE_JOB_STATUSES = new Set([
  'QUEUED',
  'FETCHING_METADATA',
  'DOWNLOADING',
  'EXTRACTING_AUDIO',
  'TRANSCRIBING',
  'TRANSLATING',
  'SAVING',
]);

function formatClock(sec?: number | null): string {
  const s = Math.max(0, Math.floor(sec ?? 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (hrs > 0) {
    return `${hrs < 10 ? '0' : ''}${hrs}:${mins < 10 ? '0' : ''}${mins}:${rem < 10 ? '0' : ''}${rem}`;
  }
  return `${mins < 10 ? '0' : ''}${mins}:${rem < 10 ? '0' : ''}${rem}`;
}

function getWorkflowBadgeStyle(status?: string | null) {
  const norm = (status || 'DRAFT').toUpperCase();
  if (norm === 'PUBLISHED') {
    return { bg: colors.successSoft, border: '#86EFAC', fg: colors.success, label: 'PUBLISHED • Đã xuất bản' };
  }
  if (norm === 'REVIEWING') {
    return { bg: colors.warningSoft, border: '#FCD34D', fg: colors.warning, label: 'REVIEWING • Chờ duyệt' };
  }
  if (norm === 'FAILED') {
    return { bg: colors.dangerSoft, border: '#FECACA', fg: colors.danger, label: 'FAILED • Lỗi xử lý' };
  }
  if (norm === 'ARCHIVED') {
    return { bg: colors.surfaceMuted, border: colors.borderStrong, fg: colors.textMuted, label: 'ARCHIVED • Lưu trữ' };
  }
  return { bg: colors.primarySoft, border: '#93C5FD', fg: colors.primaryDark, label: `${norm} • Đang xử lý` };
}

type EditableSegmentRow = {
  id?: number;
  startTimeText: string;
  endTimeText: string;
  englishText: string;
  vietnameseText: string;
};

export default function AdminVideoLibraryPanel({ accessToken }: { accessToken: string }) {
  const service = useMemo(() => new AdminVideoLibraryService(accessToken), [accessToken]);

  // List & Filter State
  const [videos, setVideos] = useState<ImportedVideoDetailData[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Import Form State (blank fields are automatically AI-summarized after transcript/captions complete)
  const [videoUrl, setVideoUrl] = useState('');
  const [importTitle, setImportTitle] = useState('');
  const [importDescription, setImportDescription] = useState('');
  const [importLevel, setImportLevel] = useState<string>('AUTO');
  const [importTopic, setImportTopic] = useState('');
  const [customTranscript, setCustomTranscript] = useState('');
  const [forceAsr, setForceAsr] = useState(false);
  const [showAdvancedImport, setShowAdvancedImport] = useState(false);

  // Review & Subtitle Editor Modal State
  const [reviewVideo, setReviewVideo] = useState<ImportedVideoDetailData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [editLevel, setEditLevel] = useState('B1');
  const [editTopic, setEditTopic] = useState('');
  const [editThumbnailUrl, setEditThumbnailUrl] = useState('');
  const [editFullTranscript, setEditFullTranscript] = useState('');
  const [editSegments, setEditSegments] = useState<EditableSegmentRow[]>([]);

  const fetchVideos = useCallback(
    async (silent = false) => {
      try {
        if (!silent) {
          setLoading(true);
          setErrorMessage(null);
        }
        const res = await service.listVideos({
          status: workflowFilter,
          search: searchQuery,
        });
        setVideos(res.data ?? []);
      } catch (err) {
        if (!silent) {
          setErrorMessage(err instanceof Error ? err.message : 'Không thể tải danh sách video.');
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [searchQuery, service, workflowFilter]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchVideos(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchVideos]);

  const hasRunningJobs = useMemo(
    () =>
      videos.some((v) => v.latestJob && ACTIVE_JOB_STATUSES.has(v.latestJob.status)),
    [videos]
  );

  useEffect(() => {
    if (!hasRunningJobs) return;
    const poll = setInterval(() => {
      void fetchVideos(true);
    }, 2500);
    return () => clearInterval(poll);
  }, [fetchVideos, hasRunningJobs]);

  const hydrateReviewForm = (detail: ImportedVideoDetailData) => {
    setReviewVideo(detail);
    setEditTitle(detail.title ?? '');
    setEditDescription(detail.description ?? '');
    setEditAuthor(detail.authorName ?? '');
    setEditLevel(detail.level || 'B1');
    setEditTopic(detail.topic ?? '');
    setEditThumbnailUrl(detail.thumbnailUrl ?? '');
    setEditFullTranscript(detail.fullEnglishTranscript ?? '');
    setEditSegments(
      (detail.segments ?? []).map((seg) => ({
        id: seg.id,
        startTimeText: String(seg.startTime ?? 0),
        endTimeText: String(seg.endTime ?? 0),
        englishText: seg.englishText ?? '',
        vietnameseText: seg.vietnameseText ?? '',
      }))
    );
  };

  const openReviewModal = async (videoId: number) => {
    try {
      setLoadingDetail(true);
      setErrorMessage(null);
      const res = await service.getVideoDetail(videoId);
      if (res.data) {
        hydrateReviewForm(res.data);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể mở chi tiết video.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleImportSubmit = async () => {
    const trimmedUrl = videoUrl.trim();
    if (!trimmedUrl) {
      Alert.alert('Thiếu URL', 'Vui lòng nhập đường dẫn YouTube hoặc URL media tiếng Anh.');
      return;
    }
    try {
      setWorking(true);
      setErrorMessage(null);
      await service.importVideo({
        videoUrl: trimmedUrl,
        title: importTitle.trim() || undefined,
        description: importDescription.trim() || undefined,
        preferredLevel: importLevel !== 'AUTO' ? importLevel : undefined,
        topicHint: importTopic.trim() || undefined,
        customTranscript: customTranscript.trim() || undefined,
        forceAsr,
      });
      setVideoUrl('');
      setImportTitle('');
      setImportTopic('');
      setImportDescription('');
      setCustomTranscript('');
      await fetchVideos(false);
      Alert.alert(
        'Đã tạo tác vụ xử lý',
        forceAsr
          ? 'Video đang chạy pipeline Whisper ASR và dịch song ngữ. Các trường để trống sẽ được AI tự tóm tắt.'
          : 'Video đang chạy pipeline siêu tốc (ưu tiên phụ đề gốc + dịch song song AI). Các trường để trống sẽ được AI tự tóm tắt.'
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể nhập video.');
    } finally {
      setWorking(false);
    }
  };

  const handleSaveMetadata = async () => {
    if (!reviewVideo) return;
    try {
      setWorking(true);
      setErrorMessage(null);
      const res = await service.updateMetadata(reviewVideo.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        authorName: editAuthor.trim(),
        level: editLevel,
        topic: editTopic.trim(),
        thumbnailUrl: editThumbnailUrl.trim(),
      });
      if (res.data) {
        hydrateReviewForm(res.data);
      }
      await fetchVideos(true);
      Alert.alert('Đã lưu', 'Thông tin metadata của video đã được cập nhật.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể lưu thông tin video.');
    } finally {
      setWorking(false);
    }
  };

  const handleSaveSubtitles = async () => {
    if (!reviewVideo) return;
    try {
      setWorking(true);
      setErrorMessage(null);
      const payloadSegments: AdminSubtitleSegmentPayload[] = editSegments.map((row, index) => {
        const start = Number(row.startTimeText);
        const end = Number(row.endTimeText);
        return {
          id: row.id,
          sequenceNumber: index + 1,
          startTime: Number.isFinite(start) && start >= 0 ? start : index * 4,
          endTime: Number.isFinite(end) && end > start ? end : (Number.isFinite(start) ? start : index * 4) + 3.5,
          englishText: row.englishText,
          vietnameseText: row.vietnameseText,
        };
      });

      const res = await service.updateSubtitles(reviewVideo.id, {
        fullEnglishTranscript: editFullTranscript.trim() || undefined,
        segments: payloadSegments,
      });
      if (res.data) {
        hydrateReviewForm(res.data);
      }
      await fetchVideos(true);
      Alert.alert('Đã lưu phụ đề', 'Transcript tiếng Anh và phụ đề song ngữ EN–VI đã được cập nhật.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể lưu phụ đề.');
    } finally {
      setWorking(false);
    }
  };

  const handleWorkflowAction = async (
    action: 'publish' | 'unpublish' | 'archive' | 'delete',
    video: ImportedVideoDetailData
  ) => {
    if (action === 'delete' && !confirmWeb(`Xóa vĩnh viễn video "${video.title}" cùng toàn bộ phụ đề?`)) {
      return;
    }
    try {
      setWorking(true);
      setErrorMessage(null);
      if (action === 'publish') {
        const res = await service.publishVideo(video.id);
        if (reviewVideo?.id === video.id && res.data) hydrateReviewForm(res.data);
      } else if (action === 'unpublish') {
        const res = await service.unpublishVideo(video.id);
        if (reviewVideo?.id === video.id && res.data) hydrateReviewForm(res.data);
      } else if (action === 'archive') {
        const res = await service.archiveVideo(video.id);
        if (reviewVideo?.id === video.id && res.data) hydrateReviewForm(res.data);
      } else if (action === 'delete') {
        await service.deleteVideo(video.id);
        if (reviewVideo?.id === video.id) setReviewVideo(null);
      }
      await fetchVideos(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Thao tác không thành công.');
    } finally {
      setWorking(false);
    }
  };

  const handleJobControl = async (action: 'cancel' | 'retry', jobId: number) => {
    try {
      setWorking(true);
      setErrorMessage(null);
      if (action === 'cancel') {
        await service.cancelJob(jobId);
      } else {
        await service.retryJob(jobId);
      }
      await fetchVideos(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể điều khiển tác vụ nền.');
    } finally {
      setWorking(false);
    }
  };

  const handleAiSummarize = async (videoId: number, overwriteAll: boolean) => {
    try {
      setWorking(true);
      setErrorMessage(null);
      const res = await service.aiSummarize(videoId, overwriteAll);
      if (reviewVideo?.id === videoId && res.data) {
        hydrateReviewForm(res.data);
      }
      await fetchVideos(true);
      Alert.alert(
        'Đã tóm tắt bằng AI',
        overwriteAll
          ? 'AI đã tự động tổng hợp Tiêu đề, Chủ đề, Mô tả và Trình độ mới từ transcript video.'
          : 'AI đã tự động điền các trường Tiêu đề / Chủ đề / Mô tả còn trống.'
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể tóm tắt nội dung video bằng AI.');
    } finally {
      setWorking(false);
    }
  };

  const updateSegmentField = (
    idx: number,
    field: keyof EditableSegmentRow,
    value: string
  ) => {
    setEditSegments((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );
  };

  const addSegmentRow = () => {
    setEditSegments((prev) => {
      const lastEnd = prev.length > 0 ? Number(prev[prev.length - 1].endTimeText) || 0 : 0;
      return [
        ...prev,
        {
          startTimeText: String(lastEnd),
          endTimeText: String(lastEnd + 4),
          englishText: '',
          vietnameseText: '',
        },
      ];
    });
  };

  const removeSegmentRow = (idx: number) => {
    setEditSegments((prev) => prev.filter((_, i) => i !== idx));
  };

  const publishedCount = videos.filter((v) => v.published).length;
  const reviewingCount = videos.filter((v) => v.workflowStatus === 'REVIEWING').length;
  const processingCount = videos.filter(
    (v) => v.latestJob && ACTIVE_JOB_STATUSES.has(v.latestJob.status)
  ).length;

  return (
    <View style={styles.container}>
      {errorMessage ? <Text style={styles.errorBanner}>{errorMessage}</Text> : null}

      {/* KPI Summary Strip */}
      <View style={styles.kpiRow}>
        <View style={[styles.kpiCard, { borderLeftColor: colors.primary }]}>
          <Text style={styles.kpiValue}>{videos.length}</Text>
          <Text style={styles.kpiLabel}>Tổng Video</Text>
        </View>
        <View style={[styles.kpiCard, { borderLeftColor: colors.success }]}>
          <Text style={styles.kpiValue}>{publishedCount}</Text>
          <Text style={styles.kpiLabel}>Đã Xuất Bản (Học viên xem)</Text>
        </View>
        <View style={[styles.kpiCard, { borderLeftColor: colors.warning }]}>
          <Text style={styles.kpiValue}>{reviewingCount}</Text>
          <Text style={styles.kpiLabel}>Chờ Duyệt Phụ Đề</Text>
        </View>
        <View style={[styles.kpiCard, { borderLeftColor: '#7C3AED' }]}>
          <Text style={styles.kpiValue}>{processingCount}</Text>
          <Text style={styles.kpiLabel}>Đang Xử Lý Nền</Text>
        </View>
      </View>

      {/* Admin Video URL Import Card */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View>
            <Text style={styles.cardTitle}>Nhập & Xử Lý Video Mới</Text>
          </View>
          <Pressable
            onPress={() => setShowAdvancedImport((prev) => !prev)}
            style={styles.secondaryBtn}
          >
            <Text style={styles.secondaryBtnText}>
              {showAdvancedImport ? 'Ẩn tùy chọn nâng cao' : 'Tùy chọn nâng cao'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.formGrid}>
          <View style={styles.fieldWide}>
            <Text style={styles.fieldLabel}>URL Video (YouTube / MP4 / MP3 trực tiếp) *</Text>
            <TextInput
              autoCapitalize="none"
              onChangeText={setVideoUrl}
              placeholder="https://www.youtube.com/watch?v=..."
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={videoUrl}
            />
          </View>

          <View style={styles.fieldHalf}>
            <Text style={styles.fieldLabel}>Tiêu đề bài học (để trống = AI tự tóm tắt ngắn gọn)</Text>
            <TextInput
              onChangeText={setImportTitle}
              placeholder="Để trống để AI tự đặt tiêu đề súc tích theo nội dung..."
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={importTitle}
            />
          </View>

          <View style={styles.fieldHalf}>
            <Text style={styles.fieldLabel}>Chủ đề / Topic (để trống = AI tự phân loại)</Text>
            <TextInput
              onChangeText={setImportTopic}
              placeholder="VD: Business Meeting... (để trống = AI tự tóm tắt topic)"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={importTopic}
            />
          </View>

          <View style={styles.fieldWide}>
            <Text style={styles.fieldLabel}>Mô tả bài học (để trống = AI tự tóm tắt tiếng Việt)</Text>
            <TextInput
              onChangeText={setImportDescription}
              placeholder="Để trống để AI tự tóm tắt nội dung chính và từ vựng trọng tâm sau khi dịch..."
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={importDescription}
            />
          </View>

          <View style={styles.inlineChoiceRow}>
            <Text style={styles.fieldLabel}>Trình độ:</Text>
            {LEVEL_CHOICES.map((lvl) => {
              const active = importLevel === lvl;
              const label = lvl === 'AUTO' ? 'Tự động (AI)' : lvl;
              return (
                <Pressable
                  key={lvl}
                  onPress={() => setImportLevel(lvl)}
                  style={[styles.pillChip, active && styles.pillChipActive]}
                >
                  <Text style={[styles.pillChipText, active && styles.pillChipTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.inlineChoiceRow}>
            <Text style={styles.fieldLabel}>Tốc độ xử lý:</Text>
            <Pressable
              onPress={() => setForceAsr(false)}
              style={[styles.pillChip, !forceAsr && styles.pillChipActive]}
            >
              <Text style={[styles.pillChipText, !forceAsr && styles.pillChipTextActive]}>
                {!forceAsr ? '✓ ' : ''}⚡ Nhanh (Ưu tiên Phụ đề gốc → Whisper khi thiếu)
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setForceAsr(true)}
              style={[styles.pillChip, forceAsr && styles.pillChipActive]}
            >
              <Text style={[styles.pillChipText, forceAsr && styles.pillChipTextActive]}>
                {forceAsr ? '✓ ' : ''}🎙 Chạy lại Whisper ASR từ Audio (Chậm hơn)
              </Text>
            </Pressable>
          </View>

          {showAdvancedImport ? (
            <View style={styles.fieldWide}>
              <Text style={styles.fieldLabel}>Transcript tiếng Anh có sẵn (tùy chọn)</Text>
              <TextInput
                multiline
                numberOfLines={4}
                onChangeText={setCustomTranscript}
                placeholder="Dán lời thoại tiếng Anh đầy đủ nếu muốn bỏ qua bước nhận dạng giọng nói..."
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.textarea]}
                value={customTranscript}
              />
            </View>
          ) : null}
        </View>

        <View style={styles.submitRow}>
          <Pressable
            disabled={working}
            onPress={() => void handleImportSubmit()}
            style={[styles.primaryBtn, working && { opacity: 0.65 }]}
          >
            {working ? (
              <ActivityIndicator color={colors.onPrimary} size="small" />
            ) : (
              <Ionicons color={colors.onPrimary} name="cloud-download-outline" size={17} />
            )}
            <Text style={styles.primaryBtnText}>Nhập Video & Xử Lý Phụ Đề Song Ngữ AI</Text>
          </Pressable>
        </View>
      </View>

      {/* Filter & Search Toolbar */}
      <View style={styles.card}>
        <View style={styles.toolbarRow}>
          <View style={styles.filterPillsWrap}>
            {WORKFLOW_FILTER_OPTIONS.map((opt) => {
              const active = workflowFilter === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setWorkflowFilter(opt.key)}
                  style={[styles.pillChip, active && styles.pillChipActive]}
                >
                  <Text style={[styles.pillChipText, active && styles.pillChipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.searchActionsWrap}>
            <TextInput
              onChangeText={setSearchQuery}
              placeholder="Tìm theo tiêu đề, URL, chủ đề..."
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { minWidth: 240 }]}
              value={searchQuery}
            />
            <Pressable onPress={() => void fetchVideos(false)} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Làm mới</Text>
            </Pressable>
          </View>
        </View>

        {loading || loadingDetail ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.subtleText}>Đang đồng bộ thư viện video...</Text>
          </View>
        ) : null}

        {videos.length === 0 && !loading ? (
          <Text style={styles.subtleText}>Chưa có video nào trong bộ lọc hiện tại.</Text>
        ) : (
          <View style={styles.videoList}>
            {videos.map((video) => {
              const badge = getWorkflowBadgeStyle(video.workflowStatus);
              const job = video.latestJob;
              const isJobRunning = Boolean(job && ACTIVE_JOB_STATUSES.has(job.status));
              const isJobRetryable = Boolean(job && ['FAILED', 'CANCELLED'].includes(job.status));
              const blockers = video.publishBlockers ?? [];

              return (
                <View key={video.id} style={styles.videoItemCard}>
                  <View style={styles.videoTopRow}>
                    {video.thumbnailUrl ? (
                      <Image
                        resizeMode="cover"
                        source={{ uri: video.thumbnailUrl }}
                        style={styles.thumbImg}
                      />
                    ) : (
                      <View style={[styles.thumbImg, styles.thumbFallback]}>
                        <Ionicons color={colors.textMuted} name="videocam-outline" size={24} />
                      </View>
                    )}

                    <View style={styles.videoInfoCol}>
                      <View style={styles.badgeRow}>
                        <View
                          style={[
                            styles.statusBadge,
                            { backgroundColor: badge.bg, borderColor: badge.border },
                          ]}
                        >
                          <Text style={[styles.statusBadgeText, { color: badge.fg }]}>
                            {badge.label}
                          </Text>
                        </View>
                        <Text style={styles.metaTag}>
                          Level {video.level && video.level !== 'AUTO' ? video.level : 'AI Auto'} •{' '}
                          {video.topic ? video.topic : 'Chờ AI tóm tắt Topic'} • Thời lượng:{' '}
                          {video.durationLabel || formatClock(video.durationSeconds)} (Xác minh:{' '}
                          {formatClock(video.verifiedMediaDurationSeconds)})
                        </Text>
                      </View>

                      <Text style={styles.videoTitleText}>
                        #{video.id} • {video.title}
                      </Text>
                      {video.description ? (
                        <Text numberOfLines={2} style={styles.subtleText}>
                          {video.description}
                        </Text>
                      ) : null}
                      <Text numberOfLines={1} style={styles.urlHintText}>
                        Nguồn: {video.sourceUrl}
                      </Text>

                      {/* Background Processing Job Monitor */}
                      {job ? (
                        <View style={styles.jobBox}>
                          <View style={styles.jobTopRow}>
                            <Text style={styles.jobStatusLabel}>
                              Job #{job.jobId}: {job.status} ({job.overallProgress}%)
                              {job.totalChunks > 0
                                ? ` • Chunk ${job.completedChunks}/${job.totalChunks}`
                                : ''}
                            </Text>
                            <Text style={styles.jobStatsText}>
                              Tải {job.downloadProgress}% • Audio {job.audioExtractionProgress}% • ASR{' '}
                              {job.transcriptionProgress}% • Dịch {job.translationProgress}%
                            </Text>
                          </View>
                          <View style={styles.progressTrack}>
                            <View
                              style={[
                                styles.progressFill,
                                { width: `${Math.max(0, Math.min(100, job.overallProgress))}%` },
                              ]}
                            />
                          </View>
                          {job.currentStageMessage ? (
                            <Text style={styles.subtleText}>{job.currentStageMessage}</Text>
                          ) : null}
                          {job.errorMessage ? (
                            <Text style={styles.blockerText}>Lỗi: {job.errorMessage}</Text>
                          ) : null}
                        </View>
                      ) : null}

                      {/* Readiness Blockers */}
                      {!video.published && blockers.length > 0 ? (
                        <View style={styles.blockerBox}>
                          <Text style={styles.blockerTitle}>Điều kiện cần hoàn tất trước khi Xuất bản:</Text>
                          {blockers.map((b, i) => (
                            <Text key={i} style={styles.blockerText}>
                              • {b}
                            </Text>
                          ))}
                        </View>
                      ) : !video.published && video.readyToPublish ? (
                        <Text style={styles.readyText}>
                          ✓ Đã xác minh đủ thời lượng, transcript và phụ đề song ngữ EN–VI. Sẵn sàng xuất bản!
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.actionRow}>
                    <Pressable
                      disabled={working}
                      onPress={() => void openReviewModal(video.id)}
                      style={styles.secondaryBtn}
                    >
                      <Ionicons color={colors.primaryDark} name="create-outline" size={16} />
                      <Text style={styles.secondaryBtnText}>Duyệt & Sửa Phụ Đề</Text>
                    </Pressable>

                    {Boolean(video.fullEnglishTranscript) ||
                    video.workflowStatus === 'REVIEWING' ||
                    video.workflowStatus === 'PUBLISHED' ? (
                      <Pressable
                        disabled={working}
                        onPress={() => void handleAiSummarize(video.id, true)}
                        style={styles.secondaryBtn}
                      >
                        <Ionicons color={colors.primaryDark} name="sparkles-outline" size={15} />
                        <Text style={styles.secondaryBtnText}>AI Tóm tắt</Text>
                      </Pressable>
                    ) : null}

                    {!video.published ? (
                      <Pressable
                        disabled={working || !video.readyToPublish}
                        onPress={() => void handleWorkflowAction('publish', video)}
                        style={[
                          styles.successBtn,
                          (!video.readyToPublish || working) && { opacity: 0.45 },
                        ]}
                      >
                        <Ionicons color="#FFFFFF" name="checkmark-circle-outline" size={16} />
                        <Text style={styles.primaryBtnText}>Xuất bản (Publish)</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        disabled={working}
                        onPress={() => void handleWorkflowAction('unpublish', video)}
                        style={styles.warningBtn}
                      >
                        <Ionicons color="#FFFFFF" name="eye-off-outline" size={16} />
                        <Text style={styles.primaryBtnText}>Gỡ xuất bản (Unpublish)</Text>
                      </Pressable>
                    )}

                    {video.workflowStatus !== 'ARCHIVED' ? (
                      <Pressable
                        disabled={working}
                        onPress={() => void handleWorkflowAction('archive', video)}
                        style={styles.secondaryBtn}
                      >
                        <Text style={styles.secondaryBtnText}>Lưu trữ</Text>
                      </Pressable>
                    ) : null}

                    {isJobRunning && job ? (
                      <Pressable
                        disabled={working}
                        onPress={() => void handleJobControl('cancel', job.jobId)}
                        style={styles.dangerOutlineBtn}
                      >
                        <Text style={styles.dangerOutlineText}>Hủy Job</Text>
                      </Pressable>
                    ) : null}

                    {isJobRetryable && job ? (
                      <Pressable
                        disabled={working}
                        onPress={() => void handleJobControl('retry', job.jobId)}
                        style={styles.secondaryBtn}
                      >
                        <Ionicons color={colors.primaryDark} name="refresh-outline" size={15} />
                        <Text style={styles.secondaryBtnText}>Thử lại Job</Text>
                      </Pressable>
                    ) : null}

                    <Pressable
                      disabled={working}
                      onPress={() => void handleWorkflowAction('delete', video)}
                      style={styles.dangerOutlineBtn}
                    >
                      <Ionicons color={colors.danger} name="trash-outline" size={15} />
                      <Text style={styles.dangerOutlineText}>Xóa</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Review, Metadata & Bilingual Subtitle Editor Modal */}
      <Modal
        animationType="fade"
        onRequestClose={() => setReviewVideo(null)}
        transparent
        visible={Boolean(reviewVideo)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  Biên tập & Kiểm duyệt Video #{reviewVideo?.id}
                </Text>
                <Text style={styles.cardSubtitle}>
                  Trạng thái: {reviewVideo?.workflowStatus} • {editSegments.length} phân đoạn phụ đề song ngữ
                </Text>
              </View>
              <Pressable onPress={() => setReviewVideo(null)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Đóng</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={{ gap: spacing.md }}>
              {/* Metadata Editor */}
              <View style={styles.subCard}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.sectionHeading}>1. Thông tin Metadata Bài học</Text>
                  <Pressable
                    disabled={working}
                    onPress={() => reviewVideo && void handleAiSummarize(reviewVideo.id, true)}
                    style={styles.secondaryBtn}
                  >
                    <Ionicons color={colors.primaryDark} name="sparkles-outline" size={15} />
                    <Text style={styles.secondaryBtnText}>AI Tự tóm tắt Tiêu đề & Chủ đề</Text>
                  </Pressable>
                </View>
                <View style={styles.formGrid}>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.fieldLabel}>Tiêu đề *</Text>
                    <TextInput
                      onChangeText={setEditTitle}
                      style={styles.input}
                      value={editTitle}
                    />
                  </View>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.fieldLabel}>Tác giả / Kênh</Text>
                    <TextInput
                      onChangeText={setEditAuthor}
                      style={styles.input}
                      value={editAuthor}
                    />
                  </View>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.fieldLabel}>Trình độ (A2/B1/B2/C1)</Text>
                    <TextInput
                      onChangeText={setEditLevel}
                      style={styles.input}
                      value={editLevel}
                    />
                  </View>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.fieldLabel}>Chủ đề</Text>
                    <TextInput
                      onChangeText={setEditTopic}
                      style={styles.input}
                      value={editTopic}
                    />
                  </View>
                  <View style={styles.fieldWide}>
                    <Text style={styles.fieldLabel}>Thumbnail URL</Text>
                    <TextInput
                      onChangeText={setEditThumbnailUrl}
                      style={styles.input}
                      value={editThumbnailUrl}
                    />
                  </View>
                  <View style={styles.fieldWide}>
                    <Text style={styles.fieldLabel}>Mô tả bài học</Text>
                    <TextInput
                      multiline
                      numberOfLines={2}
                      onChangeText={setEditDescription}
                      style={[styles.input, { minHeight: 62 }]}
                      value={editDescription}
                    />
                  </View>
                </View>
                <View style={styles.submitRow}>
                  <Pressable
                    disabled={working}
                    onPress={() => void handleSaveMetadata()}
                    style={styles.primaryBtn}
                  >
                    <Text style={styles.primaryBtnText}>Lưu Metadata</Text>
                  </Pressable>
                </View>
              </View>

              {/* Transcript & Bilingual Subtitles Editor */}
              <View style={styles.subCard}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.sectionHeading}>
                    2. Chỉnh sửa Transcript & Phụ đề Song ngữ ({editSegments.length} câu)
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable onPress={addSegmentRow} style={styles.secondaryBtn}>
                      <Text style={styles.secondaryBtnText}>+ Thêm câu phụ đề</Text>
                    </Pressable>
                    <Pressable
                      disabled={working}
                      onPress={() => void handleSaveSubtitles()}
                      style={styles.primaryBtn}
                    >
                      <Text style={styles.primaryBtnText}>Lưu Toàn Bộ Phụ Đề</Text>
                    </Pressable>
                  </View>
                </View>

                <Text style={styles.fieldLabel}>Transcript tiếng Anh đầy đủ</Text>
                <TextInput
                  multiline
                  numberOfLines={3}
                  onChangeText={setEditFullTranscript}
                  placeholder="Transcript tổng hợp (tự động đồng bộ từ các câu phụ đề nếu để trống)..."
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, styles.textarea]}
                  value={editFullTranscript}
                />

                <View style={{ gap: 10, marginTop: 8 }}>
                  {editSegments.map((seg, idx) => (
                    <View key={seg.id ?? `new-${idx}`} style={styles.segmentEditCard}>
                      <View style={styles.segmentTimeRow}>
                        <Text style={styles.segmentIndexLabel}>Câu #{idx + 1}</Text>
                        <View style={styles.timeFieldWrap}>
                          <Text style={styles.metaTag}>Bắt đầu (s):</Text>
                          <TextInput
                            keyboardType="numeric"
                            onChangeText={(v) => updateSegmentField(idx, 'startTimeText', v)}
                            style={styles.timeInput}
                            value={seg.startTimeText}
                          />
                        </View>
                        <View style={styles.timeFieldWrap}>
                          <Text style={styles.metaTag}>Kết thúc (s):</Text>
                          <TextInput
                            keyboardType="numeric"
                            onChangeText={(v) => updateSegmentField(idx, 'endTimeText', v)}
                            style={styles.timeInput}
                            value={seg.endTimeText}
                          />
                        </View>
                        <Pressable
                          onPress={() => removeSegmentRow(idx)}
                          style={[styles.dangerOutlineBtn, { marginLeft: 'auto', paddingVertical: 4 }]}
                        >
                          <Text style={styles.dangerOutlineText}>Xóa câu</Text>
                        </Pressable>
                      </View>

                      <Text style={styles.metaTag}>Tiếng Anh (English):</Text>
                      <TextInput
                        onChangeText={(v) => updateSegmentField(idx, 'englishText', v)}
                        placeholder="Nhập câu phụ đề tiếng Anh..."
                        placeholderTextColor={colors.textMuted}
                        style={styles.input}
                        value={seg.englishText}
                      />

                      <Text style={styles.metaTag}>Bản dịch Tiếng Việt (Vietnamese):</Text>
                      <TextInput
                        onChangeText={(v) => updateSegmentField(idx, 'vietnameseText', v)}
                        placeholder="Nhập bản dịch tiếng Việt tự nhiên, chuẩn xác..."
                        placeholderTextColor={colors.textMuted}
                        style={styles.input}
                        value={seg.vietnameseText}
                      />
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>

            {/* Modal Footer Publish Bar */}
            {reviewVideo ? (
              <View style={styles.modalFooter}>
                <View style={{ flex: 1 }}>
                  {reviewVideo.published ? (
                    <Text style={styles.readyText}>
                      ✓ Video này đang hiển thị trên Thư viện Video của học viên.
                    </Text>
                  ) : reviewVideo.readyToPublish ? (
                    <Text style={styles.readyText}>
                      ✓ Tất cả điều kiện kiểm duyệt đã đạt. Có thể Xuất bản ngay!
                    </Text>
                  ) : (
                    <Text style={styles.blockerText}>
                      Chưa thể xuất bản: {(reviewVideo.publishBlockers ?? []).join(' ')}
                    </Text>
                  )}
                </View>
                {!reviewVideo.published ? (
                  <Pressable
                    disabled={working || !reviewVideo.readyToPublish}
                    onPress={() => void handleWorkflowAction('publish', reviewVideo)}
                    style={[
                      styles.successBtn,
                      (!reviewVideo.readyToPublish || working) && { opacity: 0.45 },
                    ]}
                  >
                    <Ionicons color="#FFFFFF" name="rocket-outline" size={16} />
                    <Text style={styles.primaryBtnText}>Xuất bản lên Thư viện Học viên</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    disabled={working}
                    onPress={() => void handleWorkflowAction('unpublish', reviewVideo)}
                    style={styles.warningBtn}
                  >
                    <Text style={styles.primaryBtnText}>Gỡ xuất bản</Text>
                  </Pressable>
                )}
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  errorBanner: {
    backgroundColor: colors.dangerSoft,
    borderColor: '#FECACA',
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
    padding: spacing.sm,
  },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  kpiCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    minWidth: 180,
    padding: spacing.md,
  },
  kpiValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  kpiLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  subCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  cardHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16.5,
    fontWeight: '800',
  },
  cardSubtitle: {
    color: colors.textMuted,
    fontSize: 12.5,
    marginTop: 2,
  },
  sectionHeading: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  fieldWide: {
    flexBasis: '100%',
    gap: 4,
  },
  fieldHalf: {
    flex: 1,
    gap: 4,
    minWidth: 240,
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: 13.5,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  textarea: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  inlineChoiceRow: {
    alignItems: 'center',
    flexBasis: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  pillChip: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  pillChipText: {
    color: colors.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  pillChipTextActive: {
    color: colors.primaryDark,
    fontWeight: '800',
  },
  submitRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  primaryBtn: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  successBtn: {
    alignItems: 'center',
    backgroundColor: colors.success,
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  warningBtn: {
    alignItems: 'center',
    backgroundColor: colors.warning,
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  primaryBtnText: {
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryBtn: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryBtnText: {
    color: colors.primaryDark,
    fontSize: 12.5,
    fontWeight: '700',
  },
  dangerOutlineBtn: {
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderColor: '#FECACA',
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dangerOutlineText: {
    color: colors.danger,
    fontSize: 12.5,
    fontWeight: '700',
  },
  toolbarRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  filterPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  searchActionsWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  subtleText: {
    color: colors.textMuted,
    fontSize: 12.5,
    lineHeight: 18,
  },
  videoList: {
    gap: spacing.sm,
  },
  videoItemCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  videoTopRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  thumbImg: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    height: 100,
    width: 176,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoInfoCol: {
    flex: 1,
    gap: 5,
    minWidth: 260,
  },
  badgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusBadge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  metaTag: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  videoTitleText: {
    color: colors.text,
    fontSize: 15.5,
    fontWeight: '800',
  },
  urlHintText: {
    color: colors.primary,
    fontSize: 12,
  },
  jobBox: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: 4,
    marginTop: 4,
    padding: 10,
  },
  jobTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  jobStatusLabel: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
  },
  jobStatsText: {
    color: colors.textMuted,
    fontSize: 11.5,
    fontWeight: '700',
  },
  progressTrack: {
    backgroundColor: colors.backgroundStrong,
    borderRadius: radius.pill,
    height: 7,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: colors.primary,
    height: '100%',
  },
  blockerBox: {
    backgroundColor: colors.warningSoft,
    borderColor: '#FDE68A',
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: 2,
    marginTop: 4,
    padding: 8,
  },
  blockerTitle: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '800',
  },
  blockerText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  readyText: {
    color: colors.success,
    fontSize: 12.5,
    fontWeight: '800',
    marginTop: 2,
  },
  actionRow: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 10,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    maxHeight: '92%',
    maxWidth: 1040,
    padding: spacing.lg,
    width: '100%',
  },
  modalHeader: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
  },
  modalScroll: {
    maxHeight: 560,
  },
  modalFooter: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
  },
  segmentEditCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: 6,
    padding: 10,
  },
  segmentTimeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  segmentIndexLabel: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
  timeFieldWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  timeInput: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 12.5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: 72,
  },
});
