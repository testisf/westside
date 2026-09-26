import { useEffect, useState } from "react";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ServersPage } from "./pages/ServersPage";
import { SettingsPage } from "./pages/SettingsPage";
import { Icon, type IconName } from "./components/icons";
import { Button, Spinner } from "./components/ui";
import { setAccessToken } from "./lib/api";
import { tauriGetAppVersion, tauriRefresh } from "./lib/tauri";

type Route = "dashboard" | "servers" | "settings";

const NAV: { key: Route; label: string; icon: IconName }[] = [
  { key: "dashboard", label: "Overview", icon: "home" },
  { key: "servers", label: "Servers", icon: "server" },
  { key: "settings", label: "Settings", icon: "settings" },
];

const TITLES: Record<Route, string> = { dashboard: "Overview", servers: "Servers", settings: "Settings" };

export default function App() {
  const [route, setRoute] = useState<Route>("dashboard");
  const [authState, setAuthState] = useState<"booting" | "in" | "out">("booting");
  const [version, setVersion] = useState("0.0.0");

  useEffect(() => {
    (async () => {
      // On boot, try to refresh the access token using the refresh token
      // stored in the OS keychain. That token has a 30-day TTL, so this is
      // what keeps someone signed in across app restarts.
      try {
        const newToken = await tauriRefresh();
        if (newToken) {
          setAccessToken(newToken);
          setAuthState("in");
        } else {
          setAuthState("out");
        }
      } catch {
        setAuthState("out");
      }
      try {
        setVersion(await tauriGetAppVersion());
      } catch {
        setVersion("0.0.0-browser");
      }
    })();
  }, []);

  if (authState === "booting") {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-text-muted" role="status">
        <Spinner />
        <span>Loading Westside…</span>
      </div>
    );
  }

  if (authState === "out") {
    return <LoginPage onAuthed={() => setAuthState("in")} />;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        route={route}
        onNavigate={setRoute}
        version={version}
        onLogout={() => {
          setAccessToken(null);
          setAuthState("out");
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center border-b bg-surface px-4" data-tauri-drag-region>
          <span className="text-[13px] font-medium text-text-muted">{TITLES[route]}</span>
        </div>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-6">
            {route === "dashboard" && <DashboardPage onNavigate={setRoute} />}
            {route === "servers" && <ServersPage />}
            {route === "settings" && <SettingsPage />}
          </div>
        </main>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  return (
    <button
      type="button"
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
        try {
          localStorage.setItem("westside-theme", next ? "dark" : "light");
        } catch {
          /* private mode: the choice just won't persist */
        }
      }}
      className="flex h-8 w-8 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-subtle hover:text-text"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
    >
      <Icon name={dark ? "sun" : "moon"} />
    </button>
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
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-surface">
      <div className="flex h-11 shrink-0 items-center gap-2.5 border-b px-4" data-tauri-drag-region>
        <span className="flex h-6 w-6 items-center justify-center rounded bg-primary text-[13px] font-semibold leading-none text-primary-foreground" aria-hidden="true">
          W
        </span>
        <span className="text-sm font-semibold tracking-tight">Westside</span>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        <ul className="space-y-px">
          {NAV.map((item) => {
            const active = route === item.key;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.key)}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-8 w-full items-center gap-2.5 rounded px-2.5 text-left transition-colors ${
                    active ? "bg-bg-subtle font-medium text-text" : "text-text-muted hover:bg-bg-subtle hover:text-text"
                  }`}
                >
                  <Icon name={item.icon} className={active ? "text-primary" : ""} />
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="px-2.5">
          <p className="mb-1 text-xs font-medium text-text-faint">Planned</p>
          <ul className="space-y-1 text-[13px] text-text-faint">
            <li className="flex items-center gap-2.5 px-0.5">
              <Icon name="radio" />
              Radio
            </li>
            <li className="px-0.5">CAD</li>
            <li className="px-0.5">MDT</li>
          </ul>
        </div>
      </nav>

      <div className="flex items-center gap-1 border-t px-2 py-2">
        <span className="flex-1 truncate px-1 text-xs text-text-faint">v{version}</span>
        <ThemeToggle />
        <Button size="sm" onClick={onLogout} title="Sign out">
          <Icon name="logout" size={14} />
        </Button>
      </div>
    </aside>
  );
}
