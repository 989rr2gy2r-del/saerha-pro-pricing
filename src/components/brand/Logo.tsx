import { COMPANY, SYSTEM } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const logoSrc = `${import.meta.env.BASE_URL}al-awab-logo.jpg?v=20260922`;

/** الشعار الرسمي المرفوع من الشركة — يُعرض كاملًا دون إعادة رسم أو قص. */
export function AlAwabLogo({ className }: { className?: string }) {
  return (
    <img
      src={logoSrc}
      alt={COMPANY.nameAr}
      width={90}
      height={120}
      loading="eager"
      decoding="async"
      className={cn(
        "block h-20 w-[90px] shrink-0 rounded-md bg-white object-contain",
        className,
      )}
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
      <AlAwabLogo className="h-20 w-[90px] shrink-0" />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "truncate text-xl font-extrabold leading-tight",
              onDark ? "text-primary-foreground" : "text-primary",
            )}
          >
            {SYSTEM.nameAr}
          </span>
          <span className="text-[11px] font-bold text-accent">{SYSTEM.taglineAr}</span>
        </div>
        {showOwner && (
          <p
            className={cn(
              "truncate text-[11px] leading-tight",
              onDark ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          >
            {SYSTEM.ownerLineAr}
          </p>
        )}
      </div>
    </div>
  );
}
