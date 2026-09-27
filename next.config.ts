import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The shared Tailwind stylesheet is ~9 KB compressed. Deliver it with HTML
  // so a cold page render does not wait for another stylesheet round trip.
  experimental: { inlineCss: true },
};

export default nextConfig;
