import { useState } from "react";
import { Notice } from "../components/ui";
import { setAccessToken } from "../lib/api";
import { tauriLoginWithRoblox, type LoginResult } from "../lib/tauri";

function describeError(err: unknown): string {
  const msg = String(err instanceof Error ? err.message : err);
  if (msg.includes("ROBLOX_LOGIN_TIMEOUT")) return "That took too long and timed out. Try again.";
  if (msg.includes("ROBLOX_DENIED")) return "Sign-in was cancelled on Roblox.";
  if (msg.includes("ACCOUNT_UNAVAILABLE")) return "This account is disabled. Contact an administrator.";
  if (msg.includes("NETWORK_ERROR")) return "Can't reach Westside. Check your connection and try again.";
  if (msg.includes("NOT_IN_TAURI")) return "This screen only works inside the Westside desktop app.";
  return "Roblox sign-in failed. Try again.";
}

function RobloxIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5.164 3 3 18.836 18.836 21 21 5.164 5.164 3Zm7.373 6.514 4.111.581-.581 4.111-4.111-.581.581-4.111Z" />
    </svg>
  );
}

export function LoginPage({ onAuthed }: { onAuthed: () => void; onRegister?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function finish(result: LoginResult) {
    setAccessToken(result.access_token);
    onAuthed();
  }

  async function handleRobloxLogin() {
    setLoading(true);
    setError(null);
    try {
      finish(await tauriLoginWithRoblox());
    } catch (err) {
      setError(describeError(err));
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
          <h1 className="text-xl font-semibold leading-7">Sign in</h1>
          <p className="mt-1 text-text-muted">Westside accounts are created and secured through Roblox.</p>
          <div className="mt-6 space-y-4">
            {error && <Notice tone="danger">{error}</Notice>}
            <button
              type="button"
              onClick={handleRobloxLogin}
              disabled={loading}
              className="flex h-9 w-full items-center justify-center gap-2 rounded bg-[#000] text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <RobloxIcon />
              {loading ? "Waiting for Roblox…" : "Continue with Roblox"}
            </button>
            {loading && (
              <p className="text-center text-[13px] text-text-muted">
                Finish signing in in your browser, then come back here.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
