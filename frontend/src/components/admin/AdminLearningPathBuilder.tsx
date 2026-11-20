import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radius, spacing } from '@/src/assets/styles/theme';
import {
  AdminLearningPathOverviewItem,
  AdminMilestoneModuleLinkNode,
  AdminMilestoneNodeItem,
  CreateLearningModuleRequest,
  CreateLearningPathMilestoneRequest,
  CreateLearningPathRequest,
  CreateMilestoneModuleRequest,
  CreateMilestoneQuickModuleRequest,
  LearningModuleApiItem,
  UpdateLearningModuleRequest,
  UpdateLearningPathMilestoneRequest,
  UpdateLearningPathRequest,
  UpdateMilestoneModuleRequest,
} from '@/src/types/admin-api';
import { confirmWeb } from '@/src/utils/web-dialog';

const PRESET_SCORES = [300, 450, 500, 600, 650, 750, 800, 900] as const;
const DURATION_PRESETS = [15, 30, 45, 60] as const;
const DIFFICULTY_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;

const MODULE_TYPE_META: Record<
  string,
  { label: string; bg: string; fg: string; border: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  VOCABULARY: { label: 'Từ vựng', bg: '#FDF2F8', fg: '#DB2777', border: '#FBCFE8', icon: 'albums-outline' },
  VIDEO: { label: 'Video bài giảng', bg: '#EFF6FF', fg: '#2563EB', border: '#BFDBFE', icon: 'videocam-outline' },
  PRACTICE: { label: 'Luyện tập', bg: '#ECFDF5', fg: '#059669', border: '#A7F3D0', icon: 'checkbox-outline' },
  GRAMMAR: { label: 'Ngữ pháp', bg: '#F5F3FF', fg: '#7C3AED', border: '#DDD6FE', icon: 'book-outline' },
  MOCK_TEST: { label: 'Đề thi thử', bg: '#FFFBEB', fg: '#D97706', border: '#FDE68A', icon: 'document-text-outline' },
  TIPS: { label: 'Mẹo thi', bg: '#ECFEFF', fg: '#0891B2', border: '#A5F3FC', icon: 'bulb-outline' },
};

function getModuleMeta(type?: string | null) {
  const key = (type || 'VOCABULARY').toUpperCase();
  return MODULE_TYPE_META[key] ?? {
    label: key,
    bg: colors.surfaceAlt,
    fg: colors.textSecondary,
    border: colors.borderStrong,
    icon: 'layers-outline' as const,
  };
}

type BuilderProps = {
  overviews: AdminLearningPathOverviewItem[];
  modules: LearningModuleApiItem[];
  selectedPathId: number | null;
  onSelectPathId: (id: number) => void;
  loading: boolean;
  working: boolean;
  onCreatePath: (payload: CreateLearningPathRequest) => Promise<void>;
  onUpdatePath: (pathId: number, payload: UpdateLearningPathRequest) => Promise<void>;
  onDeletePath: (pathId: number) => Promise<void>;
  onCreateMilestone: (pathId: number, payload: CreateLearningPathMilestoneRequest) => Promise<void>;
  onUpdateMilestone: (pathId: number, milestoneId: number, payload: UpdateLearningPathMilestoneRequest) => Promise<void>;
  onDeleteMilestone: (pathId: number, milestoneId: number) => Promise<void>;
  onCreateQuickModule: (milestoneId: number, payload: CreateMilestoneQuickModuleRequest) => Promise<void>;
  onLinkExistingModule: (milestoneId: number, payload: CreateMilestoneModuleRequest) => Promise<void>;
  onUpdateModuleLink: (milestoneId: number, linkId: number, payload: UpdateMilestoneModuleRequest) => Promise<void>;
  onUnlinkModule: (milestoneId: number, linkId: number) => Promise<void>;
  onCreateStandaloneModule: (payload: CreateLearningModuleRequest) => Promise<void>;
  onUpdateStandaloneModule: (moduleId: number, payload: UpdateLearningModuleRequest) => Promise<void>;
  onDeleteStandaloneModule: (moduleId: number) => Promise<void>;
  onOpenModuleContent: (moduleId: number, moduleType?: string) => void;
  onRefresh: () => Promise<void>;
};

function formatModuleContentSummary(link: AdminMilestoneModuleLinkNode): string | null {
  const parts: string[] = [];
  if ((link.flashcardCount ?? 0) > 0) parts.push(`${link.flashcardCount} thẻ từ`);
  if ((link.videoLessonCount ?? 0) > 0) parts.push(`${link.videoLessonCount} video`);
  if ((link.practiceSetCount ?? 0) > 0) parts.push(`${link.practiceSetCount} bộ đề`);
  return parts.length > 0 ? `Đã soạn: ${parts.join(' • ')}` : null;
}

