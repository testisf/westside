"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { Sidebar, SidebarContent } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { Wordmark } from "./Wordmark";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => setDrawer(false), [pathname]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [drawer]);

  return (
    <div className="min-h-screen md:flex">
      <Sidebar />

      {/* Mobile: slim top bar + slide-over navigation */}
      <div className="sticky top-0 z-20 flex h-12 items-center justify-between border-b bg-surface pl-2 pr-2 md:hidden">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className="flex h-9 w-9 items-center justify-center rounded text-text-muted hover:bg-bg-subtle"
            aria-label="Open navigation"
            aria-expanded={drawer}
          >
            <Icon name="menu" size={18} />
          </button>
          <Wordmark />
        </div>
        <ThemeToggle />
      </div>

      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 w-64 max-w-[85%] border-r bg-surface"
          >
            <SidebarContent onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[68rem] px-4 py-6 md:px-10 md:py-9">{children}</div>
      </main>
    </div>
  );
}
