import { useMemo, useState } from "react";
import { Icon } from "../components/icons";
import { Button, Field, Input, Notice } from "../components/ui";
import { tauriRegister, tauriVerifyEmail, tauriLogin } from "../lib/tauri";
import { setAccessToken } from "../lib/api";

function passwordChecks(pw: string) {
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(pw)).length;
  return [
    { ok: pw.length >= 12, label: "At least 12 characters" },
    { ok: classes >= 3, label: "3 of: lowercase, uppercase, number, symbol" },
    { ok: pw.length > 0 && !/\s/.test(pw), label: "No spaces" },
  ];
}

export function RegisterPage({ onAuthed, onBack }: { onAuthed: () => void; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const checks = useMemo(() => passwordChecks(password), [password]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStatus(null);

    try {
      const result = await tauriRegister(email.trim(), username.trim(), password);
      // In development the API returns the verification link directly rather
      // than emailing it, so we can complete verification without leaving the app.
      if (result.verification_url) {
        setStatus("Account created — verifying your email…");
        const token = result.verification_url.split("token=")[1];
        if (token) {
          try {
            await tauriVerifyEmail(token);
          } catch {
            setError("Account created, but automatic verification failed. Sign in and verify from there.");
            setLoading(false);
            return;
          }
        }
      }
      setStatus("Signing you in…");
      setAccessToken((await tauriLogin(username.trim(), password)).access_token);
      onAuthed();
    } catch (err) {
      const msg = String(err);
      if (msg.includes("AUTH_EMAIL_TAKEN")) setError("An account with this email already exists.");
      else if (msg.includes("AUTH_USERNAME_TAKEN")) setError("That username is already taken.");
      else if (msg.includes("AUTH_PASSWORD_TOO_WEAK")) setError("Choose a stronger password — see the checklist below.");
      else if (msg.includes("VALIDATION_FAILED")) setError("Check your email and username and try again.");
      else if (msg.includes("NETWORK_ERROR")) setError("Can't reach Westside. Check your connection and try again.");
      else setError("Something went wrong. Try again.");
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
          <h1 className="text-xl font-semibold leading-7">Create an account</h1>
          <p className="mt-1 text-text-muted">You&rsquo;ll join servers and get access from a server owner.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && <Notice tone="danger">{error}</Notice>}
            {status && !error && <Notice tone="info">{status}</Notice>}
            <Field label="Email">
              {(p) => <Input {...p} type="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Field>
            <Field label="Username">
              {(p) => <Input {...p} type="text" required autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />}
            </Field>
            <Field label="Password">
              {(p) => (
                <>
                  <Input {...p} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  <ul className="mt-2 space-y-0.5 text-xs" aria-live="polite">
                    {checks.map((c) => (
                      <li key={c.label} className={`flex items-center gap-1.5 ${c.ok ? "text-success" : "text-text-muted"}`}>
                        {c.ok ? (
                          <Icon name="check" size={12} />
                        ) : (
                          <span className="flex h-3 w-3 items-center justify-center" aria-hidden="true">
                            <span className="h-1 w-1 rounded-full bg-text-faint" />
                          </span>
                        )}
                        {c.label}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Field>
            <Button type="submit" variant="primary" loading={loading} className="w-full">
              {loading ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 border-t pt-4 text-text-muted">
            Already registered?{" "}
            <button onClick={onBack} className="text-primary hover:underline">
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
