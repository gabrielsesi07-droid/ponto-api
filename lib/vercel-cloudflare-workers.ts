// Next.js/Vercel compatibility for code that reads Cloudflare Worker bindings.
// This module is selected only by next.config.ts; Vinext still uses the native
// cloudflare:workers module when building the public Sites deployment.
export const env = process.env;
