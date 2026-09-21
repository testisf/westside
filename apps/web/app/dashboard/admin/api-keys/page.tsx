"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newKeySecret, setNewKeySecret] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    const res = await apiFetch<ApiKey[]>("/api/v1/api-keys");
    if (res.error) setError(res.error.message);
    else setKeys(res.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const scopeList = scopes.split(",").map((s) => s.trim()).filter(Boolean);
    const res = await apiFetch<ApiKey & { secret: string }>("/api/v1/api-keys", {
      method: "POST",
      body: JSON.stringify({ name, scopes: scopeList }),
    });
    setCreating(false);
    if (res.error) { setError(res.error.message); return; }
    if (res.data?.secret) {
      setNewKeySecret(res.data.secret);
      setName(""); setScopes("");
    }
    await load();
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    await apiFetch(`/api/v1/api-keys/${id}`, { method: "DELETE" });
    await load();
  }

  async function handleRotate(id: string) {
    if (!confirm("Rotate this API key? The old key will stop working immediately.")) return;
    const res = await apiFetch<{ secret: string }>(`/api/v1/api-keys/${id}/rotate`, { method: "POST" });
    if (res.data?.secret) {
      setNewKeySecret(res.data.secret);
    }
    await load();
  }

  if (loading) {
    return <div className="p-6 text-text-muted text-sm">Loading API keys…</div>;
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-semibold mb-1">API Keys</h1>
      <p className="text-sm text-text-muted mb-6">
        Issue scoped keys for integrations. Store the secret immediately — it is shown only once.
      </p>

      {newKeySecret && (
        <div className="mb-6 bg-success/10 border border-success/30 rounded-xl p-4">
          <div className="font-medium text-success text-sm mb-2">New key generated — copy now:</div>
          <code className="block bg-bg text-text font-mono text-xs p-3 rounded border border-border break-all">
            {newKeySecret}
          </code>
          <button onClick={() => setNewKeySecret(null)}
            className="mt-2 text-xs underline">Dismiss</button>
        </div>
      )}

      <form onSubmit={handleCreate} className="mb-6 bg-surface border border-border rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="production-bridge"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Scopes (comma-separated)</label>
            <input value={scopes} onChange={(e) => setScopes(e.target.value)}
              placeholder="erlc.read, radio.read"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" />
          </div>
        </div>
        <button type="submit" disabled={creating}
          className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-md px-4 py-2">
          {creating ? "Creating…" : "Create key"}
        </button>
      </form>

      {error && (
        <div className="mb-4 text-sm text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {keys.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center text-sm text-text-muted">
          No API keys yet.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl divide-y divide-border">
          {keys.map((k) => (
            <div key={k.id} className="p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{k.name}</span>
                  {k.revokedAt && (
                    <span className="text-xs text-danger bg-danger/10 px-2 py-0.5 rounded">revoked</span>
                  )}
                </div>
                <code className="text-xs text-text-muted font-mono">{k.keyPrefix}…</code>
                <div className="text-xs text-text-muted mt-1">
                  {k.scopes.length === 0 ? "No scopes" : k.scopes.join(", ")}
                </div>
                <div className="text-xs text-text-muted mt-1">
                  Created {new Date(k.createdAt).toLocaleDateString()}
                  {k.lastUsedAt && ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                  {k.expiresAt && ` · Expires ${new Date(k.expiresAt).toLocaleDateString()}`}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => handleRotate(k.id)}
                  disabled={!!k.revokedAt}
                  className="text-xs border border-border rounded-md px-3 py-1.5 hover:bg-surface-hover disabled:opacity-50">
                  Rotate
                </button>
                <button onClick={() => handleRevoke(k.id)}
                  disabled={!!k.revokedAt}
                  className="text-xs border border-danger/30 text-danger rounded-md px-3 py-1.5 hover:bg-danger/10 disabled:opacity-50">
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
