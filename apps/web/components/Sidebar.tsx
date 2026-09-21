"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  // Phase 2 — enabled
  { href: "/dashboard/servers", label: "Servers" },
  { href: "/dashboard/settings/security", label: "Settings · Security" },
  { href: "/dashboard/admin/api-keys", label: "API Keys" },
  { href: "/dashboard/admin/users", label: "Admin · Users" },
  { href: "/dashboard/admin/audit", label: "Admin · Audit" },
  { href: "/dashboard/admin/security", label: "Admin · Security" },
  // Phase 2 — server-scoped views (placeholders; require a server context)
  { href: "/dashboard/personnel", label: "Personnel", disabled: true },
  { href: "/dashboard/vehicles", label: "Vehicles", disabled: true },
  // Not yet started
  { href: "/dashboard/cad", label: "CAD", disabled: true },
  { href: "/dashboard/radio", label: "Radio", disabled: true },
  { href: "/dashboard/mdt", label: "MDT", disabled: true },
  { href: "/dashboard/calls", label: "Calls", disabled: true },
  { href: "/dashboard/records", label: "Records", disabled: true },
  { href: "/dashboard/bolos", label: "BOLOs", disabled: true },
  { href: "/dashboard/warrants", label: "Warrants", disabled: true },
  { href: "/dashboard/departments", label: "Departments", disabled: true },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-64 shrink-0 border-r border-border bg-bg-subtle hidden md:flex flex-col">
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold">W</span>
          </div>
          <div>
            <div className="font-semibold text-sm leading-tight">Westside</div>
            <div className="text-xs text-text-muted">Phase 2 · Core platform</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.disabled ? "#" : item.href}
              aria-disabled={item.disabled}
              className={`block px-3 py-1.5 rounded-md text-sm transition ${
                item.disabled
                  ? "text-text-muted/40 cursor-not-allowed"
                  : active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-text hover:bg-surface-hover"
              }`}
            >
              {item.label}
              {item.disabled && <span className="ml-1.5 text-[10px]">later</span>}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-3 border-t border-border text-xs text-text-muted">
        <div>Westside v0.2.0</div>
        <div className="mt-1">© Westside · Original work</div>
      </div>
    </aside>
  );
}
