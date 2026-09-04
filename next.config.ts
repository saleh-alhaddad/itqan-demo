import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // harden I2: `X-Powered-By: Next.js` on every response tells an attacker which
  // framework-specific advisories to try first. It buys nothing.
  poweredByHeader: false,
};

export default nextConfig;
