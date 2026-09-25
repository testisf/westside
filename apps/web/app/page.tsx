"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";
import { useSession } from "@/lib/session";

// Returning visitors with a valid session go straight in; everyone else signs in.
export default function Home() {
  const router = useRouter();
  const { state } = useSession();

  useEffect(() => {
    if (state.status === "authenticated") router.replace("/dashboard");
    else if (state.status === "anonymous" || state.status === "unreachable") router.replace("/login");
  }, [state.status, router]);

  return (
    <div className="flex min-h-screen items-center justify-center gap-2 text-text-muted" role="status">
      <Spinner />
      <span>Loading…</span>
    </div>
  );
}
