import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { onUpdateAvailable, tauriCheckForUpdates, tauriInstallUpdate } from "../lib/tauri";

interface Server { id: string; name: string; slug: string; status: string; isOwner: boolean; }
interface MeResponse { user: { id: string; email: string; username: string; emailVerified: boolean; mfaEnabled: boolean; }; permissions: string[]; roles: string[]; }

export function DashboardPage({ onNavigate }: { onNavigate: (r: "servers" | "settings") => void }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; body: string } | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<MeResponse>("/api/v1/auth/me");
        if (res.error) { setError(`User: ${res.error.code} - ${res.error.message}`); }
        else if (res.data) { setMe(res.data); }
        const serversRes = await apiFetch<Server[]>("/api/v1/servers");
        if (serversRes.error) { if (!error) setError(`Servers: ${serversRes.error.code} - ${serversRes.error.message}`); }
        else if (serversRes.data) { setServers(serversRes.data); }
      } catch (e) { setError(`Unexpected: ${String(e)}`); }
      finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      try { await tauriCheckForUpdates(); unlisten = await onUpdateAvailable((i: any) => setUpdateAvailable({ version: i.version, body: i.body })) as unknown as () => void; } catch {}
    })();
    return () => { if (unlisten) unlisten(); };
  }, []);

  if (loading) return <div className="p-6 text-text-muted text-sm">Loading dashboard...</div>;
  if (error || !me) return (<div className="p-6 max-w-3xl"><div className="mb-4 text-sm text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2">{error ?? "Failed to load."}</div><button onClick={() => window.location.reload()} className="bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-medium rounded-md px-4 py-2">Retry</button></div>);

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-1">Welcome, {me.user.username}</h1>
      <p className="text-sm text-text-muted mb-6">Westside desktop client — Phase 4.</p>
      {updateAvailable && (<div className="mb-6 bg-primary/10 border border-primary/30 rounded-xl p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-medium text-sm text-primary">Update available — v{updateAvailable.version}</div><p className="text-xs text-text-muted mt-1 whitespace-pre-line">{updateAvailable.body}</p></div><button onClick={async () => { setInstalling(true); try { await tauriInstallUpdate(); } catch {} setInstalling(false); }} disabled={installing} className="bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-medium rounded-md px-3 py-1.5 disabled:opacity-50">{installing ? "Installing..." : "Install"}</button></div></div>)}
      <div className="grid grid-cols-2 gap-4 mb-6"><button onClick={() => onNavigate("servers")} className="bg-surface border border-border rounded-xl p-4 text-left hover:bg-surface-hover"><div className="text-xs text-text-muted">Your servers</div><div className="text-lg font-semibold mt-1">{String(servers.length)}</div></button><button disabled className="bg-surface border border-border rounded-xl p-4 text-left"><div className="text-xs text-text-muted">Permissions</div><div className="text-lg font-semibold mt-1">{String(me?.permissions?.length ?? 0)}</div></button></div>
      <section className="bg-surface border border-border rounded-xl p-5 mb-4"><h2 className="text-sm font-semibold mb-2">Phase 4 — Desktop client status</h2><ul className="text-sm space-y-1 text-text-muted"><li>✓ Authentication with OS keychain storage</li><li>✓ Auto-update checker + signed manifest</li><li>✓ Global PTT hotkey infrastructure</li><li>✓ Servers list</li></ul></section>
      <section className="bg-surface border border-border rounded-xl p-5"><h2 className="text-sm font-semibold mb-2">Your servers</h2>{servers.length === 0 ? (<p className="text-sm text-text-muted">No servers yet.</p>) : (<div className="space-y-2">{servers.slice(0, 5).map((s) => (<div key={s.id} className="flex items-center justify-between text-sm"><span className="font-medium">{s.name}</span><code className="text-xs text-text-muted">{s.slug}</code></div>))}</div>)}<button onClick={() => onNavigate("servers")} className="mt-3 text-xs text-primary hover:underline">View all servers →</button></section>
      <div className="mt-6 text-xs text-text-muted"><button onClick={() => onNavigate("settings")} className="hover:underline">Settings →</button></div>
    </div>
  );
}
