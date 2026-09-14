import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FilePlus2,
  ClipboardList,
  Package,
  Tags,
  Users,
  FileText,
  Settings,
  Plus,
} from "lucide-react";
import type { ReactNode } from "react";

import { BrandLockup } from "@/components/brand/Logo";
import { COMPANY, SYSTEM } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const navItems = [
  { to: "/", label: "لوحة التحكم", icon: LayoutDashboard },
  { to: "/new-order", label: "طلبية جديدة", icon: FilePlus2 },
  { to: "/orders", label: "الطلبات", icon: ClipboardList },
  { to: "/products", label: "المنتجات", icon: Package },
  { to: "/prices", label: "الأسعار", icon: Tags },
  { to: "/customers", label: "العملاء", icon: Users },
  { to: "/quotes", label: "عروض الأسعار", icon: FileText },
  { to: "/settings", label: "الإعدادات", icon: Settings },
] as const;

const mobileNav = [navItems[0], navItems[2], navItems[3], navItems[6], navItems[7]];

export function AppShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <div dir="rtl" className="flex min-h-screen w-full bg-background">
      {/* التنقل الجانبي — كمبيوتر وآيباد */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col brand-gradient lg:flex">
        <div className="border-b border-sidebar-border p-4">
          <BrandLockup variant="dark" />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors",
                isActive(item.to)
                  ? "bg-accent text-accent-foreground"
                  : "text-primary-foreground/80 hover:bg-sidebar-accent hover:text-primary-foreground",
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-4 text-[11px] leading-relaxed text-primary-foreground/60">
          {COMPANY.nameAr}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* الترويسة */}
        <header className="sticky top-0 z-20 border-b border-border/70 bg-card/95 backdrop-blur">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 lg:hidden">
            <BrandLockup />
            <Link
              to="/new-order"
              aria-label="رفع طلبية"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground shadow-raised"
            >
              <Plus className="h-6 w-6" />
            </Link>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t border-border/60 px-4 py-3 lg:border-t-0 lg:px-8 lg:py-5">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-extrabold text-foreground lg:text-2xl">{title}</h1>
              {subtitle && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground lg:text-sm">{subtitle}</p>
              )}
            </div>
            {action}
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 pb-28 pt-4 lg:px-8 lg:pb-12">{children}</main>

        <footer className="hidden border-t border-border/70 px-8 py-5 text-xs text-muted-foreground lg:block">
          <p className="font-semibold text-foreground">
            {SYSTEM.nameAr} — {SYSTEM.taglineAr}
          </p>
          <p className="mt-1">
            {SYSTEM.ownerLineAr} · {COMPANY.addressAr}
          </p>
        </footer>
      </div>

      {/* التنقل السفلي — الهاتف */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/97 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-5">
          {mobileNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold transition-colors",
                isActive(item.to) ? "text-accent" : "text-muted-foreground",
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
