"use client";

import { useMemo, useState } from "react";
import { LogBody, useLog, type LogEntry } from "@/components/LogTable";
import { Icon } from "@/components/icons";
import { Button, NoAccess, PageHeader, Segmented, Status } from "@/components/ui";

interface SecurityEvent {
  eventId: number | string;
  eventType: string;
  severity: "info" | "warn" | "critical" | string;
  ip: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

type Filter = "all" | "warn" | "critical";

const SEVERITY = {
  info: { tone: "off", label: "Info" },
  warn: { tone: "warn", label: "Warning" },
  critical: { tone: "bad", label: "Critical" },
} as const;

export default function SecurityEventsPage() {
  const log = useLog<SecurityEvent>("/api/v1/admin/security-events", (r) => String(r.eventId));
  const [filter, setFilter] = useState<Filter>("all");

  const entries = useMemo<LogEntry[]>(
    () =>
      log.rows
        .filter((r) => filter === "all" || (filter === "critical" ? r.severity === "critical" : r.severity !== "info"))
        .map((r) => {
          const sev = SEVERITY[r.severity as keyof typeof SEVERITY] ?? SEVERITY.info;
          return {
            id: String(r.eventId),
            time: r.createdAt,
            event: r.eventType,
            lead: (
              <span className="w-[4.75rem] shrink-0 text-xs">
                <Status tone={sev.tone}>{sev.label}</Status>
              </span>
            ),
            ip: r.ip,
            metadata: r.metadata,
          };
        }),
    [log.rows, filter],
  );

  if (log.error?.code === "RBAC_FORBIDDEN") {
    return (
      <>
        <PageHeader title="Security events" />
        <NoAccess what="Security events" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Security events"
        description="Failed sign-ins, rate-limit hits, suspicious requests and refresh-token reuse."
        actions={
          <Button onClick={log.refresh} disabled={log.loading}>
            <Icon name="rotate" size={14} />
            Refresh
          </Button>
        }
      />
      <div className="mb-3">
        <Segmented<Filter>
          label="Severity"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "warn", label: "Warnings and up" },
            { value: "critical", label: "Critical" },
          ]}
        />
      </div>
      <LogBody
        log={log}
        entries={entries}
        filtered={filter !== "all"}
        emptyTitle="No security events recorded"
        emptyText="That's the good outcome. Anything suspicious will show up here."
      />
    </>
  );
}
