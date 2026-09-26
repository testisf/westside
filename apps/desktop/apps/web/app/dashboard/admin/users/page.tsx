"use client";

import { useMemo, useState } from "react";
import { EmptyState, Input, ListSkeleton, NoAccess, Notice, PageHeader, Panel, Status, statusTone } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { formatDate, timeAgo } from "@/lib/format";
import { useApi } from "@/lib/use-api";

interface User {
  id: string;
  email: string | null;
  robloxUsername: string | null;
  username: string;
  status: string;
  emailVerified: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function AdminUsersPage() {
  const { data, error, loading } = useApi<User[]>("/api/v1/users?limit=100");
  const [query, setQuery] = useState("");

  const users = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (u) => !q || `${u.username} ${u.email ?? ""} ${u.robloxUsername ?? ""}`.toLowerCase().includes(q),
    );
  }, [data, query]);

  if (error?.code === "RBAC_FORBIDDEN") {
    return (
      <>
        <PageHeader title="Users" />
        <NoAccess what="The user list" />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Users" description="Every account on the platform." />

      {loading ? (
        <ListSkeleton rows={8} />
      ) : error ? (
        <Notice tone="danger">{errorMessage(error)}</Notice>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="w-full max-w-xs">
              <Input
                type="search"
                placeholder="Search by username or email"
                aria-label="Search users"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <p className="shrink-0 text-[13px] text-text-muted">
              {users.length === (data?.length ?? 0) ? `${users.length} users` : `${users.length} of ${data?.length}`}
            </p>
          </div>

          {users.length === 0 ? (
            <EmptyState title={query ? "No users match that search" : "No users yet"} />
          ) : (
            <Panel>
              <table className="w-full text-left">
                <thead className="border-b bg-bg-subtle text-xs text-text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">User</th>
                    <th className="w-28 px-3 py-2 font-medium">Status</th>
                    <th className="hidden w-32 px-3 py-2 font-medium md:table-cell">Verified</th>
                    <th className="hidden w-36 px-3 py-2 font-medium sm:table-cell">Last sign-in</th>
                    <th className="hidden w-32 px-3 py-2 font-medium lg:table-cell">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((u) => (
                    <tr key={u.id} className="transition-colors hover:bg-surface-hover">
                      <td className="max-w-0 px-3 py-2.5">
                        <span className="block truncate font-medium">{u.username}</span>
                        <span className="block truncate text-xs text-text-muted">{u.email ?? (u.robloxUsername ? `Roblox: ${u.robloxUsername}` : "—")}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Status tone={statusTone(u.status)}>{u.status}</Status>
                      </td>
                      <td className="hidden px-3 py-2.5 md:table-cell">
                        <Status tone={u.emailVerified ? "ok" : "warn"}>
                          {u.emailVerified ? "Verified" : "Unverified"}
                        </Status>
                      </td>
                      <td
                        className="hidden px-3 py-2.5 tabular-nums text-text-muted sm:table-cell"
                        title={u.lastLoginAt ?? undefined}
                      >
                        {timeAgo(u.lastLoginAt)}
                      </td>
                      <td className="hidden px-3 py-2.5 tabular-nums text-text-muted lg:table-cell">
                        {formatDate(u.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </>
      )}
    </>
  );
}
