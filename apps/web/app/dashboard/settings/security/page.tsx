"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  Button, ConfirmDialog, CopyButton, EmptyState, Field, Input, Modal, Notice, PageHeader, Panel, Section, Skeleton,
  Status, Tag,
} from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api";
import { describeUserAgent, formatDate, timeAgo } from "@/lib/format";
import { useMe, useSession } from "@/lib/session";
import { useApi } from "@/lib/use-api";

export default function SecuritySettingsPage() {
  return (
    <>
      <PageHeader title="Security" description="How you sign in, and where you're signed in." />
      <div className="max-w-2xl space-y-12">
        <TwoFactor />
        <Sessions />
      </div>
    </>
  );
}

/* ---------- Two-factor authentication ---------- */

interface Enrollment {
  uri: string;
  ticket: string;
}

/** The base32 secret inside an otpauth:// URI, grouped for reading aloud or typing. */
function manualKey(uri: string): string {
  try {
    const secret = new URL(uri).searchParams.get("secret") ?? "";
    return secret.replace(/(.{4})/g, "$1 ").trim();
  } catch {
    return "";
  }
}

function TwoFactor() {
  const me = useMe();
  const { reload } = useSession();
  const enabled = me.user.mfaEnabled;

  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [starting, setStarting] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setStarting(true);
    setError(null);
    const res = await apiFetch<Enrollment>("/api/v1/auth/mfa/enroll", { method: "POST" });
    setStarting(false);
    if (res.data) setEnrollment(res.data);
    else setError(errorMessage(res.error));
  }

  return (
    <Section title="Two-factor authentication">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="mb-1">
            <Status tone={enabled ? "ok" : "off"}>{enabled ? "On" : "Off"}</Status>
          </p>
          <p className="max-w-md text-text-muted">
            {enabled
              ? "Signing in asks for a 6-digit code from your authenticator app after your password."
              : "Ask for a 6-digit code from an authenticator app when you sign in, so a leaked password isn't enough."}
          </p>
        </div>
        {!enrollment &&
          (enabled ? (
            <Button variant="danger" onClick={() => setDisabling(true)}>
              Turn off
            </Button>
          ) : (
            <Button variant="primary" onClick={start} loading={starting}>
              Set up
            </Button>
          ))}
      </div>

      {error && (
        <div className="mt-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}

      {enrollment && (
        <Enroll
          enrollment={enrollment}
          onCancel={() => setEnrollment(null)}
          onDone={async () => {
            setEnrollment(null);
            await reload();
          }}
        />
      )}

      <Modal
        open={disabling}
        onClose={() => setDisabling(false)}
        title="Turn off two-factor authentication?"
        description="Confirm with your password and a current code."
      >
        <DisableForm
          onClose={() => setDisabling(false)}
          onDone={async () => {
            setDisabling(false);
            await reload();
          }}
        />
      </Modal>
    </Section>
  );
}

function Enroll({
  enrollment,
  onCancel,
  onDone,
}: {
  enrollment: Enrollment;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = manualKey(enrollment.uri);

  useEffect(() => {
    let live = true;
    QRCode.toString(enrollment.uri, { type: "svg", margin: 0, errorCorrectionLevel: "M" }).then(
      (s) => live && setSvg(s),
      () => live && setSvg(null),
    );
    return () => {
      live = false;
    };
  }, [enrollment.uri]);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiFetch("/api/v1/auth/mfa/confirm", {
      method: "POST",
      headers: { "X-Mfa-Ticket": enrollment.ticket },
      body: JSON.stringify({ code }),
    });
    setBusy(false);
    if (res.error) return setError(errorMessage(res.error));
    onDone();
  }

  return (
    <div className="mt-5 rounded-lg border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-5 sm:flex-row">
        {/* QR codes need a light background to scan, in either theme. */}
        <div className="h-[9.5rem] w-[9.5rem] shrink-0 rounded border bg-white p-2.5">
          {svg ? (
            <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <Skeleton className="h-full w-full bg-neutral-200" />
          )}
        </div>

        <form onSubmit={confirm} className="min-w-0 flex-1 space-y-4">
          <ol className="list-decimal space-y-1 pl-4 text-text-muted marker:text-text-faint">
            <li>Scan the code with an authenticator app such as 1Password, Authy or Google Authenticator.</li>
            <li>Enter the 6-digit code the app shows for Westside.</li>
          </ol>

          {key && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
              <span className="text-text-muted">Can&rsquo;t scan? Enter this key:</span>
              <Tag>{key}</Tag>
              <CopyButton value={key.replace(/\s/g, "")} />
            </div>
          )}

          {error && <Notice tone="danger">{error}</Notice>}

          <div className="flex items-end gap-2">
            <div className="w-36">
              <Field label="Code">
                {(p) => (
                  <Input
                    {...p}
                    mono
                    autoFocus
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="tracking-[0.25em]"
                  />
                )}
              </Field>
            </div>
            <Button type="submit" variant="primary" loading={busy} disabled={code.length !== 6}>
              Turn on
            </Button>
            <Button onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DisableForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiFetch("/api/v1/auth/mfa/disable", {
      method: "POST",
      body: JSON.stringify({ password, code }),
    });
    setBusy(false);
    if (res.error) return setError(errorMessage(res.error));
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Password">
        {(p) => (
          <Input
            {...p}
            type="password"
            autoFocus
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>
      <Field label="Authentication code">
        {(p) => (
          <Input
            {...p}
            mono
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-36 tracking-[0.25em]"
          />
        )}
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="dangerSolid" loading={busy} disabled={!password || code.length !== 6}>
          Turn off 2FA
        </Button>
      </div>
    </form>
  );
}

/* ---------- Sessions ---------- */

interface SessionRow {
  id: string;
  ip: string | null;
  userAgent: string | null;
  issuedAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

function Sessions() {
  const me = useMe();
  const router = useRouter();
  const { clear } = useSession();
  const { data, error, loading, reload } = useApi<SessionRow[]>("/api/v1/auth/sessions");
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busyAll, setBusyAll] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const sessions = (data ?? [])
    .filter((s) => !s.revokedAt)
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));

  async function revoke(id: string) {
    setRevoking(id);
    setActionError(null);
    const res = await apiFetch(`/api/v1/auth/sessions/${id}`, { method: "DELETE" });
    setRevoking(null);
    if (res.error) setActionError(errorMessage(res.error));
    else reload();
  }

  async function signOutEverywhere() {
    setBusyAll(true);
    const res = await apiFetch("/api/v1/auth/logout-all", { method: "POST" });
    if (res.error) {
      setBusyAll(false);
      setConfirmAll(false);
      return setActionError(errorMessage(res.error));
    }
    clear();
    router.replace("/login");
  }

  return (
    <Section
      title="Where you're signed in"
      action={
        sessions.length > 1 && (
          <Button size="sm" variant="danger" onClick={() => setConfirmAll(true)}>
            Sign out everywhere
          </Button>
        )
      }
    >
      <div className="space-y-3">
        {actionError && <Notice tone="danger">{actionError}</Notice>}
        {loading ? (
          <Panel>
            <div className="space-y-3 p-3" role="status" aria-label="Loading">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-36" />
            </div>
          </Panel>
        ) : error ? (
          <Notice tone="danger">{errorMessage(error)}</Notice>
        ) : sessions.length === 0 ? (
          <EmptyState title="No active sessions" />
        ) : (
          <Panel>
            <ul className="divide-y">
              {sessions.map((s) => {
                const current = s.id === me.sessionId;
                return (
                  <li key={s.id} className="flex items-center justify-between gap-4 px-3 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium">
                        {describeUserAgent(s.userAgent)}
                        {current && (
                          <span className="rounded border border-primary/40 px-1.5 text-xs font-normal text-primary">
                            This device
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[13px] text-text-muted">
                        {s.ip && <span className="font-mono text-xs">{s.ip}</span>}
                        {s.ip && " · "}
                        Active {timeAgo(s.lastSeenAt)} · Signed in {formatDate(s.issuedAt)}
                      </p>
                    </div>
                    {!current && (
                      <Button size="sm" onClick={() => revoke(s.id)} loading={revoking === s.id}>
                        Revoke
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}
      </div>

      <ConfirmDialog
        open={confirmAll}
        onClose={() => !busyAll && setConfirmAll(false)}
        onConfirm={signOutEverywhere}
        busy={busyAll}
        title="Sign out everywhere?"
        confirmLabel="Sign out everywhere"
      >
        This ends every session, including this one, and you&rsquo;ll need to sign in again on each device.
      </ConfirmDialog>
    </Section>
  );
}
