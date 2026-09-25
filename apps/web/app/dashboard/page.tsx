"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { LinkButton, Notice, PageHeader, Section, Status, statusTone, Tag, Dl, Dd, Dt, EmptyState, ListSkeleton, Panel } from "@/components/ui";
import { groupPermissions } from "@/lib/format";
import { useMe, useSession } from "@/lib/session";
import { useApi } from "@/lib/use-api";

interface Server {
  id: string;
  name: string;
  slug: string;
  status: string;
  isOwner: boolean;
}

export default function OverviewPage() {
  const me = useMe();
  const { can } = useSession();
  const servers = useApi<Server[]>("/api/v1/servers");

  const todo = [
    !me.user.emailVerified && {
      key: "email",
      tone: "warning" as const,
      title: "Your email address isn't verified",
      body: "Open the link we sent when you registered. Until then some actions may be blocked.",
    },
    !me.user.mfaEnabled && {
      key: "mfa",
      tone: "info" as const,
      title: "Two-factor authentication is off",
      body: "Add an authenticator app so a stolen password isn't enough to get into your account.",
      action: <LinkButton href="/dashboard/settings/security" size="sm">Set up 2FA</LinkButton>,
    },
  ].filter(Boolean) as {
    key: string;
    tone: "warning" | "info";
    title: string;
    body: string;
    action?: React.ReactNode;
  }[];

  const groups = groupPermissions(me.permissions);
  const list = servers.data ?? [];

  return (
    <>
      <PageHeader title="Overview" description="Your account, and the servers you belong to." />

      {todo.length > 0 && (
        <div className="mb-8 space-y-2">
          {todo.map((t) => (
            <Notice key={t.key} tone={t.tone} title={t.title} action={t.action}>
              {t.body}
            </Notice>
          ))}
        </div>
      )}

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Section
          title="Your servers"
          action={
            list.length > 0 && (
              <Link href="/dashboard/servers" className="text-[13px] text-primary hover:underline">
                View all
              </Link>
            )
          }
        >
          {servers.loading ? (
            <ListSkeleton rows={3} />
          ) : servers.error ? (
            <Notice tone="danger">{servers.error.message}</Notice>
          ) : list.length === 0 ? (
            <EmptyState
              title="You're not in any servers yet"
              action={
                can("server.create") ? (
                  <LinkButton href="/dashboard/servers" variant="primary">
                    Create a server
                  </LinkButton>
                ) : undefined
              }
            >
              A server is one ERLC community. Once an owner adds you, it shows up here.
            </EmptyState>
          ) : (
            <Panel>
              <ul className="divide-y">
                {list.slice(0, 6).map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/dashboard/servers/${s.id}`}
                      className="flex items-center justify-between gap-4 px-3 py-2.5 transition-colors hover:bg-surface-hover"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{s.name}</span>
                        <span className="block truncate font-mono text-xs text-text-muted">{s.slug}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-4 text-[13px] text-text-muted">
                        {s.isOwner && <span>Owner</span>}
                        <Status tone={statusTone(s.status)}>{s.status}</Status>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </Section>

        <div className="space-y-10">
          <Section title="Account">
            <Dl>
              <Dt>Email</Dt>
              <Dd>{me.user.email}</Dd>
              <Dt>Roles</Dt>
              <Dd>
                {me.roles.length ? (
                  <span className="flex flex-wrap gap-1">
                    {me.roles.map((r) => (
                      <Tag key={r}>{r}</Tag>
                    ))}
                  </span>
                ) : (
                  <span className="text-text-muted">None assigned</span>
                )}
              </Dd>
              <Dt>Verified</Dt>
              <Dd>
                <Status tone={me.user.emailVerified ? "ok" : "warn"}>
                  {me.user.emailVerified ? "Verified" : "Not verified"}
                </Status>
              </Dd>
              <Dt>2FA</Dt>
              <Dd>
                <Status tone={me.user.mfaEnabled ? "ok" : "off"}>{me.user.mfaEnabled ? "On" : "Off"}</Status>
              </Dd>
            </Dl>
          </Section>

          <Section title="Permissions">
            {groups.length === 0 ? (
              <p className="text-text-muted">
                No permissions yet. A server owner or administrator can assign you a role.
              </p>
            ) : (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-text-muted hover:text-text [&::-webkit-details-marker]:hidden">
                  <span>
                    {me.permissions.length} permissions across {groups.length} areas
                  </span>
                  <span className="flex items-center gap-1 text-[13px] text-primary">
                    <span className="group-open:hidden">Show</span>
                    <span className="hidden group-open:inline">Hide</span>
                    <Icon name="chevronDown" size={14} className="transition-transform group-open:rotate-180" />
                  </span>
                </summary>
                <dl className="mt-3 space-y-3 border-t pt-3">
                  {groups.map(([area, perms]) => (
                    <div key={area}>
                      <dt className="mb-1 font-mono text-xs text-text-muted">{area}</dt>
                      <dd className="flex flex-wrap gap-1">
                        {perms.map((p) => (
                          <Tag key={p}>{p.slice(area.length + 1)}</Tag>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
