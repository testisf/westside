"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { apiFetch, API_BASE_URL } from "@/lib/api";

interface MeResponse {
  user: {
    id: string;
    email: string;
    username: string;
    emailVerified: boolean;
    status: string;
    mfaEnabled: boolean;
  };
  permissions: string[];
  roles: string[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Try /auth/me; on 401 try /auth/refresh (cookie-based); on failure go to /login.
      let res = await apiFetch<MeResponse>("/api/v1/auth/me");
      if (res.error && res.error.code === "AUTH_TOKEN_INVALID") {
        const refreshRes = await apiFetch<MeResponse>("/api/v1/auth/refresh", { method: "POST" });
        if (refreshRes.data) {
          res = await apiFetch<MeResponse>("/api/v1/auth/me");
        }
      }
      if (cancelled) return;
      if (res.error || !res.data) {
        router.replace("/login");
        return;
      }
      setMe(res.data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [router]);

  async function handleLogout() {
    await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    router.replace("/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-text-muted text-sm">
        Loading…
      </div>
    );
  }

  if (error || !me) {
    return (
      <div className="min-h-screen flex items-center justify-center text-danger text-sm">
        {error ?? "Failed to load."}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-surface px-4 flex items-center justify-between">
          <div className="text-sm font-medium text-text-muted">Dashboard</div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <span className="text-sm text-text-muted px-2">{me.user.username}</span>
            <button
              onClick={handleLogout}
              className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-surface-hover transition"
            >
              Sign out
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <h1 className="text-2xl font-semibold mb-1">Welcome, {me.user.username}</h1>
          <p className="text-sm text-text-muted mb-8">
            Your Westside workspace. Most features arrive in Phase 2+.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="Roles" value={me.roles.length ? me.roles.join(", ") : "—"} />
            <StatCard label="Permissions" value={String(me.permissions.length)} />
            <StatCard label="Email verified" value={me.user.emailVerified ? "Yes" : "No"} />
          </div>

          <section className="mt-8 bg-surface border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold mb-2">Phase 2 status</h2>
            <ul className="text-sm space-y-1 text-text-muted">
              <li>✓ Phase 1 — Auth · RBAC · Security middleware · Audit · Security events</li>
              <li>✓ Servers + memberships (join / leave / suspend)</li>
              <li>✓ Personnel (per-server officer profiles)</li>
              <li>✓ Vehicles (per-server fleet records)</li>
              <li>✓ Notifications (list / read / dismiss)</li>
              <li>✓ API keys (create / revoke / rotate, hashed storage)</li>
              <li>✓ 2FA TOTP enrollment + verify-on-login</li>
              <li>○ Phase 3 — WebSocket infra · Radio · PTT</li>
              <li>○ Phase 4 — Westside.exe desktop client</li>
              <li>○ Phase 5 — MDT · Records · BOLOs · Warrants</li>
              <li>○ Phase 6 — ERLC/Roblox integration adapters</li>
              <li>○ Phase 7 — Admin panel UI · Update pipeline</li>
              <li>○ Phase 8 — Production deployment · Monitoring</li>
            </ul>
          </section>

          <section className="mt-4 bg-surface border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold mb-2">Your permissions</h2>
            {me.permissions.length === 0 ? (
              <p className="text-sm text-text-muted">No permissions granted yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {me.permissions.map((p) => (
                  <code key={p} className="text-xs px-2 py-0.5 rounded bg-bg-subtle border border-border">
                    {p}
                  </code>
                ))}
              </div>
            )}
          </section>

          <div className="mt-6 text-xs text-text-muted">
            <Link href="/settings" className="hover:underline">Account settings →</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="text-lg font-semibold mt-1 truncate">{value}</div>
    </div>
  );
}
