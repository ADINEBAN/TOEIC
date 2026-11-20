import { FontAwesome5, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { ReactNode } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "@/src/store/theme-store";
import { useResponsiveLayout } from "@/src/utils/responsive";

type TabIconProps = {
  focused: boolean;
  label: string;
  icon: ReactNode;
};

function TabIcon({ focused, label, icon }: TabIconProps) {
  const { theme } = useAppTheme();
  const { isNarrow } = useResponsiveLayout();
  const c = theme.colors;

  return (
    <View style={styles.tabItem}>
      <View
        style={[
          styles.iconPill,
          focused ? { backgroundColor: c.primarySoft } : null,
        ]}
      >
        {icon}
      </View>

      <Text
        numberOfLines={1}
        style={[
          styles.tabLabel,
          {
            color: focused ? c.primary : c.textMuted,
            fontSize: isNarrow ? 10 : 10.5,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export default function UserTabsLayout() {
  const { theme } = useAppTheme();
  const { dockHeight, dockBottom, screenPadding, isTablet } = useResponsiveLayout();
  const c = theme.colors;
  const iconSize = 19;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: c.background },
        tabBarBackground: () => (
          <View
            style={[
              styles.dockBg,
              {
                backgroundColor: c.tabBarBg,
                borderColor: c.glassBorder,
                elevation: Platform.OS === "android" ? 8 : 0,
                shadowColor: c.shadow,
              },
            ]}
          />
        ),
        tabBarHideOnKeyboard: true,
        tabBarIconStyle: styles.tabBarIconSlot,
        tabBarItemStyle: [styles.tabBarItem, { height: dockHeight - 6 }],
        tabBarShowLabel: false,
        tabBarStyle: [
          styles.tabBar,
          {
            bottom: dockBottom,
            height: dockHeight,
            left: isTablet ? "50%" : screenPadding,
            marginLeft: isTablet ? -260 : 0,
            right: isTablet ? undefined : screenPadding,
            width: isTablet ? 520 : undefined,
          },
        ],
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon={
                <Ionicons
                  color={focused ? c.primary : c.textMuted}
                  name={focused ? "home" : "home-outline"}
                  size={iconSize}
                />
              }
              label="Trang chủ"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="practice"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon={
                <Ionicons
                  color={focused ? c.primary : c.textMuted}
                  name={focused ? "school" : "school-outline"}
                  size={iconSize}
                />
              }
              label="Lộ trình"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="cards"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon={
                <MaterialCommunityIcons
                  color={focused ? c.primary : c.textMuted}
                  name={focused ? "cards" : "cards-outline"}
                  size={iconSize}
                />
              }
              label="Từ vựng"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="test"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon={
                <Ionicons
                  color={focused ? c.primary : c.textMuted}
                  name={focused ? "trophy" : "trophy-outline"}
                  size={iconSize}
                />
              }
              label="Thi thử"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon={
                <FontAwesome5
                  color={focused ? c.primary : c.textMuted}
                  name="user"
                  size={16}
                  solid={focused}
                />
              }
              label="Hồ sơ"
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  dockBg: {
    borderRadius: 26,
    borderWidth: 1,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    top: 0,
  },
  tabBar: {
    backgroundColor: "transparent",
    borderTopWidth: 0,
    elevation: 0,
    overflow: "visible",
    paddingBottom: 4,
    paddingHorizontal: 6,
    paddingTop: 4,
    position: "absolute",
  },
  tabBarIconSlot: {
    flex: 1,
    width: "100%",
  },
  tabBarItem: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
    padding: 0,
  },
  tabItem: {
    alignItems: "center",
    flex: 1,
    gap: 2,
    justifyContent: "center",
    minWidth: 0,
    width: "100%",
  },
  iconPill: {
    alignItems: "center",
    borderRadius: 999,
    height: 32,
    justifyContent: "center",
    width: 48,
  },
  tabLabel: {
    fontWeight: "800",
    letterSpacing: 0.1,
    textAlign: "center",
  },
});
