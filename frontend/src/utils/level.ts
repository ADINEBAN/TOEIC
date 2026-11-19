export type LevelProgressInfo = {
  level: number;
  totalXp: number;
  currentLevelMinXp: number;
  nextLevelXp: number;
  xpIntoLevel: number;
  xpRequiredForNextLevel: number;
  progressPercent: number;
  levelTitle: string;
  badgeColors: readonly [string, string];
  borderColor: string;
};

export function xpStepForLevel(level: number): number {
  const safeLevel = Math.max(1, level);
  return Math.min(1000, 100 + (safeLevel - 1) * 50);
}

export function getLevelTierStyle(level: number): {
  title: string;
  badgeColors: readonly [string, string];
  borderColor: string;
} {
  if (level >= 30) {
    return {
      title: "Huyền Thoại",
      badgeColors: ["#FBBF24", "#D97706"],
      borderColor: "#FEF08A",
    };
  }
  if (level >= 20) {
    return {
      title: "Chiến Tướng",
      badgeColors: ["#FB7185", "#DC2626"],
      borderColor: "#FECDD3",
    };
  }
  if (level >= 10) {
    return {
      title: "Tinh Anh",
      badgeColors: ["#60A5FA", "#2563EB"],
      borderColor: "#BFDBFE",
    };
  }
  if (level >= 5) {
    return {
      title: "Học Giả",
      badgeColors: ["#34D399", "#059669"],
      borderColor: "#A7F3D0",
    };
  }
  return {
    title: "Tân Binh",
    badgeColors: ["#22D3EE", "#0284C7"],
    borderColor: "#BAE6FD",
  };
}

export function computeLevelProgress(rawXp?: number | null): LevelProgressInfo {
  const totalXp = Math.max(0, Math.floor(rawXp ?? 0));
  let level = 1;
  let minXp = 0;

  while (true) {
    const step = xpStepForLevel(level);
    if (totalXp < minXp + step) {
      const into = totalXp - minXp;
      const pct = Math.max(0, Math.min(100, Math.round((into * 100) / step)));
      const tier = getLevelTierStyle(level);
      return {
        level,
        totalXp,
        currentLevelMinXp: minXp,
        nextLevelXp: minXp + step,
        xpIntoLevel: into,
        xpRequiredForNextLevel: step,
        progressPercent: pct,
        levelTitle: tier.title,
        badgeColors: tier.badgeColors,
        borderColor: tier.borderColor,
      };
    }
    minXp += step;
    level += 1;
  }
}

export const LEVEL_XP_RULES = [
  { activity: "Hoàn thành bài học video", xp: "+35 XP", note: "Mỗi bài học trên lộ trình" },
  { activity: "Hoàn thành Module / Chặng", xp: "+60 – +150 XP", note: "Thưởng hoàn tất chặng" },
  { activity: "Luyện tập TOEIC Part 1–7", xp: "+20 – +50 XP", note: "Tùy số câu & tỷ lệ đúng" },
  { activity: "Thi thử Full / Mini Test", xp: "+40 – +90 XP", note: "Sau khi nộp bài" },
  { activity: "Ôn từ vựng SM-2 (Tốt / Dễ)", xp: "+5 XP / từ", note: "Mỗi từ ôn 1 lần / ngày" },
  { activity: "Hoàn thành Video AI Song ngữ", xp: "+45 XP", note: "Tại YouTube Studio" },
  { activity: "Đấu trường Solo 1v1", xp: "+15 – +40 XP", note: "Thắng +40 XP, Hòa +25 XP" },
  { activity: "Điểm danh Streak & Thành tựu", xp: "+25 – +60 XP", note: "Duy trì chuỗi học mỗi ngày" },
] as const;
