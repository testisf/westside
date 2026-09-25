"use client";

import { useParams } from "next/navigation";
import {
  Dd, Dl, Dt, EmptyState, ListSkeleton, Notice, PageHeader, Panel, Section, Skeleton, Status, statusTone,
} from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useApi } from "@/lib/use-api";

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
}

interface Member {
  membershipId: string;
  userId: string;
  username: string;
  email: string;
  status: string;
  joinedAt: string;
  leftAt: string | null;
}

export default function ServerDetailPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const server = useApi<Server>(`/api/v1/servers/${serverId}`);
  const members = useApi<Member[]>(`/api/v1/servers/${serverId}/members`);

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

  return (
    <>
      <PageHeader
        title={s.name}
        description={s.description ?? undefined}
        back={{ href: "/dashboard/servers", label: "Servers" }}
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
          title="Members"
          action={members.data && <span className="text-[13px] text-text-muted">{active.length} active</span>}
          className="lg:col-start-1 lg:row-start-1"
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
                        <span className="block truncate text-xs text-text-muted">{m.email}</span>
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
    </>
  );
}
