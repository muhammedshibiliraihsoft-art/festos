# Festos clone migration report

Observed: 2026-11-05 (Asia/Kolkata).

## Source and target boundaries

- Source repository: consoliumfestival-blip/conso-repo, main; source Supabase project negkevoetuvuqqlecdno is production and was accessed using SELECT/catalog reads only.
- Target repository: muhammedshibiliraihsoft-art/festos; target Supabase project ahgvnikufbaszopilzdn.
- The two GitHub main refs were verified at starting commit 2c671d1d15f4484c693905424120fc25a2460688. Application code required no source-to-target copy.
- No source database write endpoint, migration, DDL, DML, Auth/Storage operation, secret update, or deployment action was performed.

## Verified target database result

- Migration history contains 63 entries: the existing 24, 36 pending application migrations, one source-schema prerequisite migration, one source-routine parity migration, and one global reference-data migration.
- Target application catalog has 79 base tables and 6 views. Public schema contains 72 tables and 6 views. Public functions, triggers, constraints, indexes, and RLS policies match source counts. Application-owned helper-schema object counts were also compared by schema.
- Added source-missing routines: 8. Definitions, owner, SECURITY DEFINER, pinned search_path, and execute ACLs match source; three CRLF-bodied definitions compare equal after line-ending normalization. Added triggers: 2; definitions and enabled state match source.
- Added supporting schema: public.result_team_awards and group_entry_private.registration_delete_authorizations; no source rows were copied to either.
- Imported global reference/configuration rows: categories 11, items 170, scoring rules 83, scoring criteria 384, and feature flags 1. Target and read-only source row counts plus canonical row hashes match for all five sets.
- No tenant-scoped data was imported. Target counts verified as 0 for tenants, festivals, profiles, and audit logs. Auth users, Storage buckets, and Storage objects are also 0. Points configuration/version rows were excluded.
- Six historical seed/backfill migrations are target-safe in this repository. A top-level SQL scan found only the final global-reference migration contains migration-time INSERT statements; business DML in the other files is inside function definitions. DO-block rewriting updates stored function definitions, not tenant table rows.

## Validation

- The two new migrations plus their migration-history inserts were executed in a target transaction ending with ROLLBACK; the dry-run succeeded and read-only checks confirmed no changes remained.
- The same two migrations were then applied together in one target transaction. Read-after-write checks verified migration history, catalog entries, imported row counts, and source/target canonical row hashes.
- Target app-level catalog counts match the read-only source inventory. Three routine bodies differed only in CRLF versus LF encoding; normalized definitions and bodies match exactly.
- `node --check` passed for the four updated clone-management scripts; a local query-scope check passed for all seven helper schemas.
- `node --test tests/safe-group-delete.test.cjs tests/safe-individual-deselect.test.cjs tests/team-leader-self-update.test.cjs`: 34 passed, 0 failed.
- `npm run build:web`: passed and exported `dist`; Metro reported stale Browserslist data and CSS parser warnings.
- A separate `group-participation.test.cjs` attempt could not initialize its VM harness (`ReferenceError: require is not defined`). No test or app code was changed to bypass it.
- No tenant workflow E2E was run. Application source files were unchanged, and the target has no tenant fixtures for business-flow E2E.
- `npm audit --omit=dev` reported 54 production-tree advisories (2 low, 24 moderate, 25 high, 3 critical). No dependency changes were made; review and remediate this before public production deployment.

## Safety notes

- Source project remained read-only throughout this task; only target project ahgvnikufbaszopilzdn received migration writes.
- group_entry_private.registration_delete_authorizations has RLS disabled in both source and target, with table privileges limited to postgres and zero rows. This was preserved as found; no client-role grants were added.
- Supabase-managed migration-ledger catalog metadata differs by one constraint/index between projects. It was not changed because it is platform-owned; application catalog parity is unaffected.
- Target-only global data migration is guarded against tenant/festival-scoped payloads and destination ID/key collisions.
- No deployment command was run. A repository-linked deployment, if configured, was not checked.
