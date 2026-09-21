/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The web app talks to the Westside API over HTTPS only — never to the DB.
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.API_BASE_URL ?? "http://localhost:4000",
  },
  // Server-side requests bypass CORS (no Origin header), so SSR calls to the
  // API just work. Client-side requests use the browser origin and are subject
  // to CORS — the API allowlist includes localhost:3000 in dev.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_BASE_URL ?? "http://localhost:4000"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
