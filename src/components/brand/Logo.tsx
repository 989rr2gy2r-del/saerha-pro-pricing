import { COMPANY, SYSTEM } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const logoSrc = "/al-awab-logo.svg";

/** شعار شركة الأواب الرسمي — أصل ثابت داخل المشروع حتى يظهر في GitHub Pages والصفحات الداخلية. */
export function AlAwabLogo({ className }: { className?: string }) {
  return (
    <img
      src={logoSrc}
      alt={COMPANY.nameAr}
      className={cn("h-10 w-auto rounded-md bg-white object-contain p-0.5", className)}
    />
  );
}

export function BrandLockup({
  variant = "light",
  showOwner = true,
}: {
  variant?: "light" | "dark";
  showOwner?: boolean;
}) {
  const onDark = variant === "dark";
  return (
    <div className="flex min-w-0 items-center gap-3">
      <AlAwabLogo className="h-11 shrink-0" />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={cn(
            "truncate text-xl font-extrabold leading-tight",
            onDark ? "text-primary-foreground" : "text-primary",
          )}>
            {SYSTEM.nameAr}
          </span>
          <span className="text-[11px] font-bold text-accent">{SYSTEM.taglineAr}</span>
        </div>
        {showOwner && (
          <p className={cn(
            "truncate text-[11px] leading-tight",
            onDark ? "text-primary-foreground/70" : "text-muted-foreground",
          )}>
            {SYSTEM.ownerLineAr}
          </p>
        )}
      </div>
    </div>
  );
}
