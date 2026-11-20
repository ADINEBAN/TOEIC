import { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/src/assets/styles/theme';

export default function AdminShell({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundGlow} />
      <View style={styles.backgroundGlowSecondary} />
      <View style={styles.accentLine} />
      <View style={styles.page}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  accentLine: {
    backgroundColor: colors.primary,
    height: 3,
    left: 0,
    opacity: 0.9,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  backgroundGlow: {
    backgroundColor: 'rgba(37, 99, 235, 0.06)',
    borderRadius: 360,
    height: 360,
    left: -120,
    position: 'absolute',
    top: -90,
    width: 360,
  },
  backgroundGlowSecondary: {
    backgroundColor: 'rgba(5, 150, 105, 0.05)',
    borderRadius: 320,
    bottom: -100,
    height: 320,
    position: 'absolute',
    right: -100,
    width: 320,
  },
});
