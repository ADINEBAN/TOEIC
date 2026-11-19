import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { Component, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type AppErrorBoundaryProps = {
  children: ReactNode;
  fallbackTitle?: string;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
};

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: "",
  };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage:
        error instanceof Error ? error.message : "Đã xảy ra lỗi hiển thị màn hình.",
    };
  }

  componentDidCatch(error: unknown) {
    console.warn("[AppErrorBoundary] Caught error:", error);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: "" });
  };

  handleGoHome = () => {
    this.setState({ hasError: false, errorMessage: "" });
    try {
      router.navigate("/user/home" as never);
    } catch {
      // Ignore navigation fallback errors
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.wrap}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons color="#7160F2" name="refresh-circle" size={36} />
          </View>
          <Text style={styles.title}>
            {this.props.fallbackTitle ?? "Màn hình vừa tự khôi phục"}
          </Text>
          <Text numberOfLines={3} style={styles.message}>
            {this.state.errorMessage || "Dữ liệu đang được đồng bộ lại."}
          </Text>
          <View style={styles.btnRow}>
            <Pressable onPress={this.handleRetry} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Thử lại</Text>
            </Pressable>
            <Pressable onPress={this.handleGoHome} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Về Trang chủ</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    backgroundColor: "#F5F4FF",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E8E5F8",
    borderRadius: 24,
    borderWidth: 1,
    maxWidth: 400,
    padding: 22,
    width: "100%",
  },
  iconCircle: {
    alignItems: "center",
    backgroundColor: "#EDE9FE",
    borderRadius: 999,
    height: 56,
    justifyContent: "center",
    marginBottom: 12,
    width: 56,
  },
  title: {
    color: "#1E1B3A",
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },
  message: {
    color: "#6E6A8E",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    textAlign: "center",
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  primaryBtn: {
    backgroundColor: "#7160F2",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  secondaryBtn: {
    backgroundColor: "#EDE9FE",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryBtnText: {
    color: "#3F32A8",
    fontSize: 13,
    fontWeight: "800",
  },
});
