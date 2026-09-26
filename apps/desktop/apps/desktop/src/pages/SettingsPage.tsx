import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Icon } from "../components/icons";
import {
  Button, ConfirmDialog, CopyButton, Dd, Dl, Dt, EmptyState, Field, Input, Modal, Notice, PageHeader, Panel, Section, Skeleton, Status, Tag,
} from "../components/ui";
import { apiFetch, setAccessToken } from "../lib/api";
import { describeUserAgent, formatDate, timeAgo } from "../lib/format";
import { onPttEvent, tauriGetPttAccelerator, tauriLogout, tauriRegisterPtt, tauriSetPttAccelerator } from "../lib/tauri";

interface MeResponse {
  user: { id: string; email: string | null; username: string; mfaEnabled: boolean; robloxUsername: string | null };
}

export function SettingsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);

  async function loadMe() {
    const res = await apiFetch<MeResponse>("/api/v1/auth/me");
    if (res.data) setMe(res.data);
  }

  useEffect(() => {
    loadMe();
  }, []);

  return (
    <>
      <PageHeader title="Settings" description="Account, security, and hotkeys." />
      <div className="space-y-10">
        <AccountSection me={me} />
        <TwoFactor me={me} onChange={loadMe} />
        <Sessions />
        <Hotkey />
        <About />
      </div>
    </>
  );
}

/* ---------- Account ---------- */

function AccountSection({ me }: { me: MeResponse | null }) {
  return (
    <Section title="Account">
      {me ? (
        <Dl>
          <Dt>Username</Dt>
          <Dd>{me.user.username}</Dd>
          <Dt>Roblox</Dt>
          <Dd>{me.user.robloxUsername ?? <span className="text-text-muted">Not linked</span>}</Dd>
          {me.user.email && (
            <>
              <Dt>Email</Dt>
              <Dd>{me.user.email}</Dd>
            </>
          )}
        </Dl>
      ) : (
        <Skeleton className="h-4 w-48" />
      )}
    </Section>
  );
}

/* ---------- Two-factor authentication ---------- */

interface Enrollment {
  uri: string;
  ticket: string;
}

function manualKey(uri: string): string {
  try {
    return (new URL(uri).searchParams.get("secret") ?? "").replace(/(.{4})/g, "$1 ").trim();
  } catch {
    return "";
  }
}

function TwoFactor({ me, onChange }: { me: MeResponse | null; onChange: () => void }) {
  const enabled = !!me?.user.mfaEnabled;
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
    else setError(res.error?.message ?? "Couldn't start enrollment.");
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
          me &&
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
          onDone={() => {
            setEnrollment(null);
            onChange();
          }}
        />
      )}

      <Modal open={disabling} onClose={() => setDisabling(false)} title="Turn off two-factor authentication?" description="Confirm with your password and a current code.">
        <DisableForm
          onClose={() => setDisabling(false)}
          onDone={() => {
            setDisabling(false);
            onChange();
          }}
        />
      </Modal>
    </Section>
  );
}

