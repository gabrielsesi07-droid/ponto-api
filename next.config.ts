import type { NextConfig } from "next";
import path from "node:path";

const isVercelBuild =
  process.env.VERCEL === "1" ||
  process.env.npm_lifecycle_event === "build:vercel";

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

// Keep an explicitly requested local QA server separate from the normal preview.
if (process.env.HORACERTA_LOCAL_TEST === "1" && process.env.NODE_ENV !== "production") {
  nextConfig.distDir = ".next-qa";
  // Share the QA preload's Neon configuration with the server runtime.
  nextConfig.serverExternalPackages = ["@neondatabase/serverless"];
}

export default nextConfig;
