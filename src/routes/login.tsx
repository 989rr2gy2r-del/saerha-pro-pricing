import { createFileRoute, Navigate, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowLeft, BarChart3, Clock3, Eye, EyeOff, LockKeyhole, Mail, Package, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { AlAwabLogo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/integrations/supabase/auth-provider";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : "/",
  }),
  component: LoginPage,
});

function LoginPage() {
  const { session, isLoading, signIn } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ from: "/login" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (isLoading) {
    return <main dir="rtl" className="grid min-h-screen place-items-center bg-slate-50"><p className="font-bold text-slate-500">جاري التحقق من جلسة الدخول...</p></main>;
  }
  if (session) return <Navigate to="/" replace />;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("أدخل البريد الإلكتروني وكلمة المرور.");
      return;
    }
    setIsSubmitting(true);
    try {
      await signIn(email.trim(), password);
      const redirect = typeof search.redirect === "string" && search.redirect.startsWith("/") && search.redirect !== "/login" ? search.redirect : "/";
      await navigate({ to: redirect });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(/invalid login credentials/i.test(message) ? "البريد الإلكتروني أو كلمة المرور غير صحيحة." : message || "تعذر تسجيل الدخول. حاول مرة أخرى.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const features = [[Package, "إدارة المنتجات"], [ShieldCheck, "دقة في التسعير"], [Clock3, "سرعة في الإنجاز"], [BarChart3, "تقارير دقيقة"]];

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50">
      <div className="grid min-h-screen lg:grid-cols-[minmax(420px,.9fr)_minmax(520px,1.1fr)]">
        <section className="relative overflow-hidden bg-[#0b3557] px-6 py-10 text-white lg:px-12">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "linear-gradient(135deg,#fff 12%,transparent 12%,transparent 50%,#fff 50%,#fff 62%,transparent 62%)", backgroundSize: "90px 90px" }} />
          <div className="relative mx-auto flex min-h-full max-w-xl flex-col items-center justify-center text-center">
            <div className="rounded-3xl bg-white p-3 shadow-2xl">
              <AlAwabLogo className="h-auto w-56 rounded-2xl p-0" />
            </div>
            <p className="mt-8 text-xl font-semibold text-white/90">مرحبًا بك في</p>
            <div className="mt-1 text-7xl font-black"><span className="text-white">س</span><span className="text-[#ff7f4f]">عّر</span><span className="text-white">ها</span></div>
            <p className="mt-2 text-2xl font-extrabold">نظام التسعير الذكي</p>
            <p className="mt-3 max-w-md text-base leading-8 text-white/80">لتحويل طلبيات عملائك إلى عروض أسعار دقيقة وسريعة.</p>
            <div className="mt-10 grid w-full max-w-lg grid-cols-4 gap-3">
              {features.map(([Icon, label]) => (
                <div key={String(label)} className="rounded-2xl border border-white/20 bg-white/5 p-3">
                  <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-white/30"><Icon className="h-5 w-5" /></div>
                  <p className="mt-2 text-[11px] font-bold">{String(label)}</p>
                </div>
              ))}
            </div>
            <p className="mt-10 text-sm font-semibold text-white/80">شريكك في النمو ... دائمًا</p>
          </div>
        </section>

        <section className="flex items-center justify-center px-4 py-8 sm:px-8 lg:px-14">
          <div className="w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl sm:p-10">
            <div className="mb-8 text-center">
              <p className="text-sm font-bold text-[#ff7f4f]">شركة الأواب لتجارة الجملة والتجزئة</p>
              <h1 className="mt-2 text-3xl font-black text-[#0b3557]">مرحبًا بك في سعّرها</h1>
              <p className="mt-2 text-sm text-slate-500">يرجى تسجيل الدخول للمتابعة</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="login-email" className="text-sm font-bold text-slate-700">البريد الإلكتروني</label>
                <div className="relative"><Mail className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><Input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-13 rounded-xl pr-11 text-base" placeholder="name@company.com" dir="ltr" /></div>
              </div>
              <div className="space-y-2">
                <label htmlFor="login-password" className="text-sm font-bold text-slate-700">كلمة المرور</label>
                <div className="relative"><LockKeyhole className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><Input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-13 rounded-xl px-11 text-base" placeholder="••••••••" dir="ltr" /><button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label="إظهار أو إخفاء كلمة المرور">{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div>
              </div>
              <div className="flex justify-end text-sm"><button type="button" onClick={() => setError("لإعادة تعيين كلمة المرور، استخدم بريد الحساب الإداري أو اطلب من مسؤول النظام إرسال رابط الاستعادة.")} className="font-bold text-[#0b5b91] hover:underline">نسيت كلمة المرور؟</button></div>
              {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
              <Button type="submit" disabled={isSubmitting} className="h-14 w-full rounded-xl bg-[#0b5b91] text-base font-extrabold hover:bg-[#094a77]">{isSubmitting ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}{!isSubmitting && <ArrowLeft className="mr-2 h-5 w-5" />}</Button>
              <div className="flex items-center gap-4 py-1 text-xs font-bold text-slate-400"><div className="h-px flex-1 bg-slate-200" /><span>حساب الشركة</span><div className="h-px flex-1 bg-slate-200" /></div>
              <div className="rounded-xl border border-[#0b5b91]/30 bg-slate-50 p-4 text-center"><ShieldCheck className="mx-auto h-6 w-6 text-[#0b5b91]" /><p className="mt-2 text-sm font-extrabold text-[#0b3557]">دخول المستخدمين المعتمدين فقط</p><p className="mt-1 text-xs text-slate-500">نظام سعّرها محمي بحسابات Supabase المعتمدة.</p></div>
            </form>
            <div className="mt-8 border-t pt-5 text-center text-xs text-slate-500"><p>جميع الحقوق محفوظة © 2026</p><p className="mt-1 font-bold text-[#0b3557]">شركة الأواب لتجارة الجملة والتجزئة</p><p className="mt-1">AL-AWAB FOR WHOLESALE &amp; RETAIL TRADE CO.</p></div>
          </div>
        </section>
      </div>
    </main>
  );
}
