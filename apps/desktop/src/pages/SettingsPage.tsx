import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { onPttEvent, tauriGetPttAccelerator, tauriRegisterPtt, tauriSetPttAccelerator } from "../lib/tauri";

interface MeResponse {
  user: {
    id: string;
    email: string;
    username: string;
    mfaEnabled: boolean;
  };
}

export function SettingsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [pttAccelerator, setPttAccelerator] = useState("Control+Shift+Space");
  const [pttCapturing, setPttCapturing] = useState(false);
  const [pttActive, setPttActive] = useState(false);
  const [savingPtt, setSavingPtt] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await apiFetch<MeResponse>("/api/v1/auth/me");
      if (res.data) setMe(res.data);
      try {
        const acc = await tauriGetPttAccelerator();
        setPttAccelerator(acc);
      } catch {
        // Not in Tauri.
      }
    })();
  }, []);

  // Subscribe to PTT events so the user can see the hotkey works.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      const fn = await onPttEvent((event: "pressed" | "released") => {
        setPttActive(event === "pressed");
      });
      unlisten = fn as unknown as () => void;
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  function capturePttKey() {
    setPttCapturing(true);
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Build an accelerator string from the pressed modifiers + key.
      const mods: string[] = [];
      if (e.ctrlKey) mods.push("Control");
      if (e.shiftKey) mods.push("Shift");
      if (e.altKey) mods.push("Alt");
      if (e.metaKey) mods.push("Super");
      const keyName = normalizeKey(e.key);
      if (!mods.length) return; // require at least one modifier
      const acc = [...mods, keyName].join("+");
      setPttAccelerator(acc);
      setPttCapturing(false);
      window.removeEventListener("keydown", handler, true);
    };
    window.addEventListener("keydown", handler, true);
  }

  async function handleSavePtt() {
    setSavingPtt(true);
    try {
      await tauriSetPttAccelerator(pttAccelerator);
      await tauriRegisterPtt(pttAccelerator);
    } catch (e) {
      console.error("PTT save failed:", e);
    }
    setSavingPtt(false);
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-1">Settings</h1>
      <p className="text-sm text-text-muted mb-6">Account, hotkeys, and updates.</p>

      {/* Account section */}
      <section className="bg-surface border border-border rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold mb-3">Account</h2>
        {me ? (
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between">
              <dt className="text-text-muted">Username</dt>
              <dd className="font-medium">{me.user.username}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Email</dt>
              <dd className="font-medium">{me.user.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">2FA enabled</dt>
              <dd className={me.user.mfaEnabled ? "text-success font-medium" : "text-text-muted"}>
                {me.user.mfaEnabled ? "Yes" : "No"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-text-muted">Loading…</p>
        )}
      </section>

      {/* PTT hotkey section */}
      <section className="bg-surface border border-border rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold mb-3">Push-to-talk hotkey</h2>
        <p className="text-xs text-text-muted mb-3">
          Global hotkey. Works even when Westside is in the background.
          Radio transmission arrives in Phase 3.
        </p>

        <div className="flex items-center gap-3">
          <input
            value={pttAccelerator}
            onChange={(e) => setPttAccelerator(e.target.value)}
            disabled={pttCapturing}
            className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={capturePttKey}
            disabled={pttCapturing}
            className="border border-border text-sm rounded-md px-3 py-2 hover:bg-surface-hover"
          >
            {pttCapturing ? "Press keys…" : "Capture"}
          </button>
          <button
            onClick={handleSavePtt}
            disabled={savingPtt}
            className="bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-medium rounded-md px-4 py-2 disabled:opacity-50"
          >
            {savingPtt ? "Saving…" : "Save"}
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs text-text-muted">Hotkey status:</span>
          <span className={`text-xs px-2 py-0.5 rounded ${pttActive ? "bg-danger text-white" : "bg-bg-muted text-text-muted"}`}>
            {pttActive ? "Pressed" : "Idle"}
          </span>
        </div>
      </section>

      {/* About section */}
      <section className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold mb-3">About</h2>
        <dl className="text-sm space-y-1.5">
          <div className="flex justify-between">
            <dt className="text-text-muted">App</dt>
            <dd className="font-medium">Westside Desktop</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Phase</dt>
            <dd className="font-medium">4 — Desktop client</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Storage</dt>
            <dd className="font-medium">OS keychain</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function normalizeKey(key: string): string {
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
}
