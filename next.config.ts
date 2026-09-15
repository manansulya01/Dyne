import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Supabase Cloud storage (project-ref.supabase.co)
      { protocol: "https", hostname: "*.supabase.co" },
      // Local development with Supabase CLI
      { protocol: "http", hostname: "127.0.0.1" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
};

export default nextConfig;
