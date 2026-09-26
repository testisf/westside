import { useEffect, useState } from "react";
import { Icon } from "../components/icons";
import { Button, Dd, Dl, Dt, EmptyState, Notice, PageHeader, Panel, Section, Skeleton, Status, statusTone, Tag } from "../components/ui";
import { apiFetch } from "../lib/api";
import { onUpdateAvailable, tauriCheckForUpdates, tauriInstallUpdate } from "../lib/tauri";

interface Server {
  id: string;
  name: string;
  slug: string;
  status: string;
  isOwner: boolean;
}
interface MeResponse {
  user: { id: string; email: string | null; username: string; emailVerified: boolean; mfaEnabled: boolean; robloxUsername: string | null };
  permissions: string[];
  roles: string[];
}

export function DashboardPage({ onNavigate }: { onNavigate: (r: "servers" | "settings") => void }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [update, setUpdate] = useState<{ version: string; body: string } | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    (async () => {
      const meRes = await apiFetch<MeResponse>("/api/v1/auth/me");
      if (meRes.error) {
        setError(meRes.error.message);
        setLoading(false);
        return;
      }
      setMe(meRes.data ?? null);
      const serversRes = await apiFetch<Server[]>("/api/v1/servers");
      if (serversRes.data) setServers(serversRes.data);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        await tauriCheckForUpdates();
        unlisten = (await onUpdateAvailable((i) => setUpdate({ version: i.version, body: i.body }))) as unknown as () => void;
      } catch {
        /* not running inside Tauri (browser preview) */
      }
    })();
    return () => unlisten?.();
  }, []);

  if (loading) {
    return (
      <>
        <PageHeader title="Overview" />
        <Skeleton className="mb-3 h-4 w-56" />
        <Skeleton className="h-4 w-40" />
      </>
    );
  }

  if (error || !me) {
    return (
      <>
        <PageHeader title="Overview" />
        <Notice tone="danger" title="Couldn't load your account" action={<Button size="sm" onClick={() => window.location.reload()}>Retry</Button>}>
          {error ?? "Something went wrong."}
        </Notice>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Overview" description="Your account, and the servers you belong to." />

      <div className="mb-8 space-y-2">
        {update && (
          <Notice
            tone="info"
            title={`Update available — v${update.version}`}
            action={
              <Button size="sm" variant="primary" loading={installing} onClick={async () => { setInstalling(true); try { await tauriInstallUpdate(); } catch { setInstalling(false); } }}>
                <Icon name="download" size={14} />
                Install
              </Button>
            }
          >
            <span className="whitespace-pre-line">{update.body}</span>
          </Notice>
        )}
        {!me.user.emailVerified && (
          <Notice tone="warning" title="Your email address isn't verified">
            Open the link we sent when you registered. Until then some actions may be blocked.
          </Notice>
        )}
        {!me.user.mfaEnabled && (
          <Notice tone="info" title="Two-factor authentication is off" action={<Button size="sm" onClick={() => onNavigate("settings")}>Set up 2FA</Button>}>
            Add an authenticator app so a stolen password isn&rsquo;t enough to get into your account.
          </Notice>
        )}
      </div>

      <div className="space-y-8">
        <Section title="Your servers" action={servers.length > 0 && <button onClick={() => onNavigate("servers")} className="text-[13px] text-primary hover:underline">View all</button>}>
          {servers.length === 0 ? (
            <EmptyState title="You're not in any servers yet" action={<Button variant="primary" onClick={() => onNavigate("servers")}>Create a server</Button>}>
              A server is one ERLC community. Once an owner adds you, it shows up here.
            </EmptyState>
          ) : (
            <Panel>
              <ul className="divide-y">
                {servers.slice(0, 5).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-4 px-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className="block truncate font-mono text-xs text-text-muted">{s.slug}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-4 text-[13px] text-text-muted">
                      {s.isOwner && <span>Owner</span>}
                      <Status tone={statusTone(s.status)}>{s.status}</Status>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </Section>

        <Section title="Account">
          <Dl>
            <Dt>Roblox</Dt>
            <Dd>{me.user.robloxUsername ?? <span className="text-text-muted">Not linked</span>}</Dd>
            {me.user.email && (
              <>
                <Dt>Email</Dt>
                <Dd>{me.user.email}</Dd>
              </>
            )}
            <Dt>Roles</Dt>
            <Dd>
              {me.roles.length ? (
                <span className="flex flex-wrap gap-1">
                  {me.roles.map((r) => (
                    <Tag key={r}>{r}</Tag>
                  ))}
                </span>
              ) : (
                <span className="text-text-muted">None assigned</span>
              )}
            </Dd>
            {me.user.email && (
              <>
                <Dt>Verified</Dt>
                <Dd>
                  <Status tone={me.user.emailVerified ? "ok" : "warn"}>{me.user.emailVerified ? "Verified" : "Not verified"}</Status>
                </Dd>
              </>
            )}
            <Dt>2FA</Dt>
            <Dd>
              <Status tone={me.user.mfaEnabled ? "ok" : "off"}>{me.user.mfaEnabled ? "On" : "Off"}</Status>
            </Dd>
          </Dl>
        </Section>
      </div>
    </>
  );
}
