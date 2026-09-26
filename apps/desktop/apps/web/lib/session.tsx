"use client";

/**
 * Who is signed in, and what they can do.
 *
 * On first load there is no access token in memory, so the first `/auth/me`
 * call triggers a refresh from the HttpOnly cookie (see lib/api.ts). That is
 * also how a returning visitor gets straight to the dashboard.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, onUnauthorized, setAccessToken } from "./api";

export interface Me {
  user: {
    id: string;
    email: string | null;
    username: string;
    emailVerified: boolean;
    status: string;
    mfaEnabled: boolean;
    robloxUsername: string | null;
  };
  sessionId: string;
  permissions: string[];
  roles: string[];
}

type SessionState =
  | { status: "loading" }
  | { status: "authenticated"; me: Me }
  | { status: "anonymous" }
  | { status: "unreachable" };

interface SessionContextValue {
  state: SessionState;
  can: (permission: string) => boolean;
  reload: () => Promise<void>;
  /** Store the tokens from a successful login, then load the profile. */
  signIn: (accessToken: string, expiresAt: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** For flows that end every session server-side (sign out everywhere). */
  clear: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<SessionState>({ status: "loading" });

  const load = useCallback(async () => {
    const res = await apiFetch<Me>("/api/v1/auth/me");
    if (res.data) setState({ status: "authenticated", me: res.data });
    else if (res.error?.code === "NETWORK_ERROR") setState({ status: "unreachable" });
    else setState({ status: "anonymous" });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // If a refresh is rejected mid-session, drop back to signed-out.
  useEffect(
    () => onUnauthorized(() => setState((s) => (s.status === "authenticated" ? { status: "anonymous" } : s))),
    [],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      can: (permission) => state.status === "authenticated" && state.me.permissions.includes(permission),
      reload: load,
      signIn: async (token, expiresAt) => {
        setAccessToken(token, expiresAt);
        await load();
      },
      signOut: async () => {
        await apiFetch("/api/v1/auth/logout", { method: "POST" });
        setAccessToken(null);
        setState({ status: "anonymous" });
        router.replace("/login");
      },
      clear: () => {
        setAccessToken(null);
        setState({ status: "anonymous" });
      },
    }),
    [state, load, router],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

/** For pages under the dashboard layout, where a session is guaranteed. */
export function useMe(): Me {
  const { state } = useSession();
  if (state.status !== "authenticated") throw new Error("useMe called without a session");
  return state.me;
}
