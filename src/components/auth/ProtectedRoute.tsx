import { Navigate, useLocation } from "@tanstack/react-router";

import { useAuth } from "@/integrations/supabase/auth-provider";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        جاري التحضير...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" search={{ redirect: location.pathname }} replace />;
  }

  return <>{children}</>;
}
