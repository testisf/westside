"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { Notice } from "@/components/ui";
import { API_BASE_URL } from "@/lib/api";
import { useSession } from "@/lib/session";

const ERROR_MESSAGE: Record<string, string> = {
  roblox_denied: "Sign-in was cancelled on Roblox.",
  roblox_oauth_failed: "Roblox sign-in failed. Please try again.",
  account_unavailable: "This account is disabled. Contact an administrator.",
};

function RobloxIcon() {
  // Roblox's own mark, simplified to a single path so it inherits currentColor.
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5.164 3 3 18.836 18.836 21 21 5.164 5.164 3Zm7.373 6.514 4.111.581-.581 4.111-4.111-.581.581-4.111Z" />
    </svg>
  );
}

function LoginContent() {
  const router = useRouter();
  const { state } = useSession();
  const error = useSearchParams().get("error");

  useEffect(() => {
    if (state.status === "authenticated") router.replace("/dashboard");
  }, [state.status, router]);

  return (
    <AuthLayout title="Sign in" subtitle="Westside accounts are created and secured through Roblox.">
      <div className="space-y-4">
        {error && <Notice tone="danger">{ERROR_MESSAGE[error] ?? "Something went wrong. Please try again."}</Notice>}
        <a
          href={`${API_BASE_URL}/api/v1/auth/roblox/login?client=web&returnTo=${encodeURIComponent("/dashboard")}`}
          className="flex h-9 w-full items-center justify-center gap-2 rounded bg-[#000] text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <RobloxIcon />
          Continue with Roblox
        </a>
        <p className="text-text-muted">
          First time here? Signing in with Roblox creates your Westside account automatically — a server owner
          adds you to their community afterwards.
        </p>
      </div>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
