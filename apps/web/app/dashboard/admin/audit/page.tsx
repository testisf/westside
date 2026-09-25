"use client";

import { useMemo, useState } from "react";
import { LogBody, useLog, type LogEntry } from "@/components/LogTable";
import { Icon } from "@/components/icons";
import { Button, Input, NoAccess, PageHeader } from "@/components/ui";

interface AuditLog {
  logId: number | string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export default function AuditPage() {
  const log = useLog<AuditLog>("/api/v1/admin/audit-logs", (r) => String(r.logId));
  const [query, setQuery] = useState("");

  const entries = useMemo<LogEntry[]>(() => {
    const q = query.trim().toLowerCase();
    return log.rows
      .map((r) => ({
        id: String(r.logId),
        time: r.createdAt,
        event: r.action,
        target: [r.targetType, r.targetId ? r.targetId.slice(0, 8) : null].filter(Boolean).join(" · "),
        ip: r.ip,
        metadata: r.metadata,
      }))
      .filter((e) => !q || `${e.event} ${e.target} ${e.ip ?? ""}`.toLowerCase().includes(q));
  }, [log.rows, query]);

  if (log.error?.code === "RBAC_FORBIDDEN") {
    return (
      <>
        <PageHeader title="Audit log" />
        <NoAccess what="The audit log" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Append-only record of who changed what. Select a row to see its details."
        actions={
          <Button onClick={log.refresh} disabled={log.loading}>
            <Icon name="rotate" size={14} />
            Refresh
          </Button>
        }
      />
      <div className="mb-3 max-w-xs">
        <Input
          type="search"
          placeholder="Filter by action, target or IP"
          aria-label="Filter audit log"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <LogBody
        log={log}
        entries={entries}
        filtered={query.trim() !== ""}
        emptyTitle="No audit entries yet"
        emptyText="Actions like signing in, changing roles and creating servers will appear here."
      />
    </>
  );
}
