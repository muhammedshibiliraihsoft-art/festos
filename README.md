# Festival Management Platform

Expo application for festival administration, participant and judge workflows,
scheduling, scoring, and public results. The app uses Expo Router and Supabase.

## Quick start

1. Install the pinned dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and configure the new project's public
   Supabase URL and publishable key.
3. Run `npm start` or `npm run web`.

## Supabase and client clone

See [CLONE_SETUP.md](CLONE_SETUP.md) for the schema migration, approved global
reference data, Edge Function setup, and credential-safety guidance. Tenant-owned
production rows, Auth accounts, and Storage objects are not included.
