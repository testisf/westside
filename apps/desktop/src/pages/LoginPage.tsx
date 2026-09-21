import { useState } from "react";
import { tauriLogin, tauriLoginMfa, type LoginResult } from "../lib/tauri";
import { setAccessToken } from "../lib/api";

export function LoginPage({ onAuthed }: { onAuthed: () => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // MFA step state
  const [mfaTicket, setMfaTicket] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result: LoginResult = await tauriLogin(identifier, password);
      if (result.mfa_required && result.mfa_ticket) {
        setMfaTicket(result.mfa_ticket);
        setLoading(false);
        return;
      }
      setAccessToken(result.access_token);
      onAuthed();
    } catch (err) {
      const msg = String(err);
      if (msg.includes("AUTH_INVALID_CREDENTIALS")) {
        setError("Invalid email/username or password.");
      } else if (msg.includes("AUTH_ACCOUNT_LOCKED")) {
        setError("Account locked. Try again later.");
      } else if (msg.includes("NOT_IN_TAURI")) {
        setError("This must be run inside the Westside desktop app.");
      } else {
        setError(`Login failed: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaTicket) return;
    setLoading(true);
    setError(null);
    try {
      const result = await tauriLoginMfa(mfaTicket, mfaCode);
      setAccessToken(result.access_token);
      onAuthed();
    } catch (err) {
      const msg = String(err);
      if (msg.includes("AUTH_MFA_INVALID")) {
        setError("Invalid 6-digit code. Try again.");
      } else {
        setError(`MFA failed: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="bg-surface border border-border rounded-2xl p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">W</span>
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Westside</h1>
              <p className="text-xs text-text-muted">Desktop client</p>
            </div>
          </div>

          {!mfaTicket ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Email or username</label>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoFocus
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              {error && (
                <div className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground font-medium text-sm rounded-md py-2 px-4 transition"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Two-factor required</h2>
                <p className="text-xs text-text-muted mt-1">
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                required
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                autoFocus
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-lg font-mono tracking-[0.5em] text-center focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {error && (
                <div className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading || mfaCode.length !== 6}
                className="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground font-medium text-sm rounded-md py-2 px-4 transition"
              >
                {loading ? "Verifying…" : "Verify"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMfaTicket(null);
                  setError(null);
                  setMfaCode("");
                }}
                className="w-full text-xs text-text-muted hover:underline"
              >
                ← Back to login
              </button>
            </form>
          )}
        </div>
        <p className="text-center text-xs text-text-muted mt-4">
          Westside desktop · Phase 4
        </p>
      </div>
    </div>
  );
}
