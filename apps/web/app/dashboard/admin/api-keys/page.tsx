"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import {
  Button, ConfirmDialog, CopyButton, EmptyState, Field, Input, ListSkeleton, Modal, NoAccess, Notice, PageHeader,
  Panel, Status, Tag,
} from "@/components/ui";
import { apiFetch, errorMessage, fieldErrors } from "@/lib/api";
import { formatDate, timeAgo } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/use-api";

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

interface Revealed {
  name: string;
  secret: string;
  verb: "created" | "rotated";
}

const EXPIRY_OPTIONS = [
  { value: "", label: "Never expires" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
];

function keyState(k: ApiKey): { tone: "ok" | "bad" | "off"; label: string } {
  if (k.revokedAt) return { tone: "bad", label: "Revoked" };
  if (k.expiresAt && new Date(k.expiresAt) < new Date()) return { tone: "off", label: "Expired" };
  return { tone: "ok", label: "Active" };
}

export default function ApiKeysPage() {
  const { can } = useSession();
  const { data, error, loading, reload } = useApi<ApiKey[]>("/api/v1/api-keys");
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [pending, setPending] = useState<{ kind: "revoke" | "rotate"; key: ApiKey } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error?.code === "RBAC_FORBIDDEN") {
    return (
      <>
        <PageHeader title="API keys" />
        <NoAccess what="API keys" />
      </>
    );
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setActionError(null);
    const { kind, key } = pending;
    const res =
      kind === "revoke"
        ? await apiFetch(`/api/v1/api-keys/${key.id}`, { method: "DELETE" })
        : await apiFetch<{ secret: string }>(`/api/v1/api-keys/${key.id}/rotate`, { method: "POST" });
    setBusy(false);
    setPending(null);
    if (res.error) return setActionError(errorMessage(res.error));
    if (kind === "rotate") {
      setRevealed({ name: key.name, secret: (res.data as { secret: string }).secret, verb: "rotated" });
    }
    reload();
  }

  return (
    <>
      <PageHeader
        title="API keys"
        description="Keys for integrations that call the Westside API on your behalf. Only your own keys are listed."
        actions={
          can("apikey.create") && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={14} />
              New key
            </Button>
          )
        }
      />

      <div className="space-y-3">
        {revealed && (
          <Notice
            tone="warning"
            title={`${revealed.name} was ${revealed.verb}. Copy the key now.`}
            action={
              <Button size="sm" variant="ghost" onClick={() => setRevealed(null)}>
                Dismiss
              </Button>
            }
          >
            It&rsquo;s only shown once. If you lose it, rotate the key to get a new one.
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded border bg-surface px-2.5 py-1.5 font-mono text-xs text-text">
                {revealed.secret}
              </code>
              <CopyButton value={revealed.secret} />
            </div>
          </Notice>
        )}
        {actionError && <Notice tone="danger">{actionError}</Notice>}

        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <Notice tone="danger">{errorMessage(error)}</Notice>
        ) : !data || data.length === 0 ? (
          <EmptyState
            title="No API keys yet"
            action={
              can("apikey.create") ? (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  Create your first key
                </Button>
              ) : undefined
            }
          >
            Create a key when a bot or integration needs to talk to Westside. Give it only the scopes it needs.
          </EmptyState>
        ) : (
          <Panel>
            <table className="w-full text-left">
              <thead className="border-b bg-bg-subtle text-xs text-text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Key</th>
                  <th className="hidden w-56 px-3 py-2 font-medium lg:table-cell">Scopes</th>
                  <th className="hidden w-52 px-3 py-2 font-medium sm:table-cell">Activity</th>
                  <th className="hidden w-36 px-3 py-2 font-medium sm:table-cell">Status</th>
                  <th className="w-[9.5rem] px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.map((k) => {
                  const st = keyState(k);
                  const live = st.label === "Active";
                  return (
                    <tr key={k.id} className={live ? "" : "text-text-muted"}>
                      <td className="max-w-0 px-3 py-2.5">
                        <span className="block truncate font-medium">{k.name}</span>
                        <span className="block truncate font-mono text-xs text-text-muted">{k.keyPrefix}…</span>
                        <span className="mt-0.5 block text-xs sm:hidden">
                          <Status tone={st.tone}>{st.label}</Status>
                        </span>
                      </td>
                      <td className="hidden px-3 py-2.5 lg:table-cell">
                        {k.scopes.length === 0 ? (
                          <span className="text-text-muted">None</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {k.scopes.map((s) => (
                              <Tag key={s}>{s}</Tag>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="hidden px-3 py-2.5 text-[13px] text-text-muted sm:table-cell">
                        <span className="block">Created {formatDate(k.createdAt)}</span>
                        <span className="block">
                          {k.lastUsedAt ? `Used ${timeAgo(k.lastUsedAt)}` : "Never used"}
                        </span>
                      </td>
                      <td className="hidden px-3 py-2.5 sm:table-cell">
                        <Status tone={st.tone}>{st.label}</Status>
                        {k.expiresAt && live && (
                          <span className="mt-0.5 block text-xs text-text-muted">
                            Expires {formatDate(k.expiresAt)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {live && (
                          <span className="inline-flex gap-1.5">
                            {can("apikey.rotate") && (
                              <Button size="sm" onClick={() => setPending({ kind: "rotate", key: k })}>
                                Rotate
                              </Button>
                            )}
                            {can("apikey.revoke") && (
                              <Button size="sm" variant="danger" onClick={() => setPending({ kind: "revoke", key: k })}>
                                Revoke
                              </Button>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        )}
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New API key"
        description="The key is shown once, right after you create it."
      >
        <CreateKeyForm
          onClose={() => setCreating(false)}
          onCreated={(r) => {
            setCreating(false);
            setRevealed(r);
            reload();
          }}
        />
      </Modal>

      <ConfirmDialog
        open={!!pending}
        onClose={() => !busy && setPending(null)}
        onConfirm={confirm}
        busy={busy}
        title={pending?.kind === "revoke" ? `Revoke “${pending.key.name}”?` : `Rotate “${pending?.key.name}”?`}
        confirmLabel={pending?.kind === "revoke" ? "Revoke key" : "Rotate key"}
      >
        {pending?.kind === "revoke"
          ? "Anything using this key stops working immediately. This can't be undone."
          : "You'll get a new key and the current one stops working immediately. Update whatever uses it right after."}
      </ConfirmDialog>
    </>
  );
}

function CreateKeyForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (r: Revealed) => void;
}) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState("");
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    const expiresAt = expiry ? new Date(Date.now() + Number(expiry) * 86_400_000).toISOString() : undefined;
    const res = await apiFetch<{ secret: string }>("/api/v1/api-keys", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        scopes: scopes.split(/[\s,]+/).filter(Boolean),
        expiresAt,
      }),
    });
    setBusy(false);
    if (res.data) return onCreated({ name: name.trim(), secret: res.data.secret, verb: "created" });
    const fields = fieldErrors(res.error);
    if (Object.keys(fields).length) setErrors(fields);
    else setError(errorMessage(res.error));
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Name" error={errors.name} hint="Something that tells you where it's used, like erlc-bridge-prod.">
        {(p) => (
          <Input
            {...p}
            autoFocus
            required
            minLength={3}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <Field label="Scopes" optional error={errors.scopes} hint="Separate with commas or spaces, e.g. erlc.read radio.read.">
        {(p) => (
          <Input {...p} mono spellCheck={false} value={scopes} onChange={(e) => setScopes(e.target.value)} />
        )}
      </Field>
      <Field label="Expires" error={errors.expiresAt}>
        {(p) => (
          <select
            {...p}
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="h-8 w-full rounded border border-border-strong bg-surface px-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Create key
        </Button>
      </div>
    </form>
  );
}
