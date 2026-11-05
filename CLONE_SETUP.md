# College clone setup

This repository is the editable application and database-migration target for
Festos (muhammedshibiliraihsoft-art/festos). The Consolium conso-repo repository
and its production Supabase project are read-only references. Do not write to the
source repository or source database.

## Current database contents

As verified on 2026-11-05, target Supabase project ahgvnikufbaszopilzdn has its
versioned schema migrations and tenant-independent reference/configuration rows.
It is not an onboarded college: no tenants, festivals, profiles, audit rows, Auth
users, or Storage buckets/objects were copied. See
[FESTOS_CLONE_REPORT.md](FESTOS_CLONE_REPORT.md) for exact evidence.

The approved global data consists of 11 categories, 170 unscoped items, 83 global
scoring rules, 384 criteria for those rules, and the global
main_admin_dashboard=true feature flag. Tenant/festival-scoped items and
configuration, tenant creation records, users, participants, registrations,
results, marks, audit history, Auth identities, and Storage objects are excluded.
The target-only migration guards the scope and refuses ID/key collisions.

## Run the app

1. Install dependencies with npm ci.
2. Copy .env.example to .env.local and set the new college project's public
   Supabase URL and publishable key. The anon key is only needed if the app's
   compatibility fallback is used.
3. Start the app with npm start (or npm run web).

Only public client keys belong in EXPO_PUBLIC_*. Keep service-role keys,
Supabase secret keys, database passwords, and provider credentials in server-side
secrets.

## Set up Supabase

For a fresh college database, apply this repository's versioned migrations in
order to the verified target project. The target-specific chain removes the
source's tenant/festival seed and backfill operations from six historical
migrations, then adds the approved global data in
20261105000000_festos_global_reference_data.sql. Do not restore those
tenant-specific operations or run the old source repository's migration chain.

The current Festos target already has 63 migration-history entries applied.
Do not reset it or replay migrations manually. The read-only schema-catalog script
uses the Management API read-only endpoint for both projects. The schema-delta
executor reads and writes only the verified target; its default --mode=check
ends with ROLLBACK, and persistent target changes require the explicit
--mode=apply with a versioned migration in this repository.

Function JWT settings are declared in supabase/config.toml. Only the pre-login
resolver disables gateway JWT verification; its handler validates credentials
and rate-limits login attempts. Do not blanket-disable JWT verification for other
functions.

R2 setup is still separate from this database migration. Set target-only server
fields from supabase/functions/.env.example in the ignored management ENV,
then use node scripts/configure-clone-r2-secrets.cjs --env=<ignored-env-path>.
The script refuses to overwrite existing secrets. No source R2 credentials or
objects are transferred.

Create new admin accounts in the new project's Auth system. Never copy production
Auth accounts, tenant records, or Storage objects.