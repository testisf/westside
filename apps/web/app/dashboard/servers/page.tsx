"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import {
  Button, EmptyState, Field, Input, ListSkeleton, Modal, Notice, PageHeader, Panel, Status, statusTone, Textarea,
} from "@/components/ui";
import { apiFetch, errorMessage, fieldErrors } from "@/lib/api";
import { formatDate, slugify } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/use-api";

interface Server {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  isOwner: boolean;
  createdAt: string;
}

export default function ServersPage() {
  const { can } = useSession();
  const { data, error, loading } = useApi<Server[]>("/api/v1/servers");
  const [creating, setCreating] = useState(false);
  const canCreate = can("server.create");

  const newServer = canCreate && (
    <Button variant="primary" onClick={() => setCreating(true)}>
      <Icon name="plus" size={14} />
      New server
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Servers"
        description="Each server is one ERLC community you own or belong to."
        actions={newServer || undefined}
      />

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <Notice tone="danger">{errorMessage(error)}</Notice>
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="No servers yet"
          action={newServer || undefined}
        >
          {canCreate
            ? "Create one for your community, or ask its owner to add you to theirs."
            : "Ask a server owner to add you to their community."}
        </EmptyState>
      ) : (
        <Panel>
          <table className="w-full text-left">
            <thead className="border-b bg-bg-subtle text-xs text-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Server</th>
                <th className="hidden w-28 px-3 py-2 font-medium sm:table-cell">Access</th>
                <th className="w-32 px-3 py-2 font-medium">Status</th>
                <th className="hidden w-36 px-3 py-2 font-medium md:table-cell">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((s) => (
                <tr key={s.id} className="transition-colors hover:bg-surface-hover">
                  <td className="max-w-0 px-3 py-2.5">
                    <Link href={`/dashboard/servers/${s.id}`} className="block truncate font-medium text-primary hover:underline">
                      {s.name}
                    </Link>
                    <span className="block truncate font-mono text-xs text-text-muted">{s.slug}</span>
                  </td>
                  <td className="hidden px-3 py-2.5 text-text-muted sm:table-cell">
                    {s.isOwner ? "Owner" : "Member"}
                  </td>
                  <td className="px-3 py-2.5">
                    <Status tone={statusTone(s.status)}>{s.status}</Status>
                  </td>
                  <td className="hidden px-3 py-2.5 tabular-nums text-text-muted md:table-cell">
                    {formatDate(s.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <CreateServerDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function CreateServerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="New server" description="You'll be the owner and can invite others afterwards.">
      <CreateServerForm onClose={onClose} />
    </Modal>
  );
}

function CreateServerForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  // Listing / submission metadata — all optional, can be filled in later from
  // the server detail page.
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState("");
  const [termsOfServiceUrl, setTermsOfServiceUrl] = useState("");
  const [entryLink, setEntryLink] = useState("");
  const [demoVideoUrl, setDemoVideoUrl] = useState("");
  const [categoryJustification, setCategoryJustification] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    const res = await apiFetch<Server>("/api/v1/servers", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        slug,
        description: description.trim() || undefined,
        privacyPolicyUrl: privacyPolicyUrl.trim() || undefined,
        termsOfServiceUrl: termsOfServiceUrl.trim() || undefined,
        entryLink: entryLink.trim() || undefined,
        demoVideoUrl: demoVideoUrl.trim() || undefined,
        categoryJustification: categoryJustification.trim() || undefined,
      }),
    });
    if (res.data) {
      onClose();
      router.push(`/dashboard/servers/${res.data.id}`);
      return;
    }
    setBusy(false);
    if (res.error?.code === "CONFLICT") setErrors({ slug: "That slug is already taken." });
    else if (Object.keys(fieldErrors(res.error)).length) setErrors(fieldErrors(res.error));
    else setError(errorMessage(res.error));
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Name" error={errors.name}>
        {(p) => (
          <Input
            {...p}
            autoFocus
            required
            minLength={3}
            maxLength={120}
            placeholder="Liberty County Roleplay"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugEdited) setSlug(slugify(e.target.value));
            }}
          />
        )}
      </Field>
      <Field label="Slug" error={errors.slug} hint="Used in links. Lowercase letters, numbers and hyphens.">
        {(p) => (
          <Input
            {...p}
            mono
            required
            minLength={3}
            maxLength={60}
            pattern="[a-z0-9\-]+"
            spellCheck={false}
            value={slug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value.toLowerCase());
            }}
          />
        )}
      </Field>
      <Field label="Description" optional error={errors.description}>
        {(p) => (
          <Textarea
            {...p}
            rows={3}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        )}
      </Field>

      {/* ----- Listing / submission metadata ----- */}
      <div className="rounded border border-border bg-bg-subtle/40 p-3">
        <div className="mb-2 text-[13px] font-semibold text-text">Listing details</div>
        <p className="mb-3 text-xs text-text-muted">
          Shown on the server&apos;s public listing. All optional — you can fill these in later.
        </p>
        <div className="space-y-4">
          <Field label="Privacy Policy URL" optional error={errors.privacyPolicyUrl} hint="https://…">
            {(p) => (
              <Input
                {...p}
                type="url"
                inputMode="url"
                placeholder="https://example.com/privacy"
                value={privacyPolicyUrl}
                onChange={(e) => setPrivacyPolicyUrl(e.target.value)}
              />
            )}
          </Field>
          <Field label="Terms of Service URL" optional error={errors.termsOfServiceUrl} hint="https://…">
            {(p) => (
              <Input
                {...p}
                type="url"
                inputMode="url"
                placeholder="https://example.com/terms"
                value={termsOfServiceUrl}
                onChange={(e) => setTermsOfServiceUrl(e.target.value)}
              />
            )}
          </Field>
          <Field label="Entry Link" optional error={errors.entryLink} hint="Where new members go to join.">
            {(p) => (
              <Input
                {...p}
                type="url"
                inputMode="url"
                placeholder="https://roblox.com/groups/…"
                value={entryLink}
                onChange={(e) => setEntryLink(e.target.value)}
              />
            )}
          </Field>
          <Field label="Demo Video URL" optional error={errors.demoVideoUrl} hint="YouTube, Loom, etc.">
            {(p) => (
              <Input
                {...p}
                type="url"
                inputMode="url"
                placeholder="https://www.youtube.com/watch?v=…"
                value={demoVideoUrl}
                onChange={(e) => setDemoVideoUrl(e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Category Justification"
            optional
            error={errors.categoryJustification}
            hint="Why this server belongs in its category."
          >
            {(p) => (
              <Textarea
                {...p}
                rows={2}
                maxLength={2000}
                placeholder="e.g. Liberty County RP community with structured dispatch and CAD integration."
                value={categoryJustification}
                onChange={(e) => setCategoryJustification(e.target.value)}
              />
            )}
          </Field>
        </div>
      </div>

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
