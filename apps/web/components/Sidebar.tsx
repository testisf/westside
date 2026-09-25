"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";
import { ThemeToggle } from "./ThemeToggle";
import { Wordmark } from "./Wordmark";
import { useMe, useSession } from "@/lib/session";
import { initials } from "@/lib/format";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Hidden unless the signed-in user holds this permission. */
  permission?: string;
  exact?: boolean;
}

const WORKSPACE: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "home", exact: true },
  { href: "/dashboard/servers", label: "Servers", icon: "server" },
];

const ADMIN: NavItem[] = [
  { href: "/dashboard/admin/users", label: "Users", icon: "users", permission: "user.view.all" },
  { href: "/dashboard/admin/audit", label: "Audit log", icon: "log", permission: "audit.view" },
  { href: "/dashboard/admin/security", label: "Security events", icon: "shield", permission: "security.view" },
  { href: "/dashboard/admin/api-keys", label: "API keys", icon: "key", permission: "apikey.view" },
];

const ACCOUNT: NavItem[] = [
  { href: "/dashboard/settings/security", label: "Security", icon: "lock" },
];

// Roadmap modules. Shown as plain text, not links, until they exist.
const PLANNED = [
  "Personnel", "Vehicles", "CAD", "Radio", "MDT", "Calls", "Records", "BOLOs", "Warrants", "Departments",
];

function NavGroup({ label, items, pathname }: { label?: string; items: NavItem[]; pathname: string }) {
  const { can } = useSession();
  const visible = items.filter((i) => !i.permission || can(i.permission));
  if (visible.length === 0) return null;
  return (
    <div>
      {label && <p className="px-2.5 pb-1 text-xs font-medium text-text-faint">{label}</p>}
      <ul className="space-y-px">
        {visible.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-8 items-center gap-2.5 rounded px-2.5 transition-colors ${
                  active
                    ? "bg-bg-subtle font-medium text-text"
                    : "text-text-muted hover:bg-bg-subtle hover:text-text"
                }`}
              >
                <Icon name={item.icon} className={active ? "text-primary" : ""} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function UserMenu() {
  const me = useMe();
  const { signOut } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative flex items-center gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-bg-subtle"
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-bg-muted text-xs font-medium"
          aria-hidden="true"
        >
          {initials(me.user.username)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium leading-4">{me.user.username}</span>
          <span className="block truncate text-xs leading-4 text-text-muted">
            {me.roles[0] ?? "Member"}
          </span>
        </span>
        <Icon name="chevronDown" size={14} className="shrink-0 text-text-faint" />
      </button>
      <ThemeToggle />

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-30 mb-1 w-56 rounded-lg border bg-surface py-1 shadow-[0_6px_20px_rgb(0_0_0/0.16)]"
        >
          <div className="border-b px-3 pb-2 pt-1.5">
            <p className="text-xs text-text-muted">Signed in as</p>
            <p className="truncate text-[13px]">{me.user.email}</p>
          </div>
          <Link
            role="menuitem"
            href="/dashboard/settings/security"
            onClick={() => setOpen(false)}
            className="flex h-8 items-center gap-2.5 px-3 text-text-muted hover:bg-bg-subtle hover:text-text"
          >
            <Icon name="lock" />
            Security settings
          </Link>
          <button
            role="menuitem"
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await signOut();
            }}
            className="flex h-8 w-full items-center gap-2.5 px-3 text-left text-text-muted hover:bg-bg-subtle hover:text-text disabled:opacity-60"
          >
            <Icon name="logout" />
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col" onClick={(e) => (e.target as HTMLElement).closest("a") && onNavigate?.()}>
      <div className="flex h-12 shrink-0 items-center px-4">
        <Wordmark />
      </div>

      <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-2 py-3">
        <NavGroup items={WORKSPACE} pathname={pathname} />
        <NavGroup label="Administration" items={ADMIN} pathname={pathname} />
        <NavGroup label="Account" items={ACCOUNT} pathname={pathname} />

        <details className="group px-2.5 text-text-muted">
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded text-xs font-medium text-text-faint hover:text-text-muted [&::-webkit-details-marker]:hidden">
            <Icon
              name="chevronRight"
              size={12}
              className="transition-transform group-open:rotate-90"
            />
            Planned modules
          </summary>
          <ul className="mt-1.5 space-y-1 border-l pl-3 text-[13px] text-text-faint">
            {PLANNED.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </details>
      </nav>

      <div className="shrink-0 border-t p-2">
        <UserMenu />
      </div>
    </div>
  );
}

/** Fixed sidebar for desktop. Below `md` the Shell shows a drawer instead. */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r bg-surface md:block">
      <SidebarContent />
    </aside>
  );
}
