"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface AuditLog {
  logId: number;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await apiFetch<AuditLog[]>("/api/v1/admin/audit-logs?limit=100");
      if (res.error) setError(res.error.message);
      else setLogs(res.data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="p-6 text-text-muted text-sm">Loading audit logs…</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-1">Audit Logs</h1>
      <p className="text-sm text-text-muted mb-6">Append-only record of administrative actions.</p>

      {error && (
        <div className="mb-4 text-sm text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {logs.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center text-sm text-text-muted">
          No audit entries yet.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl divide-y divide-border">
          {logs.map((log) => (
            <div key={log.logId} className="p-4 text-sm">
              <div className="flex items-center justify-between gap-2 mb-1">
                <code className="font-mono text-xs text-primary">{log.action}</code>
                <span className="text-xs text-text-muted">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="text-xs text-text-muted">
                {log.targetType && <span>{log.targetType}</span>}
                {log.targetId && <span className="font-mono"> · {log.targetId.slice(0, 8)}…</span>}
                {log.ip && <span> · {log.ip}</span>}
              </div>
              {log.metadata && Object.keys(log.metadata).length > 0 && (
                <pre className="mt-2 text-xs text-text-muted bg-bg-subtle border border-border rounded p-2 overflow-x-auto">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
