import { router } from "expo-router";

const TAB_PATH_PREFIXES = [
  "/user/home",
  "/user/practice",
  "/user/cards",
  "/user/test",
  "/user/profile",
];

function isTabDestination(path: string): boolean {
  const basePath = path.split("?")[0]?.trim() ?? "";
  return TAB_PATH_PREFIXES.includes(basePath);
}

export function pushRoute(path: string) {
  try {
    if (isTabDestination(path)) {
      router.navigate(path as never);
      return;
    }
    router.push(path as never);
  } catch (error) {
    console.warn("[navigation] pushRoute fallback:", error);
    try {
      router.navigate(path as never);
    } catch {
      // Ignore secondary navigation error
    }
  }
}

export function replaceRoute(path: string) {
  try {
    if (isTabDestination(path)) {
      router.navigate(path as never);
      return;
    }
    router.replace(path as never);
  } catch (error) {
    console.warn("[navigation] replaceRoute fallback:", error);
    try {
      router.navigate(path as never);
    } catch {
      // Ignore secondary navigation error
    }
  }
}

export function safeBack(fallbackPath = "/user/home") {
  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.navigate(fallbackPath as never);
  } catch {
    try {
      router.navigate(fallbackPath as never);
    } catch {
      // Ignore fallback error
    }
  }
}
