"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { Button, EmptyState, ListSkeleton, Notice, Panel } from "./ui";
import { apiFetch, errorMessage, type ApiErrorBody } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export interface LogEntry {
  id: string;
  time: string;
  /** Machine-readable event name, shown in mono. */
  event: string;
  /** Optional marker shown before the event name (e.g. severity). */
  lead?: React.ReactNode;
  target?: string;
  ip?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function LogTable({ entries, targetLabel }: { entries: LogEntry[]; targetLabel?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  // Some logs (security events) have nothing to put in a target column.
  const showTarget = entries.some((e) => e.target);
  const COLUMNS = showTarget
    ? "md:grid-cols-[10.5rem_minmax(0,1fr)_12rem_8rem_1rem]"
    : "md:grid-cols-[10.5rem_minmax(0,1fr)_8rem_1rem]";
  return (
    <Panel>
      <div
        className={`hidden grid-cols-1 gap-x-4 border-b bg-bg-subtle px-3 py-2 text-xs font-medium text-text-muted md:grid ${COLUMNS}`}
      >
        <span>Time</span>
        <span>Event</span>
        {showTarget && <span>{targetLabel ?? "Target"}</span>}
        <span>IP address</span>
        <span />
      </div>
      <ul className="divide-y">
        {entries.map((e) => {
          const hasMeta = !!e.metadata && Object.keys(e.metadata).length > 0;
          const expanded = open === e.id;
          const row = (
            <div className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 px-3 py-2 text-left ${COLUMNS}`}>
              <span className="order-2 whitespace-nowrap text-xs tabular-nums text-text-muted md:order-1 md:text-[13px]">
                {formatDateTime(e.time)}
              </span>
              <span className="order-1 flex min-w-0 items-center gap-2 md:order-2">
                {e.lead}
                <span className="truncate font-mono text-[13px]">{e.event}</span>
              </span>
              {showTarget && (
                <span className="order-3 col-span-2 truncate text-xs text-text-muted empty:hidden md:col-span-1 md:order-3 md:text-[13px]">
                  {e.target}
                </span>
              )}
              <span className="order-4 col-span-2 truncate font-mono text-xs text-text-muted empty:hidden md:col-span-1 md:order-4">
                {e.ip}
              </span>
              {hasMeta && (
                <span className="order-6 col-span-2 text-xs text-primary md:hidden">
                  {expanded ? "Hide details" : "View details"}
                </span>
              )}
              <span className="order-5 hidden justify-self-end text-text-faint md:block">
                {hasMeta && <Icon name="chevronDown" size={14} className={expanded ? "rotate-180" : ""} />}
              </span>
            </div>
          );
          return (
            <li key={e.id}>
              {hasMeta ? (
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : e.id)}
                  className="block w-full transition-colors hover:bg-surface-hover"
                >
                  {row}
                </button>
              ) : (
                row
              )}
              {hasMeta && expanded && (
                <pre className="mx-3 mb-3 overflow-x-auto rounded border bg-bg-subtle p-3 font-mono text-xs leading-5 text-text-muted">
                  {JSON.stringify(e.metadata, null, 2)}
                </pre>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/**
 * Newest-first log with "load older" paging. The API pages with `before=<id>`,
 * where ids grow over time.
 */
export function useLog<T>(path: string, idOf: (row: T) => string | number, pageSize = 100) {
  const [rows, setRows] = useState<T[]>([]);
  const [error, setError] = useState<ApiErrorBody | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const idRef = useRef(idOf);
  idRef.current = idOf;

  const load = useCallback(async () => {
    const res = await apiFetch<T[]>(`${path}?limit=${pageSize}`);
    if (res.error) setError(res.error);
    else {
      setError(null);
      setRows(res.data ?? []);
      setHasMore((res.data?.length ?? 0) >= pageSize);
    }
    setLoading(false);
  }, [path, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = useCallback(async () => {
    const last = rows[rows.length - 1];
    if (!last) return;
    setLoadingMore(true);
    const res = await apiFetch<T[]>(`${path}?limit=${pageSize}&before=${idRef.current(last)}`);
    setLoadingMore(false);
    if (res.error) return setError(res.error);
    setRows((prev) => [...prev, ...(res.data ?? [])]);
    setHasMore((res.data?.length ?? 0) >= pageSize);
  }, [rows, path, pageSize]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await load();
  }, [load]);

  return { rows, error, loading, loadingMore, hasMore, loadMore, refresh };
}

/** Standard body for a log page: loading, error, empty and the table with paging. */
export function LogBody<T>({
  log,
  entries,
  emptyTitle,
  emptyText,
  filtered,
  targetLabel,
}: {
  log: ReturnType<typeof useLog<T>>;
  entries: LogEntry[];
  emptyTitle: string;
  emptyText: string;
  /** True when a filter is active and hiding rows. */
  filtered: boolean;
  targetLabel?: string;
}) {
  if (log.loading) return <ListSkeleton rows={8} />;
  if (log.error && log.rows.length === 0) return <Notice tone="danger">{errorMessage(log.error)}</Notice>;
  if (log.rows.length === 0) return <EmptyState title={emptyTitle}>{emptyText}</EmptyState>;

  return (
    <div className="space-y-3">
      {log.error && <Notice tone="danger">{errorMessage(log.error)}</Notice>}
      {entries.length === 0 ? (
        <EmptyState title="Nothing matches">
          {filtered ? "No loaded entries match your filter. Try loading older entries." : emptyText}
        </EmptyState>
      ) : (
        <LogTable entries={entries} targetLabel={targetLabel} />
      )}
      <div className="flex items-center justify-between text-[13px] text-text-muted">
        <span>
          {entries.length === log.rows.length
            ? `${log.rows.length} loaded`
            : `${entries.length} of ${log.rows.length} loaded`}
        </span>
        {log.hasMore && (
          <Button size="sm" onClick={log.loadMore} loading={log.loadingMore}>
            Load older entries
          </Button>
        )}
      </div>
    </div>
  );
}
