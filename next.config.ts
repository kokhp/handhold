import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow LAN devices (phones on same wifi) to hit dev server without Next
  // blocking cross-origin requests to /_next/hmr and chunks.
  allowedDevOrigins: ["192.168.1.6", "192.168.*.*", "10.*.*.*", "172.16.*.*"],
};

export default nextConfig;
