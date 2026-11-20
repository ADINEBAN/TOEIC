import { Redirect, Stack } from "expo-router";

import { FloatingChatProvider } from "@/src/components/user/FloatingChatOverlay";
import { useAuth } from "@/src/hooks/use-auth";

export default function UserLayout() {
  const { auth, isHydrated } = useAuth();

  if (!isHydrated) {
    return null;
  }

  if (!auth.accessToken) {
    return <Redirect href="/" />;
  }

  return (
    <FloatingChatProvider>
      <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="roadmap" />
        <Stack.Screen name="grammar" />
        <Stack.Screen name="notebook" />
        <Stack.Screen name="lesson" />
        <Stack.Screen name="exam" />
        <Stack.Screen name="attempt-review" />
        <Stack.Screen name="practice-module" />
        <Stack.Screen name="practice-session" />
        <Stack.Screen name="practice-attempt-review" />
        <Stack.Screen name="path-complete" />
        <Stack.Screen name="mistakes" />
        <Stack.Screen name="arena" />
        <Stack.Screen name="youtube-studio" />
        <Stack.Screen name="document-exam" />
        <Stack.Screen name="dictionary" />
        <Stack.Screen name="leaderboard" />
        <Stack.Screen name="shop" />
      </Stack>
    </FloatingChatProvider>
  );
}
