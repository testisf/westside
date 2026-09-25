/** Small display helpers. Everything here runs in the browser after data loads. */

const DATE: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, DATE);
}

/** e.g. "12 Mar 2026, 14:03:22" — seconds matter when reading logs. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, DATE)}, ${d.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "never";
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(iso);
}

export function initials(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

/** "Chrome on Windows" from a user-agent string. Good enough to recognise a device. */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  if (/westside/i.test(ua) || /tauri/i.test(ua)) return "Westside desktop";
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : null;
  const os =
    /Windows/.test(ua) ? "Windows"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iOS/.test(ua) ? "iOS"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown device";
}

/** Group permission strings like "server.create" by their first segment. */
export function groupPermissions(perms: string[]): [string, string[]][] {
  const map = new Map<string, string[]>();
  for (const p of [...perms].sort()) {
    const area = p.split(".")[0];
    map.set(area, [...(map.get(area) ?? []), p]);
  }
  return [...map.entries()];
}

/** "Liberty County Fire" -> "liberty-county-fire" (server slugs). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
