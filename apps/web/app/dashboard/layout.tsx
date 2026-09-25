"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Button, Spinner } from "@/components/ui";
import { useSession } from "@/lib/session";

/**
 * Guards everything under /dashboard and provides the shell (sidebar, mobile
 * navigation). Pages below only render once a session exists.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { state, reload } = useSession();

  useEffect(() => {
    if (state.status === "anonymous") router.replace("/login");
  }, [state.status, router]);

  if (state.status === "unreachable") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-sm">
          <h1 className="text-base font-semibold">Can&rsquo;t reach Westside</h1>
          <p className="mt-1 text-text-muted">
            The API didn&rsquo;t respond. If you were signed in you still are; try again in a moment.
          </p>
          <div className="mt-4">
            <Button variant="primary" onClick={() => reload()}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (state.status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-text-muted" role="status">
        <Spinner />
        <span>Loading…</span>
      </div>
    );
  }

  return <Shell>{children}</Shell>;
}
