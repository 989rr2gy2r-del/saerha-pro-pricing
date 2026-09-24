import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Plus, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

type ManagedUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  username: string | null;
  created_at: string;
};

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "المستخدمون — سعّرها" },
      { name: "description", content: "إدارة حسابات مستخدمي الاختبار في نظام سعّرها." },
    ],
  }),
  component: () => (
    <ProtectedRoute>
      <UsersPage />
    </ProtectedRoute>
  ),
});

function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("69940150");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function callManageUsers(options?: RequestInit) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("انتهت جلسة الدخول. سجّل الدخول مرة أخرى.");

    const { data: responseData, error } = await supabase.functions.invoke("manage-users", {
      method: (options?.method ?? "GET") as "GET" | "POST",
      body: options?.body ? JSON.parse(String(options.body)) : undefined,
    });
    if (error) throw new Error(error.message || "تعذر تنفيذ العملية.");
    if (!responseData?.success) throw new Error(responseData?.error || "تعذر تنفيذ العملية.");
    return responseData;
  }

  async function loadUsers() {
    try {
      setLoading(true);
      setError("");
      const body = await callManageUsers();
      setUsers(body.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل المستخدمين.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!name.trim() || !email.trim() || !password) {
      setError("أكمل اسم المستخدم والبريد وكلمة المرور.");
      return;
    }

    try {
      setSaving(true);
      await callManageUsers({
        method: "POST",
        body: JSON.stringify({
          full_name: name.trim(),
          email: email.trim(),
          password,
        }),
      });
      setMessage(`تم إنشاء حساب ${name.trim()} بنجاح.`);
      setName("");
      setEmail("");
      setPassword("69940150");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إنشاء الحساب.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="المستخدمون" subtitle="إنشاء حسابات اختبار للعمال — بدون تعقيد الصلاحيات الآن">
      <div className="space-y-5">
        <Card className="border-primary/20 shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-5 w-5 text-accent" /> إضافة مستخدم اختبار
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>اسم العامل</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: حذيفة" />
              </div>
              <div className="space-y-1.5">
                <Label>البريد الإلكتروني</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" dir="ltr" placeholder="name@saerha.test" />
              </div>
              <div className="space-y-1.5">
                <Label>كلمة المرور</Label>
                <Input value={password} onChange={(e) => setPassword(e.target.value)} type="text" dir="ltr" />
              </div>
              <div className="flex flex-wrap items-center gap-3 lg:col-span-3">
                <Button type="submit" disabled={saving} className="h-12 gap-2">
                  <Plus className="h-4 w-4" />
                  {saving ? "جارٍ إنشاء الحساب..." : "إنشاء الحساب"}
                </Button>
                <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  الحسابات الجديدة مخصصة للاختبار وتستخدم تجربة التسعير نفسها.
                </div>
              </div>
            </form>
            {error && <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm font-semibold text-destructive">{error}</div>}
            {message && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</div>}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UsersRound className="h-5 w-5 text-accent" /> الحسابات الحالية
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">جارٍ تحميل الحسابات...</p>
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد حسابات.</p>
            ) : (
              users.map((managedUser) => (
                <div key={managedUser.id} className="grid gap-3 rounded-2xl border bg-background p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-extrabold">{managedUser.full_name || managedUser.username || "مستخدم"}</p>
                    <p className="truncate text-xs text-muted-foreground" dir="ltr">{managedUser.email || "بدون بريد"}</p>
                  </div>
                  <Badge variant="secondary" className="w-fit gap-1">
                    <KeyRound className="h-3 w-3" /> مستخدم اختبار
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
