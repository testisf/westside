"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthLayout } from "@/components/AuthLayout";
import { Icon } from "@/components/icons";
import { Button, Field, Input, LinkButton, Notice } from "@/components/ui";
import { apiFetch, errorMessage, fieldErrors } from "@/lib/api";
import { useSession } from "@/lib/session";

interface RegisterPayload {
  userId: string;
  email: string;
  username: string;
  verificationUrl?: string | null;
}

/** Mirrors the server's password rules so people see what's missing before submitting. */
function passwordChecks(pw: string) {
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(pw)).length;
  return [
    { ok: pw.length >= 12, label: "At least 12 characters" },
    { ok: classes >= 3, label: "3 of: lowercase, uppercase, number, symbol" },
    { ok: pw.length > 0 && !/\s/.test(pw), label: "No spaces" },
  ];
}

export default function RegisterPage() {
  const router = useRouter();
  const { state } = useSession();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<RegisterPayload | null>(null);

  const checks = useMemo(() => passwordChecks(password), [password]);

  useEffect(() => {
    if (state.status === "authenticated") router.replace("/dashboard");
  }, [state.status, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    const res = await apiFetch<RegisterPayload>(
      "/api/v1/auth/register",
      { method: "POST", body: JSON.stringify({ email: email.trim(), username: username.trim(), password }) },
      { auth: false },
    );
    setBusy(false);
    if (res.data) return setCreated(res.data);

    const fields = fieldErrors(res.error);
    if (Object.keys(fields).length) setErrors(fields);
    else setError(errorMessage(res.error));
  }

  if (created) {
    return (
      <AuthLayout title="Verify your email" subtitle={`We created the account for ${created.email}.`}>
        <div className="space-y-4">
          {created.verificationUrl ? (
            <Notice tone="warning" title="Development mode">
              Email isn&rsquo;t sent yet, so the verification link is shown here.
              <div className="mt-2 break-all font-mono text-xs">
                <a href={created.verificationUrl} className="text-primary underline">
                  {created.verificationUrl}
                </a>
              </div>
            </Notice>
          ) : (
            <p className="text-text-muted">
              Open the link in the message we sent to confirm your address. You can sign in once
              it&rsquo;s verified.
            </p>
          )}
          <LinkButton href="/login">Go to sign in</LinkButton>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create an account"
      subtitle="You'll join servers and get access from a server owner."
      footer={
        <>
          Already registered?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label="Email" error={errors.email}>
          {(p) => (
            <Input
              {...p}
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Username"
          error={errors.username}
          hint="3–32 characters: letters, numbers, dots, dashes, underscores."
        >
          {(p) => (
            <Input
              {...p}
              type="text"
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          )}
        </Field>
        <Field label="Password" error={errors.password}>
          {(p) => (
            <>
              <Input
                {...p}
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <ul className="mt-2 space-y-0.5 text-xs" aria-live="polite">
                {checks.map((c) => (
                  <li
                    key={c.label}
                    className={`flex items-center gap-1.5 ${c.ok ? "text-success" : "text-text-muted"}`}
                  >
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
        <Button type="submit" variant="primary" loading={busy} className="w-full">
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
