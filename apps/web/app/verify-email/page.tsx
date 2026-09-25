"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthLayout } from "@/components/AuthLayout";
import { LinkButton, Notice, Spinner } from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api";

type Result = { kind: "working" } | { kind: "done" } | { kind: "failed"; message: string };

function VerifyEmail() {
  const token = useSearchParams().get("token");
  const [result, setResult] = useState<Result>(
    token ? { kind: "working" } : { kind: "failed", message: "This link is missing its token." },
  );
  // Tokens are single-use, so make sure the request is sent once even when
  // React re-runs effects in development.
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    apiFetch("/api/v1/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }, { auth: false }).then(
      (res) => setResult(res.error ? { kind: "failed", message: errorMessage(res.error) } : { kind: "done" }),
    );
  }, [token]);

  if (result.kind === "working") {
    return (
      <AuthLayout title="Verifying your email">
        <div className="flex items-center gap-2 text-text-muted" role="status">
          <Spinner /> One moment…
        </div>
      </AuthLayout>
    );
  }

  if (result.kind === "done") {
    return (
      <AuthLayout title="Email verified" subtitle="Your address is confirmed. You can sign in now.">
        <LinkButton href="/login" variant="primary">
          Sign in
        </LinkButton>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="We couldn't verify that link"
      subtitle="Verification links are single-use and expire after a day."
    >
      <div className="space-y-4">
        <Notice tone="danger">{result.message}</Notice>
        <LinkButton href="/login">Back to sign in</LinkButton>
      </div>
    </AuthLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
