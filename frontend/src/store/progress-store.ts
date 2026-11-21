import AsyncStorage from "@react-native-async-storage/async-storage";

const storageKey = (userId?: number | null) =>
  `toeic_vocab_done_modules_${userId ?? "guest"}`;

export const vocabProgressStore = {
  completedModules: new Set<number>(),
  hydratedKey: null as string | null,

  hydrate: async (userId?: number | null): Promise<Set<number>> => {
    const key = storageKey(userId);
    if (vocabProgressStore.hydratedKey === key) {
      return vocabProgressStore.completedModules;
    }
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          vocabProgressStore.completedModules = new Set(
            parsed.filter((v): v is number => typeof v === "number"),
          );
        }
      } else {
        vocabProgressStore.completedModules = new Set<number>();
      }
      vocabProgressStore.hydratedKey = key;
    } catch {
      // Keep in-memory fallback cleanly
    }
    return vocabProgressStore.completedModules;
  },

  markCompleted: (moduleId: number, userId?: number | null) => {
    vocabProgressStore.completedModules.add(moduleId);
    const key = storageKey(userId);
    vocabProgressStore.hydratedKey = key;
    void AsyncStorage.setItem(
      key,
      JSON.stringify(Array.from(vocabProgressStore.completedModules)),
    ).catch(() => undefined);
  },

  isCompleted: (moduleId: number) => {
    return vocabProgressStore.completedModules.has(moduleId);
  },
};
