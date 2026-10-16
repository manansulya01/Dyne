import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // App-served uploads (/api/files) + local dev hosts.
      { protocol: "http", hostname: "127.0.0.1" },
      { protocol: "http", hostname: "localhost" },
      // Cloudflare R2 public bucket host (production storage driver).
      { protocol: "https", hostname: "*.r2.dev" },
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http://localhost:3000 http://127.0.0.1:3000 https://*.r2.dev https://*.r2.cloudflarestorage.com; media-src 'self' blob: https://*.r2.dev https://*.r2.cloudflarestorage.com; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
