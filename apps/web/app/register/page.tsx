"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setVerificationUrl(null);
    const res = await apiFetch<{ verificationUrl?: string | null; userId: string }>(
      "/api/v1/auth/register",
      { method: "POST", body: JSON.stringify({ email, username, password }) },
    );
    setLoading(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (res.data?.verificationUrl) {
      // Dev only — Phase 2 will send the link via email.
      setVerificationUrl(res.data.verificationUrl);
    } else {
      router.push("/login");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-subtle px-4">
      <div className="w-full max-w-sm">
        <div className="bg-surface border border-border rounded-2xl p-8 shadow-sm">
          <div className="mb-8">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center mb-4">
              <span className="text-primary-foreground font-bold text-lg">W</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
            <p className="text-sm text-text-muted mt-1">Register to join a Westside community.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" htmlFor="username">Username</label>
              <input id="username" type="text" autoComplete="username" required value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" htmlFor="password">Password</label>
              <input id="password" type="password" autoComplete="new-password" required value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <p className="text-xs text-text-muted mt-1.5">Min 12 chars, including 3 of {`{lowercase, uppercase, digit, symbol}`}.</p>
            </div>

            {error && (
              <div className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            {verificationUrl && (
              <div className="text-sm text-success bg-success/10 border border-success/20 rounded-md px-3 py-2">
                <div className="font-medium mb-1">Account created (dev mode).</div>
                <div className="text-xs">Verify your email:</div>
                <a href={verificationUrl} className="text-xs underline">{verificationUrl}</a>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground font-medium text-sm rounded-md py-2 px-4 transition">
              {loading ? "Creating…" : "Create account"}
            </button>
          </form>

          <div className="mt-6 text-sm text-text-muted text-center">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
