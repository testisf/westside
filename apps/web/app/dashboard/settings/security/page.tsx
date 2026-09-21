"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface EnrollResponse {
  uri: string;
  ticket: string;
}

export default function SecuritySettingsPage() {
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  // Enrollment state
  const [enrollUri, setEnrollUri] = useState<string | null>(null);
  const [enrollTicket, setEnrollTicket] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Disable state
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [showDisable, setShowDisable] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await apiFetch<{ user: { mfaEnabled: boolean } }>("/api/v1/auth/me");
      if (res.data) setMfaEnabled(res.data.user.mfaEnabled);
      setLoading(false);
    })();
  }, []);

  async function handleEnroll() {
    setBusy(true); setError(null);
    const res = await apiFetch<EnrollResponse>("/api/v1/auth/mfa/enroll", { method: "POST" });
    setBusy(false);
    if (res.error || !res.data) { setError(res.error?.message ?? "Enrollment failed"); return; }
    setEnrollUri(res.data.uri);
    setEnrollTicket(res.data.ticket);
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!enrollTicket) return;
    setBusy(true); setError(null);
    const res = await apiFetch<{ enabled: boolean }>("/api/v1/auth/mfa/confirm", {
      method: "POST",
      headers: { "X-Mfa-Ticket": enrollTicket },
      body: JSON.stringify({ code }),
    });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    setMfaEnabled(true);
    setEnrollUri(null);
    setEnrollTicket(null);
    setCode("");
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await apiFetch<{ disabled: boolean }>("/api/v1/auth/mfa/disable", {
      method: "POST",
      body: JSON.stringify({ password: disablePassword, code: disableCode }),
    });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    setMfaEnabled(false);
    setDisablePassword(""); setDisableCode(""); setShowDisable(false);
  }

  if (loading) return <div className="p-6 text-text-muted text-sm">Loading…</div>;

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-1">Security</h1>
      <p className="text-sm text-text-muted mb-6">Two-factor authentication and account security.</p>

      {error && (
        <div className="mb-4 text-sm text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="font-semibold text-sm">Two-factor authentication (TOTP)</h2>
            <p className="text-xs text-text-muted mt-1">
              {mfaEnabled
                ? "Enabled — a 6-digit code is required on every login."
                : "Not enabled — add an extra layer of security to your account."}
            </p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded ${
            mfaEnabled ? "bg-success/10 text-success" : "bg-bg-muted text-text-muted"
          }`}>
            {mfaEnabled ? "On" : "Off"}
          </span>
        </div>

        {!mfaEnabled && !enrollUri && (
          <button onClick={handleEnroll} disabled={busy}
            className="mt-3 bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-md px-4 py-2">
            {busy ? "Starting…" : "Start enrollment"}
          </button>
        )}

        {enrollUri && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-text-muted">
              Scan this URI with your authenticator app (Google Authenticator, Authy, 1Password, etc.),
              then enter the 6-digit code it shows.
            </p>
            <code className="block text-xs bg-bg border border-border rounded p-2 break-all font-mono">
              {enrollUri}
            </code>
            <form onSubmit={handleConfirm} className="flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="w-32 rounded-md border border-border bg-bg px-3 py-2 text-sm font-mono" />
              <button type="submit" disabled={busy}
                className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-md px-4 py-2">
                Confirm
              </button>
            </form>
          </div>
        )}

        {mfaEnabled && !showDisable && (
          <button onClick={() => setShowDisable(true)}
            className="mt-3 text-sm border border-danger/30 text-danger rounded-md px-4 py-2 hover:bg-danger/10">
            Disable 2FA
          </button>
        )}

        {mfaEnabled && showDisable && (
          <form onSubmit={handleDisable} className="mt-4 space-y-3">
            <p className="text-xs text-text-muted">Enter your password and a current 6-digit code to disable 2FA.</p>
            <input type="password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)}
              placeholder="Password" required
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm" />
            <input value={disableCode} onChange={(e) => setDisableCode(e.target.value)}
              placeholder="123456" required
              className="w-32 rounded-md border border-border bg-bg px-3 py-2 text-sm font-mono" />
            <div className="flex gap-2">
              <button type="submit" disabled={busy}
                className="bg-danger text-white text-sm font-medium rounded-md px-4 py-2 hover:opacity-90 disabled:opacity-50">
                {busy ? "Disabling…" : "Confirm disable"}
              </button>
              <button type="button" onClick={() => setShowDisable(false)}
                className="text-sm border border-border rounded-md px-4 py-2">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
