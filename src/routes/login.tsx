import { useState } from "react";
import { createFileRoute, Navigate, useNavigate, useSearch } from "@tanstack/react-router";

import { useAuth } from "@/integrations/supabase/auth-provider";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { session, isLoading, signIn } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ from: "/login" });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">جاري التحضير...</p>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("يرجى إدخال البريد الإلكتروني وكلمة المرور.");
      return;
    }

    setIsSubmitting(true);

    try {
      await signIn(email.trim(), password);

      const redirect =
        typeof search.redirect === "string" && search.redirect.startsWith("/")
          ? search.redirect
          : "/";

      await navigate({ to: redirect });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "تعذر تسجيل الدخول. تحقق من بيانات الدخول وحاول مرة أخرى.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-background px-4 py-8"
    >
      <section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">
            س
          </div>

          <h1 className="text-2xl font-bold">سعّرها</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            نظام التسعير وإدارة عروض الأسعار
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            شركة الأواب لتجارة الجملة والتجزئة
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium">
              البريد الإلكتروني
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-primary/30"
              placeholder="name@company.com"
              dir="ltr"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium"
            >
              كلمة المرور
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-primary/30"
              placeholder="••••••••"
              dir="ltr"
            />
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
          </button>
        </form>
      </section>
    </main>
  );
}
