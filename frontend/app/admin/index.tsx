import { Redirect } from 'expo-router';

import { useAuth } from '@/src/hooks/use-auth';
import AdminLoginScreen from '@/src/pages/admin/login/AdminLoginScreen';
import { hasAdminConsoleAccess } from '@/src/services/admin-auth.service';

export default function AdminIndexPage() {
  const { auth, isHydrated } = useAuth();

  if (!isHydrated) {
    return null;
  }

  if (auth.accessToken && hasAdminConsoleAccess(auth.user?.role)) {
    return <Redirect href="/admin/dashboard" />;
  }

  return <AdminLoginScreen />;
}
