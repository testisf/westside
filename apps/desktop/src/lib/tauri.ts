/**
 * Westside desktop — Tauri bridge.
 */

import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface UserData {
  id: string;
  email: string;
  username: string;
  email_verified: boolean;
  status: string;
  mfa_enabled: boolean;
}

export interface LoginResult {
  user: UserData;
  access_token: string;
  mfa_required: boolean;
  mfa_ticket: string | null;
}

export async function tauriLogin(identifier: string, password: string): Promise<LoginResult> {
  if (!isTauri()) throw new Error("NOT_IN_TAURI");
  return invoke<LoginResult>("login", { identifier, password });
}

export interface RegisterResult {
  user_id: string;
  verification_url: string | null;
}

export async function tauriRegister(email: string, username: string, password: string): Promise<RegisterResult> {
  if (!isTauri()) throw new Error("NOT_IN_TAURI");
  return invoke<RegisterResult>("register", { email, username, password });
}

export async function tauriVerifyEmail(token: string): Promise<void> {
  if (!isTauri()) throw new Error("NOT_IN_TAURI");
  await invoke<void>("verify_email", { token });
}
export async function tauriLoginMfa(ticket: string, code: string): Promise<LoginResult> {
  if (!isTauri()) throw new Error("NOT_IN_TAURI");
  return invoke<LoginResult>("login_mfa", { ticket, code });
}

export async function tauriRefresh(): Promise<string> {
  if (!isTauri()) throw new Error("NOT_IN_TAURI");
  return invoke<string>("refresh_token");
}

export async function tauriLogout(accessToken: string): Promise<void> {
  if (!isTauri()) throw new Error("NOT_IN_TAURI");
  await invoke<void>("logout", { accessToken });
}

export async function tauriGetStoredAccessToken(): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>("get_stored_access_token");
}

export async function tauriGetStoredUserId(): Promise<string | null> {
  if (!isTauri()) return null;
  return invoke<string | null>("get_stored_user_id");
}

export async function tauriCheckForUpdates(): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("check_for_updates");
}

export async function tauriInstallUpdate(): Promise<void> {
  if (!isTauri()) throw new Error("NOT_IN_TAURI");
  await invoke<void>("install_update");
}

export async function tauriGetAppVersion(): Promise<string> {
  if (!isTauri()) return "0.0.0-browser";
  return invoke<string>("get_app_version");
}

export async function tauriRegisterPtt(accelerator: string): Promise<void> {
  if (!isTauri()) return;
  await invoke<void>("register_ptt", { accelerator });
}

export async function tauriGetPttAccelerator(): Promise<string> {
  if (!isTauri()) return "Control+Shift+Space";
  return invoke<string>("get_ptt_accelerator");
}

export async function tauriSetPttAccelerator(accelerator: string): Promise<void> {
  if (!isTauri()) return;
  await invoke<void>("set_ptt_accelerator", { accelerator });
}

export async function onPttEvent(
  handler: (event: "pressed" | "released") => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    const down = (e: KeyboardEvent) => { if (e.code === "Space") handler("pressed"); };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") handler("released"); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return (async () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    }) as unknown as UnlistenFn;
  }
  const unlistenPressed = await listen("ptt-pressed", () => handler("pressed"));
  const unlistenReleased = await listen("ptt-released", () => handler("released"));
  return (async () => {
    unlistenPressed();
    unlistenReleased();
  }) as unknown as UnlistenFn;
}

export async function onUpdateAvailable(
  handler: (info: { version: string; date: string; body: string }) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return (async () => {}) as unknown as UnlistenFn;
  }
  return listen("update-available", (e) => {
    handler(e.payload as { version: string; date: string; body: string });
  });
}
