package org.example.backend.util;

/**
 * Progressive RPG-style user level calculator driven by total learning XP.
 */
public final class LevelCalculator {

    private LevelCalculator() {
    }

    public record LevelProgress(
            int level,
            int totalXp,
            int currentLevelMinXp,
            int nextLevelXp,
            int xpIntoLevel,
            int xpRequiredForNextLevel,
            int progressPercent,
            String levelTitle
    ) {
    }

    /**
     * XP required to advance from {@code level} to {@code level + 1}.
     * Lv.1 -> 100 XP, Lv.2 -> 150 XP, Lv.3 -> 200 XP, capped at 1000 XP/level.
     */
    public static int xpForStep(int level) {
        int safeLevel = Math.max(1, level);
        return Math.min(1000, 100 + (safeLevel - 1) * 50);
    }

    public static LevelProgress fromXp(Integer rawXp) {
        int totalXp = Math.max(0, rawXp != null ? rawXp : 0);
        int level = 1;
        int minXp = 0;
        while (true) {
            int step = xpForStep(level);
            if (totalXp < minXp + step) {
                int into = totalXp - minXp;
                int pct = Math.max(0, Math.min(100, (into * 100) / step));
                return new LevelProgress(
                        level,
                        totalXp,
                        minXp,
                        minXp + step,
                        into,
                        step,
                        pct,
                        titleForLevel(level)
                );
            }
            minXp += step;
            level++;
        }
    }

    public static String titleForLevel(int level) {
        if (level >= 30) {
            return "Huyền Thoại";
        }
        if (level >= 20) {
            return "Chiến Tướng";
        }
        if (level >= 10) {
            return "Tinh Anh";
        }
        if (level >= 5) {
            return "Học Giả";
        }
        return "Tân Binh";
    }
}
