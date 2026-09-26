import { useState } from "react";
import { Icon } from "../components/icons";
import { Button, Field, Input, Notice } from "../components/ui";
import { tauriLogin, tauriLoginMfa, type LoginResult } from "../lib/tauri";
import { setAccessToken } from "../lib/api";

/** Maps the error text an invoke rejection carries to something worth reading. */
function describeError(err: unknown): string {
  const msg = String(err);
  if (msg.includes("AUTH_INVALID_CREDENTIALS")) return "Invalid email, username, or password.";
  if (msg.includes("AUTH_ACCOUNT_LOCKED")) return "This account is temporarily locked. Try again later.";
  if (msg.includes("RATE_LIMITED")) return "Too many attempts. Wait a few minutes and try again.";
  if (msg.includes("NETWORK_ERROR")) return "Can't reach Westside. Check your connection and try again.";
  if (msg.includes("NOT_IN_TAURI")) return "This screen only works inside the Westside desktop app.";
  return "Something went wrong. Try again.";
}

export function LoginPage({ onAuthed, onRegister }: { onAuthed: () => void; onRegister: () => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfaTicket, setMfaTicket] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  function finish(result: LoginResult) {
    setAccessToken(result.access_token);
    onAuthed();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await tauriLogin(identifier.trim(), password);
      if (result.mfa_required && result.mfa_ticket) {
        setMfaTicket(result.mfa_ticket);
        setLoading(false);
        return;
      }
      finish(result);
    } catch (err) {
      setError(describeError(err));
      setLoading(false);
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaTicket) return;
    setLoading(true);
    setError(null);
    try {
      finish(await tauriLoginMfa(mfaTicket, mfaCode));
    } catch (err) {
      const msg = String(err);
      setError(msg.includes("AUTH_MFA_INVALID") ? "That code didn't work. Try again." : describeError(err));
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2.5 px-4" data-tauri-drag-region>
        <span className="flex h-6 w-6 items-center justify-center rounded bg-primary text-[13px] font-semibold leading-none text-primary-foreground" aria-hidden="true">
          W
        </span>
        <span className="text-sm font-semibold tracking-tight">Westside</span>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-[20rem]">
          {mfaTicket ? (
            <>
              <h1 className="text-xl font-semibold leading-7">Enter your code</h1>
              <p className="mt-1 text-text-muted">Open your authenticator app and enter the 6-digit code for Westside.</p>
              <form onSubmit={handleMfaSubmit} className="mt-6 space-y-4">
                {error && <Notice tone="danger">{error}</Notice>}
                <Field label="Authentication code">
                  {(p) => (
                    <Input
                      {...p}
                      mono
                      autoFocus
                      required
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="123456"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="tracking-[0.3em]"
                    />
                  )}
                </Field>
                <Button type="submit" variant="primary" loading={loading} disabled={mfaCode.length !== 6} className="w-full">
                  Verify and sign in
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setMfaTicket(null);
                    setError(null);
                    setMfaCode("");
                  }}
                  className="flex w-full items-center justify-center gap-1 text-[13px] text-text-muted hover:text-text"
                >
                  <Icon name="arrowLeft" size={14} />
                  Back to sign in
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold leading-7">Sign in</h1>
              <p className="mt-1 text-text-muted">Use the email or username you registered with.</p>
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {error && <Notice tone="danger">{error}</Notice>}
                <Field label="Email or username">
                  {(p) => (
                    <Input {...p} type="text" autoFocus required autoCapitalize="none" spellCheck={false} value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
                  )}
                </Field>
                <Field label="Password">
                  {(p) => (
                    <div className="relative">
                      <Input
                        {...p}
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pr-14"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute inset-y-0 right-0 px-2.5 text-xs text-text-muted hover:text-text"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  )}
                </Field>
                <Button type="submit" variant="primary" loading={loading} className="w-full">
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>
              <p className="mt-6 border-t pt-4 text-text-muted">
                New to Westside?{" "}
                <button onClick={onRegister} className="text-primary hover:underline">
                  Create an account
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
