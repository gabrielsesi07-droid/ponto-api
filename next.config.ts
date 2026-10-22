import type { NextConfig } from "next";
import path from "node:path";

const isVercelBuild =
  process.env.VERCEL === "1" ||
  process.env.npm_lifecycle_event === "build:vercel";

// Fonts are self-hosted by next/font and the Places API is called server-side,
// so the browser only ever talks to this origin.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = isVercelBuild
  ? {
      // Vinext resolves this runtime binding on Cloudflare. Vercel uses its
      // standard process environment through the compatibility module below.
      turbopack: {
        resolveAlias: {
          "cloudflare:workers": "./lib/vercel-cloudflare-workers.ts",
        },
      },
      webpack(config) {
        config.resolve.alias["cloudflare:workers"] = path.resolve(
          process.cwd(),
          "lib/vercel-cloudflare-workers.ts",
        );
        return config;
      },
    }
  : {
      // The Cloudflare/Vinext build keeps its native runtime binding.
    };

nextConfig.headers = async () => [{ source: "/:path*", headers: securityHeaders }];

// Keep an explicitly requested local QA server separate from the normal preview.
if (process.env.HORACERTA_LOCAL_TEST === "1" && process.env.NODE_ENV !== "production") {
  nextConfig.distDir = ".next-qa";
  // Share the QA preload's Neon configuration with the server runtime.
  nextConfig.serverExternalPackages = ["@neondatabase/serverless"];
}

export default nextConfig;
