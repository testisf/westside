"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  Button, Dd, Dl, Dt, EmptyState, Field, Input, ListSkeleton, Modal, Notice, PageHeader, Panel, Section, Skeleton, Status, statusTone, Textarea,
} from "@/components/ui";
import { apiFetch, errorMessage, fieldErrors } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";

interface Server {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  robloxPlaceId: string | null;
  ownerId: string;
  status: string;
  isOwner: boolean;
  createdAt: string;
  // Listing / submission metadata
  privacyPolicyUrl: string | null;
  termsOfServiceUrl: string | null;
  entryLink: string | null;
  demoVideoUrl: string | null;
  categoryJustification: string | null;
}

interface Member {
  membershipId: string;
  userId: string;
  username: string;
  email: string | null;
  robloxUsername: string | null;
  status: string;
  joinedAt: string;
  leftAt: string | null;
}

export default function ServerDetailPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const server = useApi<Server>(`/api/v1/servers/${serverId}`);
  const members = useApi<Member[]>(`/api/v1/servers/${serverId}/members`);
  const [editingListing, setEditingListing] = useState(false);

  if (server.error) {
    const missing = server.error.code === "NOT_FOUND" || server.error.code === "RBAC_FORBIDDEN";
    return (
      <>
        <PageHeader title="Server" back={{ href: "/dashboard/servers", label: "Servers" }} />
        {missing ? (
          <EmptyState title="Server not found">
            It may have been removed, or you may not be a member of it.
          </EmptyState>
        ) : (
          <Notice tone="danger">{errorMessage(server.error)}</Notice>
        )}
      </>
    );
  }

  if (server.loading || !server.data) {
    return (
      <>
        <PageHeader title="Server" back={{ href: "/dashboard/servers", label: "Servers" }} />
        <Skeleton className="mb-3 h-4 w-64" />
        <Skeleton className="h-4 w-48" />
      </>
    );
  }

  const s = server.data;
  const active = (members.data ?? []).filter((m) => m.status === "active");
  const canManage = s.isOwner;

  return (
    <>
      <PageHeader
        title={s.name}
        description={s.description ?? undefined}
        back={{ href: "/dashboard/servers", label: "Servers" }}
        actions={
          canManage ? (
            <Button variant="secondary" size="sm" onClick={() => setEditingListing(true)}>
              Edit listing
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Section title="Details" className="lg:col-start-2 lg:row-start-1">
          <Dl>
            <Dt>Slug</Dt>
            <Dd>
              <span className="font-mono text-[13px]">{s.slug}</span>
            </Dd>
            <Dt>Status</Dt>
            <Dd>
              <Status tone={statusTone(s.status)}>{s.status}</Status>
            </Dd>
            <Dt>Your access</Dt>
            <Dd>{s.isOwner ? "Owner" : "Member"}</Dd>
            <Dt>Roblox place</Dt>
            <Dd>
              {s.robloxPlaceId ? (
                <span className="font-mono text-[13px]">{s.robloxPlaceId}</span>
              ) : (
                <span className="text-text-muted">Not linked</span>
              )}
            </Dd>
            <Dt>Created</Dt>
            <Dd>{formatDate(s.createdAt)}</Dd>
          </Dl>
        </Section>

        <Section
          title="Listing details"
          className="lg:col-start-1 lg:row-start-1"
          action={
            canManage ? (
              <Button variant="ghost" size="sm" onClick={() => setEditingListing(true)}>
                Edit
              </Button>
            ) : undefined
          }
        >
          <p className="mb-3 text-xs text-text-muted">
            Public metadata shown on the server&apos;s listing page.
          </p>
          <Dl>
            <Dt>Privacy Policy URL</Dt>
            <Dd>{renderUrl(s.privacyPolicyUrl)}</Dd>
            <Dt>Terms of Service URL</Dt>
            <Dd>{renderUrl(s.termsOfServiceUrl)}</Dd>
            <Dt>Entry Link</Dt>
            <Dd>{renderUrl(s.entryLink)}</Dd>
            <Dt>Demo Video URL</Dt>
            <Dd>{renderUrl(s.demoVideoUrl)}</Dd>
            <Dt>Category Justification</Dt>
            <Dd>
              {s.categoryJustification ? (
                <span className="text-[13px] leading-relaxed text-text">{s.categoryJustification}</span>
              ) : (
                <span className="text-text-muted">Not provided</span>
              )}
            </Dd>
          </Dl>
        </Section>

        <Section
          title="Members"
          action={members.data && <span className="text-[13px] text-text-muted">{active.length} active</span>}
          className="lg:col-start-1 lg:row-start-2"
        >
          {members.loading ? (
            <ListSkeleton rows={4} />
          ) : members.error ? (
            <Notice tone="danger">{errorMessage(members.error)}</Notice>
          ) : (
            <Panel>
              <table className="w-full text-left">
                <thead className="border-b bg-bg-subtle text-xs text-text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Member</th>
                    <th className="w-28 px-3 py-2 font-medium">Status</th>
                    <th className="hidden w-32 px-3 py-2 font-medium sm:table-cell">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(members.data ?? []).map((m) => (
                    <tr key={m.membershipId}>
                      <td className="max-w-0 px-3 py-2.5">
                        <span className="block truncate font-medium">
                          {m.username}
                          {m.userId === s.ownerId && (
                            <span className="ml-2 text-xs font-normal text-text-muted">Owner</span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-text-muted">{m.email ?? (m.robloxUsername ? `Roblox: ${m.robloxUsername}` : "—")}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Status tone={statusTone(m.status)}>{m.status}</Status>
                      </td>
                      <td className="hidden px-3 py-2.5 tabular-nums text-text-muted sm:table-cell">
                        {formatDate(m.joinedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </Section>
      </div>

      {canManage && (
        <EditListingDialog
          open={editingListing}
          onClose={() => setEditingListing(false)}
          server={s}
          onSaved={() => server.reload?.()}
        />
      )}
    </>
  );
}

function renderUrl(url: string | null | undefined) {
  if (!url) return <span className="text-text-muted">Not provided</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-[13px] text-primary hover:underline"
    >
      {url}
    </a>
  );
}

function EditListingDialog({
  open,
  onClose,
  server,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  server: Server;
  onSaved?: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Edit listing details" description="Public metadata shown on the server's listing page.">
      <EditListingForm server={server} onClose={onClose} onSaved={onSaved} />
    </Modal>
  );
}

function EditListingForm({
  server,
  onClose,
  onSaved,
}: {
  server: Server;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState(server.privacyPolicyUrl ?? "");
  const [termsOfServiceUrl, setTermsOfServiceUrl] = useState(server.termsOfServiceUrl ?? "");
  const [entryLink, setEntryLink] = useState(server.entryLink ?? "");
  const [demoVideoUrl, setDemoVideoUrl] = useState(server.demoVideoUrl ?? "");
  const [categoryJustification, setCategoryJustification] = useState(server.categoryJustification ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    const res = await apiFetch<Server>(`/api/v1/servers/${server.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        privacyPolicyUrl: privacyPolicyUrl.trim() || undefined,
        termsOfServiceUrl: termsOfServiceUrl.trim() || undefined,
        entryLink: entryLink.trim() || undefined,
        demoVideoUrl: demoVideoUrl.trim() || undefined,
        categoryJustification: categoryJustification.trim() || undefined,
      }),
    });
    if (res.data) {
      onSaved?.();
      onClose();
      return;
    }
    setBusy(false);
    if (Object.keys(fieldErrors(res.error)).length) setErrors(fieldErrors(res.error));
    else setError(errorMessage(res.error));
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Notice tone="danger">{error}</Notice>}
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
            rows={3}
            maxLength={2000}
            placeholder="e.g. Liberty County RP community with structured dispatch and CAD integration."
            value={categoryJustification}
            onChange={(e) => setCategoryJustification(e.target.value)}
          />
        )}
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}
