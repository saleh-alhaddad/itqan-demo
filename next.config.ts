import type { NextConfig } from "next";

/**
 * Security response headers (harden M1).
 *
 * A note on the CSP, because the honest version matters more than a green checkbox:
 * `script-src` includes `'unsafe-inline'`. Next injects inline bootstrap scripts, and the
 * strict alternative is a per-request nonce, which needs middleware this app does not have.
 * So this CSP does NOT stop inline script injection — what it does stop is loading script
 * from another origin, exfiltrating to one (`connect-src 'self'`), embedding the app in a
 * frame (`frame-ancestors 'none'`), and rewriting the base URI. That is a real reduction,
 * and calling it complete XSS protection would be a lie. Upgrading to a nonce is the next
 * step if this app grows a middleware layer.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  // Clickjacking. SameSite=Lax already keeps the session out of a cross-site frame, so this
  // is the second layer rather than the only one.
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

const nextConfig: NextConfig = {
  // harden I2: `X-Powered-By: Next.js` tells an attacker which framework-specific
  // advisories to try first. It buys nothing.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          // Redundant with frame-ancestors for modern browsers, kept for older ones.
          { key: 'X-Frame-Options', value: 'DENY' },
          // Stops a browser guessing a response is script when the server said it is not.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Board URLs contain team and board ids; do not leak them to third parties.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          // Only meaningful over TLS; harmless on plain HTTP, where browsers ignore it.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ]
  },
};

export default nextConfig;
