import { useEffect, useState } from "react";
import { Icon } from "../components/icons";
import { Button, EmptyState, Field, Input, Modal, Notice, PageHeader, Panel, Skeleton, Status, statusTone, Textarea } from "../components/ui";
import { apiFetch } from "../lib/api";
import { formatDate, slugify } from "../lib/format";

interface Server {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  isOwner: boolean;
  createdAt: string;
}

export function ServersPage() {
  const [servers, setServers] = useState<Server[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await apiFetch<Server[]>("/api/v1/servers");
    if (res.error) setError(res.error.message);
    else {
      setError(null);
      setServers(res.data ?? []);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <PageHeader
        title="Servers"
        description="ERLC communities you own or belong to."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} />
            New server
          </Button>
        }
      />

      {error && (
        <div className="mb-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}

      {servers === null ? (
        <Panel>
          <div className="space-y-3 p-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-36" />
          </div>
        </Panel>
      ) : servers.length === 0 ? (
        <EmptyState title="No servers yet" action={<Button variant="primary" onClick={() => setCreating(true)}>Create your first server</Button>}>
          Create one for your community, or ask its owner to add you to theirs.
        </EmptyState>
      ) : (
        <Panel>
          <ul className="divide-y">
            {servers.map((s) => (
              <li key={s.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="truncate font-mono text-xs text-text-muted">{s.slug}</p>
                  </div>
                  <Status tone={statusTone(s.status)}>{s.status}</Status>
                </div>
                {s.description && <p className="mt-1.5 text-text-muted">{s.description}</p>}
                <p className="mt-2 flex items-center gap-3 text-xs text-text-muted">
                  {s.isOwner && <span className="font-medium text-primary">Owner</span>}
                  <span>Created {formatDate(s.createdAt)}</span>
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="New server" description="You'll be the owner and can invite others afterwards.">
        <CreateServerForm onClose={() => setCreating(false)} onCreated={load} />
      </Modal>
    </>
  );
}

function CreateServerForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiFetch<Server>("/api/v1/servers", {
      method: "POST",
      body: JSON.stringify({ name: name.trim(), slug, description: description.trim() || undefined }),
    });
    setBusy(false);
    if (res.error) return setError(res.error.code === "CONFLICT" ? "That slug is already taken." : res.error.message);
    onCreated();
    onClose();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Name">
        {(p) => (
          <Input
            {...p}
            autoFocus
            required
            minLength={3}
            placeholder="Liberty County Roleplay"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugEdited) setSlug(slugify(e.target.value));
            }}
          />
        )}
      </Field>
      <Field label="Slug" hint="Used in links. Lowercase letters, numbers and hyphens.">
        {(p) => (
          <Input
            {...p}
            mono
            required
            minLength={3}
            spellCheck={false}
            value={slug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value.toLowerCase());
            }}
          />
        )}
      </Field>
      <Field label="Description" optional>
        {(p) => <Textarea {...p} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />}
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Create server
        </Button>
      </div>
    </form>
  );
}
