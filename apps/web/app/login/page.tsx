"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthLayout } from "@/components/AuthLayout";
import { Button, Field, Input, Notice } from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";

interface LoginPayload {
  accessToken: string;
  accessTokenExpiresAt: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { state, signIn } = useSession();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mfaTicket, setMfaTicket] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Someone with a live session doesn't need this page.
  useEffect(() => {
    if (state.status === "authenticated") router.replace("/dashboard");
  }, [state.status, router]);

  async function finish(payload: LoginPayload) {
    await signIn(payload.accessToken, payload.accessTokenExpiresAt);
    router.replace("/dashboard");
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiFetch<LoginPayload>(
      "/api/v1/auth/login",
      { method: "POST", body: JSON.stringify({ identifier: identifier.trim(), password }) },
      { auth: false },
    );
    if (res.data) return finish(res.data);
    setBusy(false);

    if (res.error?.code === "AUTH_MFA_REQUIRED" && res.error.details?.ticket) {
      setMfaTicket(res.error.details.ticket);
      setCode("");
      return;
    }
    setError(errorMessage(res.error));
  }

  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaTicket) return;
    setBusy(true);
    setError(null);
    const res = await apiFetch<LoginPayload>(
      "/api/v1/auth/login/mfa",
      { method: "POST", body: JSON.stringify({ ticket: mfaTicket, code }) },
      { auth: false },
    );
    if (res.data) return finish(res.data);
    setBusy(false);

    if (res.error?.code === "AUTH_TOKEN_INVALID") {
      // The ticket is short-lived; the only way forward is to start over.
      setMfaTicket(null);
      setPassword("");
      setError("That sign-in attempt timed out. Enter your password again.");
      return;
    }
    setError(errorMessage(res.error));
  }

  if (mfaTicket) {
    return (
      <AuthLayout
        title="Enter your code"
        subtitle="Open your authenticator app and enter the 6-digit code for Westside."
        footer={
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => {
              setMfaTicket(null);
              setPassword("");
              setError(null);
            }}
          >
            Use a different account
          </button>
        }
      >
        <form onSubmit={handleCode} className="space-y-4" noValidate>
          {error && <Notice tone="danger">{error}</Notice>}
          <Field label="Authentication code">
            {(p) => (
              <Input
                {...p}
                mono
                autoFocus
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="\d{6}"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="tracking-[0.3em]"
              />
            )}
          </Field>
          <Button type="submit" variant="primary" loading={busy} disabled={code.length !== 6} className="w-full">
            Verify and sign in
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use the email or username you registered with."
      footer={
        <>
          New to Westside?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleCredentials} className="space-y-4">
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label="Email or username">
          {(p) => (
            <Input
              {...p}
              type="text"
              autoFocus
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          )}
        </Field>
        <Field label="Password">
          {(p) => (
            <div className="relative">
              <Input
                {...p}
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-14"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute inset-y-0 right-0 px-2.5 text-xs text-text-muted hover:text-text"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          )}
        </Field>
        <Button type="submit" variant="primary" loading={busy} className="w-full">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
