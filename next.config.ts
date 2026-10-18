import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * The app renders only its own content, so the CSP can stay tight.
 * 'unsafe-inline' is required for styles because Next injects inline <style>
 * tags, and for scripts because the App Router bootstraps with inline JSON
 * payloads.
 *
 * Two allowances are development-only and never reach production:
 * 'unsafe-eval', because React uses eval() for debugging features such as
 * reconstructing callstacks; and va.vercel-scripts.com, because @vercel/analytics
 * swaps to a debug script hosted there when NODE_ENV is not production. In
 * production the analytics script is same-origin at /_vercel/insights, so 'self'
 * already covers both loading it and its beacons.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval' https://va.vercel-scripts.com" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  `connect-src 'self'${isDev ? " ws: http://localhost:*" : ""}`,
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

/**
 * Served at enzohiu.com/memorizer, which the portfolio project proxies through
 * to this deployment — the same arrangement recruitingos and pokefolio use. The
 * base path makes every route, asset and link carry the prefix so the proxy can
 * forward them unchanged.
 */
const BASE_PATH = "/memorizer";

const nextConfig: NextConfig = {
  basePath: BASE_PATH,

  experimental: {
    /**
     * Behind the proxy the browser's Origin is the portfolio's domain while this
     * app answers on its own, so Server Actions would be rejected as
     * cross-origin without naming the hosts that are allowed to reach them.
     */
    serverActions: {
      allowedOrigins: [
        "enzohiu.com",
        "www.enzohiu.com",
        "memorizer-gamma.vercel.app",
        "localhost:3000",
      ],
    },
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
