import { useState } from "react";
import { tauriRegister, tauriVerifyEmail, tauriLogin } from "../lib/tauri";
import { setAccessToken } from "../lib/api";

export function RegisterPage({ onAuthed, onBack }: { onAuthed: () => void; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStatusMessage(null);

    try {
      const result = await tauriRegister(email, username, password);
      if (result.verification_url) {
        setStatusMessage("Account created. Verifying email...");
        try {
          const token = result.verification_url.split("token=")[1];
          if (token) {
            await tauriVerifyEmail(token);
            setStatusMessage("Email verified. Logging you in...");
          }
        } catch {
          setError("Account created, but email verification failed. Please login manually.");
          setLoading(false);
          return;
        }
      }
      setStatusMessage("Logging you in...");
      const loginResult = await tauriLogin(username, password);
      setAccessToken(loginResult.access_token);
      onAuthed();
    } catch (err) {
      const msg = String(err);
      if (msg.includes("AUTH_EMAIL_TAKEN")) {
        setError("An account with this email already exists.");
      } else if (msg.includes("AUTH_USERNAME_TAKEN")) {
        setError("An account with this username already exists.");
      } else if (msg.includes("AUTH_PASSWORD_TOO_WEAK")) {
        setError("Password must be at least 12 chars with 3 of: lowercase, uppercase, digit, symbol.");
      } else if (msg.includes("VALIDATION_FAILED")) {
        setError("Invalid email or username format.");
      } else if (msg.includes("NETWORK_ERROR")) {
        setError("Cannot connect to the server. Please check your connection.");
      } else {
        setError(`Registration failed: ${msg}`);
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
              <p className="text-xs text-text-muted">Create your account</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Username</label>
              <input type="text" required value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <p className="text-xs text-text-muted mt-1.5">Min 12 chars, including 3 of: lowercase, uppercase, digit, symbol.</p>
            </div>
            {error && (<div className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2">{error}</div>)}
            {statusMessage && (<div className="text-sm text-primary bg-primary/10 border border-primary/20 rounded-md px-3 py-2">{statusMessage}</div>)}
            <button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground font-medium text-sm rounded-md py-2 px-4 transition flex items-center justify-center gap-2">
              {loading ? (<><span className="inline-block h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin"></span>Creating account...</>) : ("Create account")}
            </button>
          </form>

          <div className="mt-6 text-sm text-text-muted text-center">
            Already have an account?{" "}
            <button onClick={onBack} className="text-primary hover:underline font-medium">Sign in</button>
          </div>
        </div>
        <p className="text-center text-xs text-text-muted mt-4">Westside desktop · Phase 4</p>
      </div>
    </div>
  );
}
