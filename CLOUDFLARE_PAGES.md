# Cloudflare Pages deployment

This is an Expo Router single-page web export. Cloudflare Pages serves the
generated `dist/` directory. With no top-level `404.html`, Pages automatically
serves the SPA entry point for client-side routes opened directly or refreshed.

## Connect the GitHub repository

Create a Pages project from `muhammedshibiliraihsoft-art/festos` and use:

- Production branch: `main`
- Root directory: `/` (repository root)
- Build command: `npm run build:web`
- Build output directory: `dist`
- Cloudflare's automatic install: `npm clean-install` from `package-lock.json`
- Node.js version: `22` (set `NODE_VERSION=22` in the Pages build environment)

Git integration can build and deploy each push. A Wrangler project config is
unnecessary because the Pages project settings above define this build. To
preview the exported site in the Cloudflare Pages runtime locally, run
`npx wrangler pages dev dist` after building.

## Build environment variables

Set the variables in the Cloudflare Pages project's Production and Preview
environment settings before building. Expo inlines `EXPO_PUBLIC_*` values into
the browser bundle, so these values are public to every visitor:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (preferred) or
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` (compatibility fallback)
- `EXPO_PUBLIC_ENABLE_ONBOARDING` (optional; default `false`)
- `EXPO_PUBLIC_ENABLE_COMMUNICATION_CENTER` (optional; default `false`)
- `EXPO_PUBLIC_CUSTOM_RENDERER_ENABLED` (optional; default `false`)
- `EXPO_PUBLIC_STORAGE_PROVIDER` (default `r2`, matching the source; target R2
  credentials must be configured before uploads work)
- `EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET` (only if using a non-default bucket)
- `EXPO_PUBLIC_R2_BUCKET` and `EXPO_PUBLIC_R2_PUB_DOMAIN` (only when the
  frontend uses public R2 assets)

Never add a Supabase service-role key, Supabase secret key, database password,
R2 secret/access key, or Supabase CLI access token to Pages frontend variables.
Those are server-side credentials and do not belong in this static frontend.
The user's latest target local ENV enables onboarding (`true`) and leaves
Communication Center disabled (`false`). Use the intended values in Pages too;
changing an ignored local ENV does not change hosted Pages build settings.
If `EXPO_PUBLIC_GEMINI_API_KEY` is enabled, it is also visible in the browser;
use a restricted key or move privileged calls behind a server-side endpoint.

## Verify before launch

Run `npm ci` and `npm run build:web`, then confirm `dist/index.html` exists and
there is no top-level `dist/404.html`. Configure the target Supabase Auth allowed redirect
URLs to include both the production Pages hostname and any custom domain before
testing login, OAuth callbacks, email links, or password recovery.

The existing `vercel.json` is intentionally retained; it does not affect
Cloudflare Pages and keeps the existing Vercel deployment configuration intact.
