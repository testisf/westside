import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

interface Server {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  robloxPlaceId: string | null;
  status: string;
  isOwner: boolean;
  createdAt: string;
}

export function ServersPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    const res = await apiFetch<Server[]>("/api/v1/servers");
    if (res.error) setError(res.error.message);
    else setServers(res.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const res = await apiFetch<Server>("/api/v1/servers", {
      method: "POST",
      body: JSON.stringify({ name, slug, description: description || undefined }),
    });
    setCreating(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setName("");
    setSlug("");
    setDescription("");
    setShowForm(false);
    await load();
  }

  if (loading) {
    return <div className="p-6 text-text-muted text-sm">Loading servers…</div>;
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Servers</h1>
          <p className="text-sm text-text-muted mt-1">ERLC communities you belong to.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-medium rounded-md px-4 py-2"
        >
          {showForm ? "Cancel" : "New server"}
        </button>
      </div>

      {error && (
        <div className="mb-4 text-sm text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 bg-surface border border-border rounded-xl p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Name</label>
              <input required value={name} onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Slug</label>
              <input required value={slug} onChange={(e) => setSlug(e.target.value)}
                placeholder="my-community"
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" />
          </div>
          <button type="submit" disabled={creating}
            className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-md px-4 py-2">
            {creating ? "Creating…" : "Create server"}
          </button>
        </form>
      )}

      {servers.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center text-sm text-text-muted">
          No servers yet. Create one above.
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map((s) => (
            <div key={s.id} className="bg-surface border border-border rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-base">{s.name}</h3>
                  <code className="text-xs text-text-muted">{s.slug}</code>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  s.status === "active" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                }`}>{s.status}</span>
              </div>
              {s.description && <p className="text-sm text-text-muted mt-2">{s.description}</p>}
              <div className="flex items-center gap-3 mt-3 text-xs text-text-muted">
                {s.isOwner && <span className="text-primary font-medium">Owner</span>}
                <span>Created {new Date(s.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
