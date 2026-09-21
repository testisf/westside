"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface SecurityEvent {
  eventId: number;
  eventType: string;
  severity: string;
  userId: string | null;
  ip: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  info: "bg-bg-muted text-text-muted",
  warn: "bg-warning/10 text-warning",
  critical: "bg-danger/10 text-danger",
};

export default function SecurityPage() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await apiFetch<SecurityEvent[]>("/api/v1/admin/security-events?limit=100");
      if (res.error) setError(res.error.message);
      else setEvents(res.data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="p-6 text-text-muted text-sm">Loading security events…</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-1">Security Events</h1>
      <p className="text-sm text-text-muted mb-6">
        Real-time stream of authentication failures, rate-limit hits, suspicious requests, and refresh-token reuse.
      </p>

      {error && (
        <div className="mb-4 text-sm text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {events.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center text-sm text-text-muted">
          No security events recorded yet.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl divide-y divide-border">
          {events.map((e) => (
            <div key={e.eventId} className="p-4 text-sm flex items-start gap-3">
              <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${SEVERITY_COLORS[e.severity] ?? ""}`}>
                {e.severity}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-xs text-primary">{e.eventType}</code>
                  <span className="text-xs text-text-muted">{new Date(e.createdAt).toLocaleString()}</span>
                </div>
                <div className="text-xs text-text-muted mt-1">
                  {e.ip && <span>{e.ip}</span>}
                </div>
                {e.metadata && Object.keys(e.metadata).length > 0 && (
                  <pre className="mt-2 text-xs text-text-muted bg-bg-subtle border border-border rounded p-2 overflow-x-auto">
                    {JSON.stringify(e.metadata, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