export default function AdminLearningPathBuilder(props: BuilderProps) {
  const { overviews, modules, selectedPathId, onSelectPathId, loading, working } = props;

  const [subTab, setSubTab] = useState<'tree' | 'library'>('tree');
  const [showGuide, setShowGuide] = useState(false);
  const [collapsedMsMap, setCollapsedMsMap] = useState<Record<number, boolean>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Path Modal State
  const [pathModalVisible, setPathModalVisible] = useState(false);
  const [editingPath, setEditingPath] = useState<AdminLearningPathOverviewItem | null>(null);
  const [pathCode, setPathCode] = useState('');
  const [pathTitle, setPathTitle] = useState('');
  const [pathScore, setPathScore] = useState('500');
  const [pathDesc, setPathDesc] = useState('');
  const [pathActive, setPathActive] = useState(true);

  // Milestone Modal State
  const [msModalVisible, setMsModalVisible] = useState(false);
  const [editingMs, setEditingMs] = useState<AdminMilestoneNodeItem | null>(null);
  const [msTitle, setMsTitle] = useState('');
  const [msOrder, setMsOrder] = useState('1');
  const [msDesc, setMsDesc] = useState('');

  // Quick Create & Link Module Modal State
  const [quickMsTarget, setQuickMsTarget] = useState<AdminMilestoneNodeItem | null>(null);
  const [quickType, setQuickType] = useState('VOCABULARY');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickMinutes, setQuickMinutes] = useState('30');
  const [quickDiff, setQuickDiff] = useState('BEGINNER');
  const [quickDesc, setQuickDesc] = useState('');
  const [quickOrder, setQuickOrder] = useState('1');
  const [quickRequired, setQuickRequired] = useState(true);
  const [quickUnlock, setQuickUnlock] = useState('NONE');

  // Attach Existing Module Modal State
  const [attachMsTarget, setAttachMsTarget] = useState<AdminMilestoneNodeItem | null>(null);
  const [attachModuleId, setAttachModuleId] = useState<number | null>(null);
  const [attachOrder, setAttachOrder] = useState('1');
  const [attachRequired, setAttachRequired] = useState(true);

  // Edit Link Modal State
  const [editLinkTarget, setEditLinkTarget] = useState<AdminMilestoneModuleLinkNode | null>(null);
  const [editLinkOrder, setEditLinkOrder] = useState('1');
  const [editLinkRequired, setEditLinkRequired] = useState(true);
  const [editLinkUnlock, setEditLinkUnlock] = useState('NONE');

  // Standalone Library Module Modal State
  const [libModalVisible, setLibModalVisible] = useState(false);
  const [editingLibModule, setEditingLibModule] = useState<LearningModuleApiItem | null>(null);
  const [libType, setLibType] = useState('VOCABULARY');
  const [libTitle, setLibTitle] = useState('');
  const [libMinutes, setLibMinutes] = useState('30');
  const [libDiff, setLibDiff] = useState('BEGINNER');
  const [libDesc, setLibDesc] = useState('');
  const [libActive, setLibActive] = useState(true);

  const selectedOverview = useMemo(
    () => overviews.find((p) => p.id === selectedPathId) ?? overviews[0] ?? null,
    [overviews, selectedPathId]
  );

  // Map which paths/milestones reference each module ID for clarity in Library mode
  const moduleUsageMap = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const p of overviews) {
      for (const ms of p.milestones ?? []) {
        for (const link of ms.modules ?? []) {
          const list = map.get(link.moduleId) ?? [];
          list.push(`${p.targetScore}+ (${p.code}) › Chặng ${ms.sortOrder}`);
          map.set(link.moduleId, list);
        }
      }
    }
    return map;
  }, [overviews]);

  const openPathModal = (item?: AdminLearningPathOverviewItem) => {
    setFormError(null);
    setEditingPath(item ?? null);
    setPathCode(item?.code ?? '');
    setPathTitle(item?.title ?? '');
    setPathScore(String(item?.targetScore ?? 500));
    setPathDesc(item?.description ?? '');
    setPathActive(item?.active ?? true);
    setPathModalVisible(true);
  };

  const applyPresetScore = (score: number) => {
    setPathScore(String(score));
    if (!editingPath) {
      if (!pathCode.trim() || /^T\d+$/.test(pathCode.trim())) {
        setPathCode(`T${score}`);
      }
      if (!pathTitle.trim() || /^TOEIC Mục tiêu \d+\+?$/i.test(pathTitle.trim())) {
        setPathTitle(`TOEIC Mục tiêu ${score}+`);
      }
    }
  };

  const submitPathModal = async () => {
    const code = pathCode.trim().toUpperCase();
    const title = pathTitle.trim();
    const score = Number(pathScore);
    if (!code || !title || !Number.isFinite(score) || score < 10 || score > 990) {
      setFormError('Vui lòng nhập Mã lộ trình, Tên lộ trình và Điểm mục tiêu hợp lệ (10–990).');
      return;
    }
    try {
      setFormError(null);
      if (editingPath) {
        await props.onUpdatePath(editingPath.id, {
          code,
          title,
          targetScore: Math.floor(score),
          description: pathDesc.trim() || null,
          active: pathActive,
        });
      } else {
        await props.onCreatePath({
          code,
          title,
          targetScore: Math.floor(score),
          description: pathDesc.trim() || null,
          active: pathActive,
        });
      }
      setPathModalVisible(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không thể lưu lộ trình.');
    }
  };

  const openMilestoneModal = (item?: AdminMilestoneNodeItem) => {
    if (!selectedOverview) return;
    setFormError(null);
    setEditingMs(item ?? null);
    setMsTitle(item?.title ?? '');
    setMsOrder(String(item?.sortOrder ?? (selectedOverview.milestones?.length ?? 0) + 1));
    setMsDesc(item?.description ?? '');
    setMsModalVisible(true);
  };

  const submitMilestoneModal = async () => {
    if (!selectedOverview) return;
    const title = msTitle.trim();
    const sortOrder = Math.max(1, Math.floor(Number(msOrder) || 1));
    if (!title) {
      setFormError('Vui lòng nhập tên Chặng học.');
      return;
    }
    try {
      setFormError(null);
      if (editingMs) {
        await props.onUpdateMilestone(selectedOverview.id, editingMs.id, {
          title,
          sortOrder,
          description: msDesc.trim() || null,
        });
      } else {
        await props.onCreateMilestone(selectedOverview.id, {
          title,
          sortOrder,
          description: msDesc.trim() || null,
        });
      }
      setMsModalVisible(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không thể lưu chặng học.');
    }
  };

  const openQuickModuleModal = (ms: AdminMilestoneNodeItem) => {
    setFormError(null);
    setQuickMsTarget(ms);
    setQuickType('VOCABULARY');
    setQuickTitle('');
    setQuickMinutes('30');
    setQuickDiff('BEGINNER');
    setQuickDesc('');
    setQuickOrder(String((ms.modules?.length ?? 0) + 1));
    setQuickRequired(true);
    setQuickUnlock('NONE');
  };

  const submitQuickModule = async () => {
    if (!quickMsTarget) return;
    const title = quickTitle.trim();
    const mins = Math.max(1, Math.floor(Number(quickMinutes) || 30));
    const order = Math.max(1, Math.floor(Number(quickOrder) || 1));
    if (!title) {
      setFormError('Vui lòng nhập tên Mô-đun bài học.');
      return;
    }
    try {
      setFormError(null);
      await props.onCreateQuickModule(quickMsTarget.id, {
        moduleType: quickType,
        title,
        estimatedMinutes: mins,
        difficultyLevel: quickDiff,
        description: quickDesc.trim() || null,
        active: true,
        sortOrder: order,
        required: quickRequired,
        unlockCondition: quickUnlock,
      });
      setQuickMsTarget(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không thể tạo và gắn mô-đun.');
    }
  };

  const openAttachModal = (ms: AdminMilestoneNodeItem) => {
    setFormError(null);
    setAttachMsTarget(ms);
    const linkedIds = new Set((ms.modules ?? []).map((m) => m.moduleId));
    const firstAvailable = modules.find((m) => !linkedIds.has(m.id)) ?? null;
    setAttachModuleId(firstAvailable?.id ?? null);
    setAttachOrder(String((ms.modules?.length ?? 0) + 1));
    setAttachRequired(true);
  };

  const submitAttachExisting = async () => {
    if (!attachMsTarget || !attachModuleId) {
      setFormError('Vui lòng chọn một Mô-đun có sẵn để gắn.');
      return;
    }
    try {
      setFormError(null);
      await props.onLinkExistingModule(attachMsTarget.id, {
        moduleId: attachModuleId,
        sortOrder: Math.max(1, Math.floor(Number(attachOrder) || 1)),
        required: attachRequired,
        unlockCondition: 'NONE',
      });
      setAttachMsTarget(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không thể gắn mô-đun vào chặng.');
    }
  };

  const openEditLinkModal = (link: AdminMilestoneModuleLinkNode) => {
    setFormError(null);
    setEditLinkTarget(link);
    setEditLinkOrder(String(link.sortOrder));
    setEditLinkRequired(Boolean(link.required));
    setEditLinkUnlock(link.unlockCondition || 'NONE');
  };

  const submitEditLink = async () => {
    if (!editLinkTarget) return;
    try {
      setFormError(null);
      await props.onUpdateModuleLink(editLinkTarget.milestoneId, editLinkTarget.milestoneModuleId, {
        sortOrder: Math.max(1, Math.floor(Number(editLinkOrder) || 1)),
        required: editLinkRequired,
        unlockCondition: editLinkUnlock.trim() || null,
      });
      setEditLinkTarget(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không thể cập nhật thiết lập mô-đun.');
    }
  };

  const openLibModal = (mod?: LearningModuleApiItem) => {
    setFormError(null);
    setEditingLibModule(mod ?? null);
    setLibType(mod?.moduleType ?? 'VOCABULARY');
    setLibTitle(mod?.title ?? '');
    setLibMinutes(String(mod?.estimatedMinutes ?? 30));
    setLibDiff(mod?.difficultyLevel ?? 'BEGINNER');
    setLibDesc(mod?.description ?? '');
    setLibActive(mod?.active ?? true);
    setLibModalVisible(true);
  };

  const submitLibModal = async () => {
    const title = libTitle.trim();
    const mins = Math.max(1, Math.floor(Number(libMinutes) || 30));
    if (!title) {
      setFormError('Vui lòng nhập tên Mô-đun.');
      return;
    }
    try {
      setFormError(null);
      if (editingLibModule) {
        await props.onUpdateStandaloneModule(editingLibModule.id, {
          moduleType: libType,
          title,
          estimatedMinutes: mins,
          difficultyLevel: libDiff,
          description: libDesc.trim() || null,
          active: libActive,
        });
      } else {
        await props.onCreateStandaloneModule({
          moduleType: libType,
          title,
          estimatedMinutes: mins,
          difficultyLevel: libDiff,
          description: libDesc.trim() || null,
          active: libActive,
        });
      }
      setLibModalVisible(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không thể lưu mô-đun.');
    }
  };

  const toggleMilestoneCollapse = (msId: number) => {
    setCollapsedMsMap((prev) => ({ ...prev, [msId]: !prev[msId] }));
  };

  const selectedMilestones = selectedOverview?.milestones ?? [];
  const allMilestonesCollapsed =
    selectedMilestones.length > 0 && selectedMilestones.every((ms) => Boolean(collapsedMsMap[ms.id]));

  const toggleAllMilestones = () => {
    const nextValue = !allMilestonesCollapsed;
    const nextMap: Record<number, boolean> = {};
    for (const ms of selectedMilestones) {
      nextMap[ms.id] = nextValue;
    }
    setCollapsedMsMap((prev) => ({ ...prev, ...nextMap }));
  };

  const moveModuleOrder = async (
    ms: AdminMilestoneNodeItem,
    index: number,
    direction: -1 | 1,
  ) => {
    const list = ms.modules ?? [];
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const current = list[index];
    const neighbor = list[targetIdx];
    const currentOrder = current.sortOrder || index + 1;
    const neighborOrder = neighbor.sortOrder || targetIdx + 1;
    const nextCurrentOrder = currentOrder === neighborOrder ? targetIdx + 1 : neighborOrder;
    const nextNeighborOrder = currentOrder === neighborOrder ? index + 1 : currentOrder;

    await props.onUpdateModuleLink(current.milestoneId, current.milestoneModuleId, {
      sortOrder: Math.max(1, nextCurrentOrder),
    });
    await props.onUpdateModuleLink(neighbor.milestoneId, neighbor.milestoneModuleId, {
      sortOrder: Math.max(1, nextNeighborOrder),
    });
  };

  return (
    <View style={styles.root}>
      {/* Compact Header & Optional Collapsible Guide */}
      <View style={styles.stepperCard}>
        <View style={styles.stepperTopRow}>
          <View style={{ flex: 1, minWidth: 240 }}>
            <Text style={styles.stepperTitle}>Thiết kế Lộ trình học TOEIC</Text>
            <Text style={styles.stepperSub}>
              1. Chọn Lộ trình mục tiêu → 2. Tạo Chặng → 3. Thêm & Soạn Mô-đun bài học
            </Text>
          </View>
          <View style={styles.modeSwitchRow}>
            <Pressable
              onPress={() => setSubTab('tree')}
              style={[styles.modeTab, subTab === 'tree' && styles.modeTabActive]}
            >
              <Text style={[styles.modeTabText, subTab === 'tree' && styles.modeTabTextActive]}>
                Cây Lộ trình ({overviews.length})
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSubTab('library')}
              style={[styles.modeTab, subTab === 'library' && styles.modeTabActive]}
            >
              <Text style={[styles.modeTabText, subTab === 'library' && styles.modeTabTextActive]}>
                Kho Mô-đun ({modules.length})
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowGuide((prev) => !prev)}
              style={[styles.guideToggleBtn, showGuide && styles.guideToggleBtnActive]}
            >
              <Ionicons
                color={showGuide ? colors.primaryDark : colors.textSecondary}
                name="help-circle-outline"
                size={15}
              />
              <Text style={[styles.guideToggleText, showGuide && styles.guideToggleTextActive]}>
                Hướng dẫn
              </Text>
            </Pressable>
            <Pressable onPress={() => void props.onRefresh()} style={styles.iconActionBtn}>
              <Ionicons color={colors.textSecondary} name="refresh-outline" size={16} />
            </Pressable>
          </View>
        </View>

        {showGuide ? (
          <View style={styles.stepsStrip}>
            {[
              '① Tạo Lộ trình (300+ → 900+)',
              '② Chia Chặng (Milestones)',
              '③ Tạo hoặc Gắn Mô-đun trong Chặng',
              '④ Bấm "Soạn nội dung →" thêm Thẻ từ / Video / Đề',
            ].map((lbl, idx) => (
              <View key={lbl} style={styles.stepChip}>
                <Text style={styles.stepChipText}>{lbl}</Text>
                {idx < 3 ? <Ionicons color={colors.textMuted} name="chevron-forward" size={13} /> : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {loading && overviews.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.mutedText}>Đang tải cấu trúc lộ trình...</Text>
        </View>
      ) : subTab === 'tree' ? (
        <View style={styles.splitGrid}>
          {/* LEFT COLUMN: CLEAN TARGET SCORE LEARNING PATHS */}
          <View style={styles.leftColumn}>
            <View style={styles.colHeaderRow}>
              <Text style={styles.colTitle}>1. Lộ trình Mục tiêu ({overviews.length})</Text>
              <Pressable onPress={() => openPathModal()} style={styles.primarySmBtn}>
                <Ionicons color="#FFFFFF" name="add" size={15} />
                <Text style={styles.primarySmText}>Thêm mới</Text>
              </Pressable>
            </View>

            <View style={styles.pathCardList}>
              {overviews.map((p) => {
                const isSelected = selectedOverview?.id === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => onSelectPathId(p.id)}
                    style={[styles.pathCard, isSelected && styles.pathCardSelected]}
                  >
                    <View style={styles.pathCardTop}>
                      <View style={[styles.scoreBadge, isSelected && styles.scoreBadgeSelected]}>
                        <Text style={[styles.scoreBadgeText, isSelected && styles.scoreBadgeTextSelected]}>
                          {p.targetScore}+
                        </Text>
                      </View>
                      <Text style={styles.pathCode}>{p.code}</Text>
                      <View
                        style={[
                          styles.statusPill,
                          p.active ? styles.statusPillOn : styles.statusPillOff,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            p.active ? styles.statusPillOnText : styles.statusPillOffText,
                          ]}
                        >
                          {p.active ? 'Đang bật' : 'Đang ẩn'}
                        </Text>
                      </View>
                    </View>

                    <Text numberOfLines={2} style={styles.pathCardTitle}>
                      {p.title}
                    </Text>

                    <View style={styles.pathMetaFooterRow}>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={styles.pathMetaStat}>
                          {p.milestoneCount} chặng • {p.moduleCount} bài • {p.estimatedTotalMinutes}p
                        </Text>
                        {p.active && !p.readyForUsers ? (
                          <View style={styles.emptyTagPill}>
                            <Text style={styles.emptyTagText}>Chưa có bài</Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.compactIconGroup}>
                        <Pressable
                          accessibilityLabel={`Sửa lộ trình ${p.title}`}
                          onPress={() => openPathModal(p)}
                          style={styles.ghostIconBtn}
                        >
                          <Ionicons color={colors.primaryDark} name="create-outline" size={14} />
                        </Pressable>
                        <Pressable
                          accessibilityLabel={p.active ? 'Ẩn lộ trình' : 'Bật lộ trình'}
                          onPress={() => void props.onUpdatePath(p.id, { active: !p.active })}
                          style={styles.ghostIconBtn}
                        >
                          <Ionicons
                            color={colors.textSecondary}
                            name={p.active ? 'eye-off-outline' : 'eye-outline'}
                            size={14}
                          />
                        </Pressable>
                        <Pressable
                          accessibilityLabel={`Xóa lộ trình ${p.title}`}
                          onPress={() => {
                            if (confirmWeb(`Xóa lộ trình "${p.title}" (${p.targetScore}+)?`)) {
                              void props.onDeletePath(p.id);
                            }
                          }}
                          style={styles.ghostIconBtn}
                        >
                          <Ionicons color={colors.danger} name="trash-outline" size={14} />
                        </Pressable>
                      </View>
                    </View>
                  </Pressable>
                );
              })}

              {overviews.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyTitle}>Chưa có lộ trình nào</Text>
                  <Text style={styles.mutedText}>Nhấn “Thêm mới” để tạo mốc điểm 300+, 600+, 800+.</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* RIGHT COLUMN: COLLAPSIBLE MILESTONES & CLEAR MODULE LIST */}
          <View style={styles.rightColumn}>
            {selectedOverview ? (
              <>
                <View style={styles.detailHero}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.badgeLine}>
                      <View style={styles.scoreBadgeSelected}>
                        <Text style={styles.scoreBadgeTextSelected}>Mục tiêu {selectedOverview.targetScore}+ TOEIC</Text>
                      </View>
                      <Text style={styles.pathCode}>{selectedOverview.code}</Text>
                      <Text style={styles.mutedText}>
                        • {selectedOverview.milestoneCount} chặng • {selectedOverview.moduleCount} bài học
                      </Text>
                    </View>
                    <Text style={styles.detailHeroTitle}>{selectedOverview.title}</Text>
                    {selectedOverview.description ? (
                      <Text style={styles.mutedText}>{selectedOverview.description}</Text>
                    ) : null}
                  </View>

                  <View style={styles.heroActionGroup}>
                    {selectedMilestones.length > 1 ? (
                      <Pressable onPress={toggleAllMilestones} style={styles.secondarySmBtn}>
                        <Ionicons
                          color={colors.textSecondary}
                          name={allMilestonesCollapsed ? 'expand-outline' : 'contract-outline'}
                          size={14}
                        />
                        <Text style={styles.secondarySmText}>
                          {allMilestonesCollapsed ? 'Mở tất cả' : 'Thu gọn'}
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => openMilestoneModal()} style={styles.primaryBtn}>
                      <Ionicons color="#FFFFFF" name="add" size={16} />
                      <Text style={styles.primaryBtnText}>Thêm Chặng</Text>
                    </Pressable>
                  </View>
                </View>

                {selectedMilestones.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Ionicons color={colors.primary} name="flag-outline" size={32} />
                    <Text style={styles.emptyTitle}>
                      Lộ trình “{selectedOverview.title}” chưa có Chặng học nào
                    </Text>
                    <Text style={styles.mutedText}>
                      Hãy chia lộ trình thành các Chặng (VD: Chặng 1 Nền tảng Từ vựng & Ngữ pháp, Chặng 2 Luyện nghe Part 1–4...).
                    </Text>
                    <Pressable onPress={() => openMilestoneModal()} style={styles.primaryBtn}>
                      <Text style={styles.primaryBtnText}>+ Tạo Chặng 1 ngay</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.milestoneStack}>
                    {selectedMilestones.map((ms) => {
                      const msModules = ms.modules ?? [];
                      const isCollapsed = Boolean(collapsedMsMap[ms.id]);
                      return (
                        <View key={ms.id} style={styles.msCard}>
                          <View style={styles.msHeader}>
                            <Pressable
                              onPress={() => toggleMilestoneCollapse(ms.id)}
                              style={styles.msTitleTrigger}
                            >
                              <Ionicons
                                color={colors.textSecondary}
                                name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
                                size={17}
                              />
                              <View style={{ flex: 1, gap: 2 }}>
                                <View style={styles.badgeLine}>
                                  <View style={styles.msOrderPill}>
                                    <Text style={styles.msOrderText}>Chặng {ms.sortOrder}</Text>
                                  </View>
                                  <Text style={styles.msTitle}>{ms.title}</Text>
                                  <View style={styles.msCountPill}>
                                    <Text style={styles.msCountText}>{msModules.length} bài học</Text>
                                  </View>
                                </View>
                                {!isCollapsed && ms.description ? (
                                  <Text style={styles.mutedText}>{ms.description}</Text>
                                ) : null}
                              </View>
                            </Pressable>

                            <View style={styles.compactIconGroup}>
                              <Pressable
                                accessibilityLabel={`Sửa chặng ${ms.title}`}
                                onPress={() => openMilestoneModal(ms)}
                                style={styles.iconActionBtn}
                              >
                                <Ionicons color={colors.primaryDark} name="create-outline" size={15} />
                              </Pressable>
                              <Pressable
                                accessibilityLabel={`Xóa chặng ${ms.title}`}
                                onPress={() => {
                                  if (confirmWeb(`Xóa chặng "${ms.title}"?`)) {
                                    void props.onDeleteMilestone(selectedOverview.id, ms.id);
                                  }
                                }}
                                style={[styles.iconActionBtn, { borderColor: '#FECACA' }]}
                              >
                                <Ionicons color={colors.danger} name="trash-outline" size={15} />
                              </Pressable>
                            </View>
                          </View>

                          {!isCollapsed ? (
                            <>
                              {msModules.length === 0 ? (
                                <View style={styles.msEmptyStrip}>
                                  <Text style={styles.mutedText}>
                                    Chặng này chưa có mô-đun bài học nào. Dùng 2 nút bên dưới để thêm mới hoặc gắn từ kho.
                                  </Text>
                                </View>
                              ) : (
                                <View style={styles.moduleLinkList}>
                                  {msModules.map((link, modIndex) => {
                                    const meta = getModuleMeta(link.moduleType);
                                    const contentSummary = formatModuleContentSummary(link);
                                    return (
                                      <View key={link.milestoneModuleId} style={styles.moduleLinkRow}>
                                        <View style={styles.orderControlCol}>
                                          <View style={styles.stepBubble}>
                                            <Text style={styles.stepBubbleText}>{link.sortOrder}</Text>
                                          </View>
                                          {msModules.length > 1 ? (
                                            <View style={styles.reorderMiniRow}>
                                              <Pressable
                                                disabled={working || modIndex === 0}
                                                onPress={() => void moveModuleOrder(ms, modIndex, -1)}
                                                style={[
                                                  styles.reorderMiniBtn,
                                                  modIndex === 0 && { opacity: 0.3 },
                                                ]}
                                              >
                                                <Ionicons color={colors.textSecondary} name="chevron-up" size={11} />
                                              </Pressable>
                                              <Pressable
                                                disabled={working || modIndex === msModules.length - 1}
                                                onPress={() => void moveModuleOrder(ms, modIndex, 1)}
                                                style={[
                                                  styles.reorderMiniBtn,
                                                  modIndex === msModules.length - 1 && { opacity: 0.3 },
                                                ]}
                                              >
                                                <Ionicons color={colors.textSecondary} name="chevron-down" size={11} />
                                              </Pressable>
                                            </View>
                                          ) : null}
                                        </View>

                                        <View style={{ flex: 1, gap: 4, minWidth: 200 }}>
                                          <View style={styles.badgeLine}>
                                            <View
                                              style={[
                                                styles.typePill,
                                                { backgroundColor: meta.bg, borderColor: meta.border },
                                              ]}
                                            >
                                              <Ionicons color={meta.fg} name={meta.icon} size={12} />
                                              <Text style={[styles.typePillText, { color: meta.fg }]}>
                                                {meta.label}
                                              </Text>
                                            </View>
                                            <Text style={styles.modLinkTitle}>
                                              #{link.moduleId} • {link.moduleTitle}
                                            </Text>
                                          </View>

                                          <View style={styles.badgeLine}>
                                            <Text style={styles.mutedText}>
                                              {link.estimatedMinutes ?? 0} phút • {link.required ? 'Bắt buộc' : 'Tùy chọn'}
                                            </Text>
                                            {contentSummary ? (
                                              <Text style={styles.resourceSummaryText}>• {contentSummary}</Text>
                                            ) : (
                                              <View style={styles.emptyTagPill}>
                                                <Text style={styles.emptyTagText}>Chưa có nội dung</Text>
                                              </View>
                                            )}
                                          </View>
                                        </View>

                                        <View style={styles.rowRightActions}>
                                          <Pressable
                                            onPress={() => props.onOpenModuleContent(link.moduleId, link.moduleType ?? undefined)}
                                            style={styles.contentCtaBtn}
                                          >
                                            <Text style={styles.contentCtaText}>Soạn nội dung</Text>
                                            <Ionicons color={colors.primaryDark} name="arrow-forward" size={14} />
                                          </Pressable>
                                          <Pressable
                                            accessibilityLabel="Thiết lập thứ tự và mở khóa"
                                            onPress={() => openEditLinkModal(link)}
                                            style={styles.iconActionBtn}
                                          >
                                            <Ionicons color={colors.textSecondary} name="options-outline" size={15} />
                                          </Pressable>
                                          <Pressable
                                            accessibilityLabel="Gỡ mô-đun khỏi chặng"
                                            onPress={() => {
                                              if (
                                                confirmWeb(
                                                  `Gỡ mô-đun "${link.moduleTitle}" khỏi "${ms.title}"?`
                                                )
                                              ) {
                                                void props.onUnlinkModule(ms.id, link.milestoneModuleId);
                                              }
                                            }}
                                            style={[styles.iconActionBtn, { borderColor: '#FECACA' }]}
                                          >
                                            <Ionicons color={colors.danger} name="unlink-outline" size={15} />
                                          </Pressable>
                                        </View>
                                      </View>
                                    );
                                  })}
                                </View>
                              )}

                              <View style={styles.msFooterActions}>
                                <Pressable
                                  onPress={() => openQuickModuleModal(ms)}
                                  style={styles.softPrimaryBtn}
                                >
                                  <Ionicons color={colors.primaryDark} name="add-circle-outline" size={15} />
                                  <Text style={styles.softPrimaryBtnText}>+ Tạo & Gắn Mô-đun mới</Text>
                                </Pressable>
                                <Pressable
                                  onPress={() => openAttachModal(ms)}
                                  style={styles.secondarySmBtn}
                                >
                                  <Ionicons color={colors.textSecondary} name="link-outline" size={14} />
                                  <Text style={styles.secondarySmText}>Gắn Mô-đun có sẵn</Text>
                                </Pressable>
                              </View>
                            </>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>Chọn hoặc tạo một Lộ trình mục tiêu ở cột bên trái</Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        /* SHARED MODULE LIBRARY MODE */
        <View style={styles.libraryContainer}>
          <View style={styles.colHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.colTitle}>Kho Mô-đun dùng chung ({modules.length})</Text>
              <Text style={styles.mutedText}>
                Một mô-đun có thể dùng lại ở nhiều Chặng/Mục tiêu khác nhau. Chuyển sang tab “Cây Lộ trình” để sắp xếp thứ tự học.
              </Text>
            </View>
            <Pressable onPress={() => openLibModal()} style={styles.primaryBtn}>
              <Ionicons color="#FFFFFF" name="add" size={16} />
              <Text style={styles.primaryBtnText}>Tạo Mô-đun mới</Text>
            </Pressable>
          </View>

          <View style={styles.moduleLinkList}>
            {modules.map((mod) => {
              const meta = getModuleMeta(mod.moduleType);
              const usages = moduleUsageMap.get(mod.id) ?? [];
              const visibleUsages = usages.slice(0, 2);
              const extraUsages = usages.length - visibleUsages.length;
              return (
                <View key={mod.id} style={styles.moduleLinkRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.badgeLine}>
                      <View style={[styles.typePill, { backgroundColor: meta.bg, borderColor: meta.border }]}>
                        <Ionicons color={meta.fg} name={meta.icon} size={12} />
                        <Text style={[styles.typePillText, { color: meta.fg }]}>{meta.label}</Text>
                      </View>
                      <Text style={styles.modLinkTitle}>
                        #{mod.id} • {mod.title}
                      </Text>
                      <Text style={styles.mutedText}>
                        {mod.estimatedMinutes} phút • {mod.difficultyLevel || 'BEGINNER'}
                      </Text>
                    </View>
                    <View style={styles.badgeLine}>
                      {usages.length > 0 ? (
                        <>
                          {visibleUsages.map((u) => (
                            <View key={u} style={styles.msCountPill}>
                              <Text style={styles.msCountText}>{u}</Text>
                            </View>
                          ))}
                          {extraUsages > 0 ? (
                            <Text style={styles.mutedText}>+{extraUsages} vị trí khác</Text>
                          ) : null}
                        </>
                      ) : (
                        <Text style={styles.mutedText}>Chưa gắn vào chặng/lộ trình nào</Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.rowRightActions}>
                    <Pressable
                      onPress={() => props.onOpenModuleContent(mod.id, mod.moduleType ?? undefined)}
                      style={styles.contentCtaBtn}
                    >
                      <Text style={styles.contentCtaText}>Soạn nội dung</Text>
                      <Ionicons color={colors.primaryDark} name="arrow-forward" size={14} />
                    </Pressable>
                    <Pressable onPress={() => openLibModal(mod)} style={styles.iconActionBtn}>
                      <Ionicons color={colors.primaryDark} name="create-outline" size={15} />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        if (confirmWeb(`Xóa vĩnh viễn mô-đun "${mod.title}" cùng nội dung bên trong?`)) {
                          void props.onDeleteStandaloneModule(mod.id);
                        }
                      }}
                      style={[styles.iconActionBtn, { borderColor: '#FECACA' }]}
                    >
                      <Ionicons color={colors.danger} name="trash-outline" size={15} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* MODAL 1: CREATE / EDIT LEARNING PATH */}
      <Modal animationType="fade" onRequestClose={() => setPathModalVisible(false)} transparent visible={pathModalVisible}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              {editingPath ? `Cập nhật Lộ trình #${editingPath.id}` : 'Tạo Lộ trình Mục tiêu TOEIC mới'}
            </Text>
            {formError ? <Text style={styles.modalError}>{formError}</Text> : null}

            <Text style={styles.fieldLabel}>Chọn nhanh mốc điểm TOEIC chuẩn:</Text>
            <View style={styles.chipWrap}>
              {PRESET_SCORES.map((sc) => {
                const active = Number(pathScore) === sc;
                return (
                  <Pressable
                    key={sc}
                    onPress={() => applyPresetScore(sc)}
                    style={[styles.choiceChip, active && styles.choiceChipActive]}
                  >
                    <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                      {sc}+
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.twoColRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.fieldLabel}>Mã lộ trình (Code) *</Text>
                <TextInput
                  autoCapitalize="characters"
                  onChangeText={setPathCode}
                  placeholder="VD: T600"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  value={pathCode}
                />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.fieldLabel}>Điểm mục tiêu (10–990) *</Text>
                <TextInput
                  keyboardType="numeric"
                  onChangeText={setPathScore}
                  placeholder="600"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  value={pathScore}
                />
              </View>
            </View>

            <View style={{ gap: 4 }}>
              <Text style={styles.fieldLabel}>Tên lộ trình hiển thị cho học viên *</Text>
              <TextInput
                onChangeText={setPathTitle}
                placeholder="VD: TOEIC Tăng tốc 600+"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                value={pathTitle}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={styles.fieldLabel}>Mô tả lộ trình</Text>
              <TextInput
                multiline
                numberOfLines={3}
                onChangeText={setPathDesc}
                placeholder="Mô tả đối tượng học viên và kỹ năng trọng tâm..."
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
                value={pathDesc}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.fieldLabel}>Hiển thị cho Học viên lựa chọn</Text>
              <Switch onValueChange={setPathActive} value={pathActive} />
            </View>

            <View style={styles.modalActions}>
              <Pressable onPress={() => setPathModalVisible(false)} style={styles.secondarySmBtn}>
                <Text style={styles.secondarySmText}>Hủy</Text>
              </Pressable>
              <Pressable disabled={working} onPress={() => void submitPathModal()} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>{working ? 'Đang lưu...' : 'Lưu Lộ trình'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: CREATE / EDIT MILESTONE */}
      <Modal animationType="fade" onRequestClose={() => setMsModalVisible(false)} transparent visible={msModalVisible}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              {editingMs ? `Sửa Chặng #${editingMs.sortOrder}` : `Thêm Chặng mới cho "${selectedOverview?.title}"`}
            </Text>
            {formError ? <Text style={styles.modalError}>{formError}</Text> : null}

            <View style={{ gap: 4 }}>
              <Text style={styles.fieldLabel}>Tên Chặng học *</Text>
              <TextInput
                onChangeText={setMsTitle}
                placeholder="VD: Chặng 1 - Xây nền Từ vựng & Ngữ pháp cốt lõi"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                value={msTitle}
              />
            </View>
            <View style={{ gap: 4 }}>
              <Text style={styles.fieldLabel}>Thứ tự chặng</Text>
              <TextInput
                keyboardType="numeric"
                onChangeText={setMsOrder}
                style={styles.input}
                value={msOrder}
              />
            </View>
            <View style={{ gap: 4 }}>
              <Text style={styles.fieldLabel}>Mô tả chặng</Text>
              <TextInput
                multiline
                numberOfLines={2}
                onChangeText={setMsDesc}
                placeholder="Mục tiêu hoàn thành của chặng này..."
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { minHeight: 62, textAlignVertical: 'top' }]}
                value={msDesc}
              />
            </View>

            <View style={styles.modalActions}>
              <Pressable onPress={() => setMsModalVisible(false)} style={styles.secondarySmBtn}>
                <Text style={styles.secondarySmText}>Hủy</Text>
              </Pressable>
              <Pressable disabled={working} onPress={() => void submitMilestoneModal()} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>{working ? 'Đang lưu...' : 'Lưu Chặng'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 3: QUICK CREATE & LINK MODULE DIRECTLY INTO MILESTONE */}
      <Modal animationType="fade" onRequestClose={() => setQuickMsTarget(null)} transparent visible={Boolean(quickMsTarget)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              Tạo & Gắn Mô-đun mới vào “{quickMsTarget?.title}”
            </Text>
            {formError ? <Text style={styles.modalError}>{formError}</Text> : null}

            <Text style={styles.fieldLabel}>Loại Mô-đun *</Text>
            <View style={styles.chipWrap}>
              {Object.keys(MODULE_TYPE_META).map((typeKey) => {
                const active = quickType === typeKey;
                const meta = getModuleMeta(typeKey);
                return (
                  <Pressable
                    key={typeKey}
                    onPress={() => setQuickType(typeKey)}
                    style={[styles.choiceChip, active && styles.choiceChipActive]}
                  >
                    <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                      {meta.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ gap: 4 }}>
              <Text style={styles.fieldLabel}>Tên Mô-đun bài học *</Text>
              <TextInput
                onChangeText={setQuickTitle}
                placeholder="VD: Từ vựng Văn phòng & Hợp đồng (Part 1–5)"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                value={quickTitle}
              />
            </View>

            <View style={styles.twoColRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.fieldLabel}>Thời lượng (phút)</Text>
                <View style={styles.chipWrap}>
                  {DURATION_PRESETS.map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => setQuickMinutes(String(m))}
                      style={[styles.choiceChip, Number(quickMinutes) === m && styles.choiceChipActive]}
                    >
                      <Text
                        style={[
                          styles.choiceChipText,
                          Number(quickMinutes) === m && styles.choiceChipTextActive,
                        ]}
                      >
                        {m}p
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput keyboardType="numeric" onChangeText={setQuickMinutes} style={styles.input} value={quickMinutes} />
              </View>

              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.fieldLabel}>Thứ tự trong Chặng</Text>
                <TextInput keyboardType="numeric" onChangeText={setQuickOrder} style={styles.input} value={quickOrder} />
                <Text style={styles.fieldLabel}>Độ khó</Text>
                <View style={styles.chipWrap}>
                  {DIFFICULTY_LEVELS.map((d) => (
                    <Pressable
                      key={d}
                      onPress={() => setQuickDiff(d)}
                      style={[styles.choiceChip, quickDiff === d && styles.choiceChipActive]}
                    >
                      <Text style={[styles.choiceChipText, quickDiff === d && styles.choiceChipTextActive]}>
                        {d}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <View style={{ gap: 4 }}>
              <Text style={styles.fieldLabel}>Mô tả ngắn</Text>
              <TextInput
                onChangeText={setQuickDesc}
                placeholder="Tóm tắt kiến thức học viên sẽ nắm được..."
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                value={quickDesc}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.fieldLabel}>Bắt buộc hoàn thành để qua chặng</Text>
              <Switch onValueChange={setQuickRequired} value={quickRequired} />
            </View>

            <View style={styles.modalActions}>
              <Pressable onPress={() => setQuickMsTarget(null)} style={styles.secondarySmBtn}>
                <Text style={styles.secondarySmText}>Hủy</Text>
              </Pressable>
              <Pressable disabled={working} onPress={() => void submitQuickModule()} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>{working ? 'Đang tạo...' : 'Tạo & Gắn vào Chặng'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 4: ATTACH EXISTING MODULE */}
      <Modal animationType="fade" onRequestClose={() => setAttachMsTarget(null)} transparent visible={Boolean(attachMsTarget)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Gắn Mô-đun có sẵn vào “{attachMsTarget?.title}”</Text>
            {formError ? <Text style={styles.modalError}>{formError}</Text> : null}

            <ScrollView style={{ maxHeight: 240 }} contentContainerStyle={{ gap: 6 }}>
              {modules.map((mod) => {
                const alreadyIn = (attachMsTarget?.modules ?? []).some((m) => m.moduleId === mod.id);
                const selected = attachModuleId === mod.id;
                return (
                  <Pressable
                    disabled={alreadyIn}
                    key={mod.id}
                    onPress={() => setAttachModuleId(mod.id)}
                    style={[
                      styles.pickerRow,
                      selected && styles.pickerRowSelected,
                      alreadyIn && { opacity: 0.45 },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modLinkTitle}>
                        #{mod.id} • {mod.title}
                      </Text>
                      <Text style={styles.mutedText}>
                        {getModuleMeta(mod.moduleType).label} • {mod.estimatedMinutes} phút
                        {alreadyIn ? ' • Đã nằm trong chặng này' : ''}
                      </Text>
                    </View>
                    <Ionicons
                      color={selected ? colors.primary : colors.textMuted}
                      name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={20}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.twoColRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.fieldLabel}>Thứ tự trong Chặng</Text>
                <TextInput keyboardType="numeric" onChangeText={setAttachOrder} style={styles.input} value={attachOrder} />
              </View>
              <View style={[styles.switchRow, { flex: 1, alignSelf: 'flex-end' }]}>
                <Text style={styles.fieldLabel}>Bắt buộc</Text>
                <Switch onValueChange={setAttachRequired} value={attachRequired} />
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable onPress={() => setAttachMsTarget(null)} style={styles.secondarySmBtn}>
                <Text style={styles.secondarySmText}>Hủy</Text>
              </Pressable>
              <Pressable disabled={working} onPress={() => void submitAttachExisting()} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>{working ? 'Đang gắn...' : 'Gắn vào Chặng'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 5: EDIT MODULE LINK SETTINGS */}
      <Modal animationType="fade" onRequestClose={() => setEditLinkTarget(null)} transparent visible={Boolean(editLinkTarget)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Thiết lập bước học: {editLinkTarget?.moduleTitle}</Text>
            {formError ? <Text style={styles.modalError}>{formError}</Text> : null}
            <View style={{ gap: 4 }}>
              <Text style={styles.fieldLabel}>Thứ tự trong Chặng</Text>
              <TextInput keyboardType="numeric" onChangeText={setEditLinkOrder} style={styles.input} value={editLinkOrder} />
            </View>
            <View style={{ gap: 4 }}>
              <Text style={styles.fieldLabel}>Điều kiện mở khóa (VD: NONE / PREVIOUS_COMPLETED)</Text>
              <TextInput onChangeText={setEditLinkUnlock} style={styles.input} value={editLinkUnlock} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.fieldLabel}>Bắt buộc hoàn thành</Text>
              <Switch onValueChange={setEditLinkRequired} value={editLinkRequired} />
            </View>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setEditLinkTarget(null)} style={styles.secondarySmBtn}>
                <Text style={styles.secondarySmText}>Hủy</Text>
              </Pressable>
              <Pressable disabled={working} onPress={() => void submitEditLink()} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Lưu thiết lập</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 6: CREATE / EDIT STANDALONE LIBRARY MODULE */}
      <Modal animationType="fade" onRequestClose={() => setLibModalVisible(false)} transparent visible={libModalVisible}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              {editingLibModule ? `Cập nhật Mô-đun #${editingLibModule.id}` : 'Tạo Mô-đun mới vào Kho'}
            </Text>
            {formError ? <Text style={styles.modalError}>{formError}</Text> : null}
            <View style={styles.chipWrap}>
              {Object.keys(MODULE_TYPE_META).map((typeKey) => {
                const active = libType === typeKey;
                return (
                  <Pressable
                    key={typeKey}
                    onPress={() => setLibType(typeKey)}
                    style={[styles.choiceChip, active && styles.choiceChipActive]}
                  >
                    <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                      {getModuleMeta(typeKey).label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              onChangeText={setLibTitle}
              placeholder="Tên mô-đun"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={libTitle}
            />
            <TextInput
              keyboardType="numeric"
              onChangeText={setLibMinutes}
              placeholder="Thời lượng (phút)"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={libMinutes}
            />
            <TextInput
              onChangeText={setLibDesc}
              placeholder="Mô tả"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={libDesc}
            />
            <View style={styles.switchRow}>
              <Text style={styles.fieldLabel}>Đang hoạt động</Text>
              <Switch onValueChange={setLibActive} value={libActive} />
            </View>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setLibModalVisible(false)} style={styles.secondarySmBtn}>
                <Text style={styles.secondarySmText}>Hủy</Text>
              </Pressable>
              <Pressable disabled={working} onPress={() => void submitLibModal()} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Lưu Mô-đun</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  stepperCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
    padding: spacing.md,
  },
  stepperTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  stepperTitle: { color: colors.text, fontSize: 15.5, fontWeight: '800' },
  stepperSub: { color: colors.textMuted, fontSize: 12.5, marginTop: 2 },
  modeSwitchRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  modeTab: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  modeTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeTabText: { color: colors.textSecondary, fontSize: 12.5, fontWeight: '700' },
  modeTabTextActive: { color: '#FFFFFF', fontWeight: '800' },
  guideToggleBtn: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  guideToggleBtnActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  guideToggleText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  guideToggleTextActive: { color: colors.primaryDark },
  stepsStrip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    padding: 10,
  },
  stepChip: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  stepChipText: { color: colors.primaryDark, fontSize: 12, fontWeight: '700' },
  loadingWrap: { alignItems: 'center', gap: 8, paddingVertical: 40 },
  mutedText: { color: colors.textMuted, fontSize: 12.5 },
  splitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'flex-start' },
  leftColumn: { flexBasis: 320, flexGrow: 1, maxWidth: 380, gap: 10 },
  rightColumn: { flex: 1, minWidth: 380, gap: 12 },
  colHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  colTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  pathCardList: { gap: 8 },
  pathCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1.2,
    gap: 6,
    padding: 12,
  },
  pathCardSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderWidth: 1.75,
  },
  pathCardTop: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  scoreBadge: {
    backgroundColor: '#E2E8F0',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  scoreBadgeSelected: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  scoreBadgeText: { color: '#1E293B', fontSize: 12, fontWeight: '900' },
  scoreBadgeTextSelected: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  pathCode: { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },
  statusPill: { borderRadius: radius.pill, marginLeft: 'auto', paddingHorizontal: 9, paddingVertical: 3 },
  statusPillOn: { backgroundColor: colors.successSoft },
  statusPillOff: { backgroundColor: '#F1F5F9' },
  statusPillText: { fontSize: 11, fontWeight: '800' },
  statusPillOnText: { color: '#15803D' },
  statusPillOffText: { color: '#64748B' },
  pathCardTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  pathMetaFooterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    marginTop: 2,
  },
  pathMetaStat: { color: colors.primaryDark, fontSize: 12, fontWeight: '700' },
  emptyTagPill: {
    backgroundColor: '#FEF3C7',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  emptyTagText: { color: '#B45309', fontSize: 10.5, fontWeight: '800' },
  compactIconGroup: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  ghostIconBtn: {
    alignItems: 'center',
    borderRadius: 7,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  detailHero: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 15,
  },
  detailHeroTitle: { color: colors.text, fontSize: 17.5, fontWeight: '900' },
  heroActionGroup: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  badgeLine: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  milestoneStack: { gap: 10 },
  msCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1.2,
    gap: 10,
    padding: 13,
  },
  msHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  msTitleTrigger: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  msOrderPill: {
    backgroundColor: colors.primarySoft,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  msOrderText: { color: colors.primaryDark, fontSize: 11.5, fontWeight: '900' },
  msTitle: { color: colors.text, fontSize: 14.5, fontWeight: '800' },
  msCountPill: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  msCountText: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  msEmptyStrip: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    padding: 11,
  },
  msFooterActions: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 10,
  },
  softPrimaryBtn: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: '#93C5FD',
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  softPrimaryBtnText: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' },
  moduleLinkList: { gap: 8 },
  moduleLinkRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 10,
  },
  orderControlCol: { alignItems: 'center', gap: 4 },
  reorderMiniRow: { flexDirection: 'row', gap: 2 },
  reorderMiniBtn: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 5,
    borderWidth: 1,
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  stepBubble: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 999,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  stepBubbleText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  typePill: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typePillText: { fontSize: 11, fontWeight: '800' },
  modLinkTitle: { color: colors.text, fontSize: 13.5, fontWeight: '800' },
  resourceSummaryText: { color: colors.primaryDark, fontSize: 12, fontWeight: '700' },
  rowRightActions: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  contentCtaBtn: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: '#93C5FD',
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  contentCtaText: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' },
  libraryContainer: { gap: 12 },
  emptyBox: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    padding: 24,
  },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  primaryBtn: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  primarySmBtn: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 9,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  primarySmText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  secondarySmBtn: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  secondarySmText: { color: colors.primaryDark, fontSize: 12, fontWeight: '700' },
  iconActionBtn: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 9,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.52)',
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    gap: 10,
    maxWidth: 560,
    padding: 20,
    width: '100%',
  },
  modalTitle: { color: colors.text, fontSize: 16.5, fontWeight: '900' },
  modalError: {
    backgroundColor: colors.dangerSoft,
    color: colors.danger,
    fontSize: 12.5,
    fontWeight: '700',
    padding: 8,
    borderRadius: 8,
  },
  fieldLabel: { color: colors.textSecondary, fontSize: 12.5, fontWeight: '700' },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 13.5,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choiceChip: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  choiceChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  choiceChipText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  choiceChipTextActive: { color: colors.primaryDark, fontWeight: '800' },
  twoColRow: { flexDirection: 'row', gap: 10 },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 8 },
  pickerRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  pickerRowSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
});
