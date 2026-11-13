"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Boxes, Bell } from "lucide-react";
import { navForRole } from "./nav";
import { LocaleToggle } from "./LocaleToggle";
import { WeatherBanner } from "./WeatherBanner";
import { ConnectionPill } from "@/components/shared/ConnectionPill";
import { t, type Locale } from "@/i18n/dictionaries";
import type { AppRole } from "@/server/auth/session";
import { logoutAction } from "@/server/auth/actions";
import { cn } from "@/components/ui/cn";

export function AppShell({
  role,
  locale,
  userName,
  unread,
  weatherNotices,
  weatherLabels,
  children,
}: {
  role: AppRole;
  locale: Locale;
  userName: string;
  unread: number;
  weatherNotices: { id: string; category: string; severity: string; source_kind: string; notice_text: string }[];
  weatherLabels: { danger: string; derived: string; test: string };
  children: React.ReactNode;
}) {
  const items = navForRole(role);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.labelKey + item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-periwinkle text-indigo" : "text-muted hover:bg-canvas hover:text-ink",
            )}
          >
            <Icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
            <span className="truncate">{t(locale, item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen md:grid md:grid-cols-[260px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-6 border-r border-border bg-card px-4 py-5 md:flex">
        <Brand />
        <div className="overflow-y-auto">{nav}</div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute left-0 top-0 flex h-full w-[260px] flex-col gap-6 border-r border-border bg-card px-4 py-5">
            <div className="flex items-center justify-between">
              <Brand />
              <button onClick={() => setOpen(false)} aria-label={t(locale, "shell.closeMenu")} className="text-muted hover:text-ink">
                <X className="size-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <WeatherBanner initial={weatherNotices} label={weatherLabels.danger} derivedLabel={weatherLabels.derived} testLabel={weatherLabels.test} />
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-canvas/80 px-4 py-3 backdrop-blur md:px-6">
          <button className="text-muted hover:text-ink md:hidden" onClick={() => setOpen(true)} aria-label={t(locale, "shell.menu")}>
            <Menu className="size-5" />
          </button>
          <Clock locale={locale} />
          <div className="ml-auto flex items-center gap-2 md:gap-3">
            <ConnectionPill state="UNKNOWN" />
            <Link href="/notifications" className="relative hidden rounded-lg border border-border bg-card p-2 text-muted hover:text-ink sm:inline-flex" aria-label={`${t(locale, "header.notifications")}${unread ? ` (${unread})` : ""}`}>
              <Bell className="size-[18px]" strokeWidth={1.75} />
              {unread > 0 && <span className="tabular absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>}
            </Link>
            <LocaleToggle locale={locale} />
            <form action={logoutAction}>
              <button className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm hover:bg-canvas">
                <span className="flex size-6 items-center justify-center rounded-full bg-indigo text-[11px] font-semibold text-white">
                  {userName.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-[120px] truncate text-muted sm:inline">{userName}</span>
              </button>
            </form>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/overview" className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-indigo text-white">
        <Boxes className="size-[18px]" strokeWidth={2} aria-hidden />
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">SmartClass</span>
    </Link>
  );
}

function Clock({ locale }: { locale: Locale }) {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const fmt = () =>
      new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
        weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
        timeZone: "Asia/Dhaka",
      }).format(new Date());
    setNow(fmt());
    const id = setInterval(() => setNow(fmt()), 30_000);
    return () => clearInterval(id);
  }, [locale]);
  return <span className="tabular text-sm text-muted">{now}</span>;
}