function Enroll({ enrollment, onCancel, onDone }: { enrollment: Enrollment; onCancel: () => void; onDone: () => void }) {
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
    if (res.error) return setError(res.error.message);
    onDone();
  }

  return (
    <div className="mt-5 rounded-lg border bg-surface p-4">
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="h-[9rem] w-[9rem] shrink-0 rounded border bg-white p-2.5">
          {svg ? <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <Skeleton className="h-full w-full bg-neutral-200" />}
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
            <div className="w-32">
              <Field label="Code">
                {(p) => (
                  <Input {...p} mono autoFocus required inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="tracking-[0.25em]" />
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
    const res = await apiFetch("/api/v1/auth/mfa/disable", { method: "POST", body: JSON.stringify({ password, code }) });
    setBusy(false);
    if (res.error) return setError(res.error.message);
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Password">
        {(p) => <Input {...p} type="password" autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <Field label="Authentication code">
        {(p) => (
          <Input {...p} mono required inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="w-32 tracking-[0.25em]" />
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
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busyAll, setBusyAll] = useState(false);

  async function load() {
    const res = await apiFetch<SessionRow[]>("/api/v1/auth/sessions");
    if (res.error) setError(res.error.message);
    else {
      setError(null);
      setSessions((res.data ?? []).filter((s) => !s.revokedAt).sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt)));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function revoke(id: string) {
    setRevoking(id);
    const res = await apiFetch(`/api/v1/auth/sessions/${id}`, { method: "DELETE" });
    setRevoking(null);
    if (res.error) setError(res.error.message);
    else load();
  }

  async function signOutEverywhere() {
    setBusyAll(true);
    const res = await apiFetch("/api/v1/auth/logout-all", { method: "POST" });
    if (res.error) {
      setBusyAll(false);
      setConfirmAll(false);
      return setError(res.error.message);
    }
    try {
      await tauriLogout("");
    } catch {
      /* best-effort keychain cleanup */
    }
    setAccessToken(null);
    window.location.reload();
  }

  const list = sessions ?? [];

  return (
    <Section title="Where you're signed in" action={list.length > 1 && <Button size="sm" variant="danger" onClick={() => setConfirmAll(true)}>Sign out everywhere</Button>}>
      {error && (
        <div className="mb-3">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}
      {sessions === null ? (
        <Panel>
          <div className="space-y-3 p-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-36" />
          </div>
        </Panel>
      ) : list.length === 0 ? (
        <EmptyState title="No active sessions" />
      ) : (
        <Panel>
          <ul className="divide-y">
            {list.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 px-3 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">{describeUserAgent(s.userAgent)}</p>
                  <p className="mt-0.5 text-[13px] text-text-muted">
                    {s.ip && <span className="font-mono text-xs">{s.ip}</span>}
                    {s.ip && " · "}
                    Active {timeAgo(s.lastSeenAt)} · Signed in {formatDate(s.issuedAt)}
                  </p>
                </div>
                <Button size="sm" onClick={() => revoke(s.id)} loading={revoking === s.id}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <ConfirmDialog
        open={confirmAll}
        onClose={() => !busyAll && setConfirmAll(false)}
        onConfirm={signOutEverywhere}
        busy={busyAll}
        title="Sign out everywhere?"
        confirmLabel="Sign out everywhere"
      >
        This ends every session, including this device, and you&rsquo;ll need to sign in again.
      </ConfirmDialog>
    </Section>
  );
}

/* ---------- Push-to-talk ---------- */

function normalizeKey(key: string): string {
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

function Hotkey() {
  const [accelerator, setAccelerator] = useState("Control+Shift+Space");
  const [capturing, setCapturing] = useState(false);
  const [active, setActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    tauriGetPttAccelerator().then(setAccelerator).catch(() => {});
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      unlisten = (await onPttEvent((event) => setActive(event === "pressed"))) as unknown as () => void;
    })();
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1600);
    return () => clearTimeout(t);
  }, [saved]);

  function capture() {
    setCapturing(true);
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const mods: string[] = [];
      if (e.ctrlKey) mods.push("Control");
      if (e.shiftKey) mods.push("Shift");
      if (e.altKey) mods.push("Alt");
      if (e.metaKey) mods.push("Super");
      if (!mods.length) return;
      setAccelerator([...mods, normalizeKey(e.key)].join("+"));
      setCapturing(false);
      window.removeEventListener("keydown", handler, true);
    };
    window.addEventListener("keydown", handler, true);
  }

  async function save() {
    setSaving(true);
    try {
      await tauriSetPttAccelerator(accelerator);
      await tauriRegisterPtt(accelerator);
      setSaved(true);
    } catch {
      /* not running inside Tauri */
    }
    setSaving(false);
  }

  return (
    <Section title="Push-to-talk hotkey">
      <p className="mb-3 max-w-md text-text-muted">Global hotkey, works even when Westside is in the background. Radio transmission arrives in a later release.</p>
      <div className="flex items-center gap-2">
        <Input mono readOnly={!capturing} value={capturing ? "Press a key combination…" : accelerator} onChange={() => {}} className="max-w-xs" />
        <Button onClick={capture} disabled={capturing}>
          <Icon name="keyboard" size={14} />
          {capturing ? "Listening…" : "Capture"}
        </Button>
        <Button variant="primary" onClick={save} loading={saving}>
          {saved ? "Saved" : "Save"}
        </Button>
      </div>
      <p className="mt-3 text-[13px] text-text-muted">
        Status: <Status tone={active ? "ok" : "off"}>{active ? "Pressed" : "Idle"}</Status>
      </p>
    </Section>
  );
}

/* ---------- About ---------- */

function About() {
  return (
    <Section title="About">
      <Dl>
        <Dt>App</Dt>
        <Dd>Westside Desktop</Dd>
        <Dt>Credentials</Dt>
        <Dd>Stored in your OS keychain</Dd>
      </Dl>
    </Section>
  );
}
