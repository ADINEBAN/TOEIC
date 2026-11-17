import Constants from 'expo-constants';
import { Platform } from 'react-native';

<<<<<<< Updated upstream
const DEFAULT_PORT = '8080';
const ANDROID_EMULATOR_URL = `http://10.0.2.2:${DEFAULT_PORT}`;
const LOCALHOST_URL = `http://localhost:${DEFAULT_PORT}`;
=======
// const DEFAULT_PORT = '8082';
// const ANDROID_EMULATOR_URL = `http://10.0.2.2:${DEFAULT_PORT}`;
// const LOCALHOST_URL = `http://localhost:${DEFAULT_PORT}`;

// function extractHost(uri?: string | null) {
//   if (!uri) return null;

//   try {
//     const normalizedUri = uri.includes('://') ? uri : `http://${uri}`;
//     return new URL(normalizedUri).hostname;
//   } catch {
//     return null;
//   }
// }

// function getExpoHost() {
//   return extractHost(Constants.expoConfig?.hostUri) ?? extractHost(Constants.linkingUri);
// }

// function getDefaultBaseUrl() {
//   const expoHost = getExpoHost();
//   if (expoHost) return `http://${expoHost}:${DEFAULT_PORT}`;

//   return Platform.OS === 'android' ? ANDROID_EMULATOR_URL : LOCALHOST_URL;
// }

// function normalizeBaseUrl(rawUrl: string) {
//   const trimmed = rawUrl.trim().replace(/\/+$/, '');
//   return trimmed;
// }

// const configuredBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

// export const API_BASE_URL = normalizeBaseUrl(
//   configuredBaseUrl && configuredBaseUrl.length > 0
//     ? configuredBaseUrl
//     : getDefaultBaseUrl()
// );

const DEFAULT_PORT = '8082';
>>>>>>> Stashed changes

// Thay bằng IPv4 thực tế của máy tính Windows
const LOCAL_API_HOST = ' 192.168.1.12';

// URL backend Local: Trên web dùng localhost, trên mobile dùng IPv4 máy tính
const LOCAL_API_URL =
  Platform.OS === 'web'
    ? `http://localhost:${DEFAULT_PORT}`
    : `http://${LOCAL_API_HOST}:${DEFAULT_PORT}`;

// Ưu tiên URL trong .env nếu có
const configuredBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

// API Base URL
export const API_BASE_URL = (
  configuredBaseUrl && configuredBaseUrl.length > 0
    ? configuredBaseUrl
    : LOCAL_API_URL
).replace(/\/+$/, '');

/*
 * LOCAL DEVELOPMENT:
 *
 * Điện thoại Android thật:
 * http://192.168.1.10:8082
 *
 * Yêu cầu:
 * - Điện thoại và máy tính cùng Wi-Fi.
 * - Backend Spring Boot đang chạy port 8082.
 * - Windows Firewall cho phép kết nối port 8082.
 *
 * Không sử dụng:
 * - localhost
 * - 127.0.0.1
 * - 10.0.2.2
 * - Expo hostUri
 */
