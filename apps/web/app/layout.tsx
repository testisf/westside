import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./globals.css";
import { SessionProvider } from "@/lib/session";

export const metadata: Metadata = {
  title: { default: "Westside", template: "%s · Westside" },
  description: "Communications platform for ERLC communities",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Sets the dark-mode class before first paint so there is no flash.
// Reads the saved choice from localStorage and falls back to the system setting.
const themeScript = `
  (function() {
    try {
      var t = localStorage.getItem('westside-theme');
      if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      }
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
