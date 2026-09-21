import { useEffect, useState } from "react";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ServersPage } from "./pages/ServersPage";
import { SettingsPage } from "./pages/SettingsPage";
import {
  getAccessToken,
  setAccessToken,
} from "./lib/api";
import {
  tauriGetStoredAccessToken,
  tauriGetAppVersion,
} from "./lib/tauri";

type Route = "dashboard" | "servers" | "settings";

export default function App() {
  const [route, setRoute] = useState<Route>("dashboard");
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [booting, setBooting] = useState(true);
  const [version, setVersion] = useState("0.0.0");

  useEffect(() => {
    (async () => {
      // Try to restore a session on boot.
      const stored = getAccessToken();
      if (stored) {
        setAuthenticated(true);
      } else {
        // Try to load from OS keychain via Tauri.
        try {
          const token = await tauriGetStoredAccessToken();
          if (token) {
            setAccessToken(token);
            setAuthenticated(true);
          }
        } catch {
          // Not in Tauri or no token stored.
        }
      }
      try {
        setVersion(await tauriGetAppVersion());
      } catch {
        setVersion("0.0.0-browser");
      }
      setBooting(false);
    })();
  }, []);

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center text-text-muted text-sm">
        Loading Westside…
      </div>
    );
  }

  if (!authenticated) {
    return <LoginPage onAuthed={() => setAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar route={route} onNavigate={setRoute} version={version} onLogout={() => {
        setAccessToken(null);
        setAuthenticated(false);
      }} />
      <main className="flex-1 flex flex-col min-w-0">
        <Header route={route} />
        <div className="flex-1 overflow-y-auto">
          {route === "dashboard" && <DashboardPage onNavigate={setRoute} />}
          {route === "servers" && <ServersPage />}
          {route === "settings" && <SettingsPage />}
        </div>
      </main>
    </div>
  );
}

function Sidebar({
  route,
  onNavigate,
  version,
  onLogout,
}: {
  route: Route;
  onNavigate: (r: Route) => void;
  version: string;
  onLogout: () => void;
}) {
  const items: { key: Route; label: string }[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "servers", label: "Servers" },
    { key: "settings", label: "Settings" },
  ];
  return (
    <aside className="w-60 shrink-0 border-r border-border bg-bg-subtle flex flex-col">
      <div className="px-4 py-4 border-b border-border" data-tauri-drag-region>
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold">W</span>
          </div>
          <div>
            <div className="font-semibold text-sm leading-tight">Westside</div>
            <div className="text-xs text-text-muted">v{version}</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {items.map((it) => (
          <button
            key={it.key}
            onClick={() => onNavigate(it.key)}
            className={`block w-full text-left px-3 py-1.5 rounded-md text-sm transition ${
              route === it.key
                ? "bg-primary/10 text-primary font-medium"
                : "text-text hover:bg-surface-hover"
            }`}
          >
            {it.label}
          </button>
        ))}
        <div className="pt-4 pb-1 px-3 text-[10px] uppercase tracking-wider text-text-muted">
          Coming soon
        </div>
        <div className="block px-3 py-1.5 rounded-md text-sm text-text-muted/40 cursor-not-allowed">
          Radio
        </div>
        <div className="block px-3 py-1.5 rounded-md text-sm text-text-muted/40 cursor-not-allowed">
          CAD
        </div>
        <div className="block px-3 py-1.5 rounded-md text-sm text-text-muted/40 cursor-not-allowed">
          MDT
        </div>
      </nav>
      <div className="px-3 py-3 border-t border-border">
        <button
          onClick={onLogout}
          className="w-full text-sm px-3 py-1.5 rounded-md border border-border hover:bg-surface-hover transition"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

function Header({ route }: { route: Route }) {
  const titles: Record<Route, string> = {
    dashboard: "Dashboard",
    servers: "Servers",
    settings: "Settings",
  };
  return (
    <header
      className="h-12 border-b border-border bg-surface px-4 flex items-center justify-between"
      data-tauri-drag-region
    >
      <div className="text-sm font-medium text-text-muted">{titles[route]}</div>
    </header>
  );
}
