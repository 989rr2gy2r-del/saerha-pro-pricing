import { useRef } from "react";
import { Navigate, useLocation } from "@tanstack/react-router";

import { useAuth } from "@/integrations/supabase/auth-provider";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth();
  const location = useLocation();
  // Captured once so the redirect target never changes mid-navigation,
  // which would retrigger <Navigate> in a loop.
  const initialPath = useRef(location.pathname);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        جاري التحضير...
      </div>
    );
  }

  if (!session) {
    if (location.pathname === "/login") return null;
    const redirect = initialPath.current === "/login" ? "/" : initialPath.current;
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
