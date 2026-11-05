# Historical clone update: verified progress

> Historical record for the 2026-10-22 sahi-m-fest → conso-repo clone. It does not describe the current festos repository or its Supabase target. See [FESTOS_CLONE_REPORT.md](FESTOS_CLONE_REPORT.md) for the current clone.

Observed: 2026-10-22. Application schema parity, target Edge Function deployment, GitHub promotion and hosted target smoke checks are verified. The Cloudflare Pages check is still reporting `Building` even though the updated bundle is live.

## Scope and boundaries

- Source repository: `shibilikds133-spec/sahi-m-fest`, local branch `codex/general-team-entry`, HEAD `43a6149c0bdda88b232c1d2e13a3d921be03b40b`, including the current working files.
- Target repository: `consoliumfestival-blip/conso-repo`, local directory `clone-release`, branch `main`, starting HEAD `5e02451474f2471ccfaedfb66bb8097ed322a44a`.
- Source Supabase: `szhwkngspodujiqzblab`. All database requests during this update used `/database/query/read-only`.
- Target Supabase: `negkevoetuvuqqlecdno`. Two reviewed, transactionally checked migrations have been applied and recorded in target migration history.
- No tenant/business rows, users, uploaded objects or points-configuration records are to be copied or seeded. Existing target records are not to be deleted.
- GitHub promotion to `consoliumfestival-blip/conso-repo/main` is part of the user's requested update. Code promotion `8c36cc367eb6369a82c850f9e24e2bca5be80b6e` was pushed and matched the remote `main`; source Git state is preserved.

## GitHub and hosted target verification

- Target commit `8c36cc367eb6369a82c850f9e24e2bca5be80b6e` is present on GitHub `main`; the target worktree was clean after that push.
- User-provided site `https://conso-repo.pages.dev/` returned HTTP 200 with title `Alviora-2k26`. Its served Expo bundle returned HTTP 200 and contained the target Supabase project reference, no source project reference, and route markers for general entries, Team Leader first login and Team Leader programs.
- GitHub's Cloudflare Pages check for that commit remained `in_progress` / `Building` when last read, despite the updated bundle being served. This check status still needs to settle or be reviewed in Cloudflare.
- Target Supabase Auth `site_url` was `http://localhost:3000`. After verifying the user-provided hosted domain, only target `site_url` was changed to `https://conso-repo.pages.dev` and re-read successfully. The extra redirect list remained empty. Source Auth settings were not changed. The app has no `redirectTo`, `emailRedirectTo`, or OAuth redirect call in `src`.

## Verified local code work

The initial source/target comparison found 81 differing `src` files, 18 source-only files and three target-only obsolete files. These were content differences after normalizing line endings.

The local update staged 106 file additions/updates, including unit-test sources. Target originals were backed up outside the repository before replacement:

`C:/Users/Admin/AppData/Local/Temp/festival-target-sync-LG9NhA/original-target`

The corresponding `manifest.json` in that temporary directory records original/source/staged hashes and merge decisions. Temporary artifacts are local only and will not accompany a GitHub push.

- Retained the target calendar fix converting empty registration dates to SQL NULL.
- Retained target deployment documentation, `build:web`, `react-konva` 19.0.10 and the Cloudflare-compatible lockfile.
- Reviewed six conflicting Team Leader files against the newer source frontend/backend contracts. The source versions supersede the older reset/credential implementation; the original dirty target versions remain backed up.
- Removed three unchanged obsolete files: route-local `useEntrySizes.ts`, the mock `useFestivalSettings.ts`, and the unused legacy `resultCalculator.ts`. No source consumers of those paths were found.
- Corrected corrupt bullet/separator text in nine target files. The source files were not edited.
- Removed the Junior import page's compile-time dependency on the source participant dataset. The target now accepts a user-selected JSON file, retaining normalization, validation, conflict checks, backup and import processing. No dataset was copied.
- Scoped the chest-order drag handle's web-only `touchAction` style correctly without changing its web behavior.

## Verified live schema comparison

Direct PostgreSQL inventory failed with `ENOTFOUND`. The Management API read-only endpoint succeeded and provided catalog metadata without application rows.

| Object | Source | Target before update | Missing in target | Changed definitions |
| --- | ---: | ---: | ---: | ---: |
| Public relations | 76 | 68 | 8 | 0 |
| Columns | 884 | 803 | 81 | 24 |
| Public functions | 232 | 178 | 54 | 32 |
| RLS policies | 183 | 177 | 6 | 0 |
| Triggers | 57 | 33 | 24 | 0 |
| Constraints | 311 | 262 | 49 | 2 |
| Indexes | 154 | 134 | 20 | 0 |
| Views | 6 | 6 | 0 | 0 |

The eight missing tables cover chest-number controls/history, general-entry numbering, grace workspaces/submissions, program intake and scoring publication history. Managed Auth/Storage function and trigger hashes match. Public enum definitions match. Source has eight public realtime publication memberships; the target has none. One extension version differs (`pg_net`); extension compatibility remains to be reviewed.

Read-only definition snapshots are stored outside the repository. `scripts/clone-schema-catalog.cjs` reproduces the catalog export using only read-only endpoints and suppresses credentials/row contents in output. `scripts/generate-clone-schema-delta.cjs` prepares DDL from that metadata and does not execute SQL.

The first public-only draft was expanded after transaction validation identified four missing application helper schemas: `code_letter_private`, `group_entry_private`, `scoring_private`, and `stage_portal_private`. These contain three additional tables and 37 helper functions required by the public RPCs. The final scope includes all five application schemas, not only `public`.

Applied target migrations:

- `20261022122300_source_structure_sync.sql`: four helper schemas, 11 tables, structural fields/defaults/nullability, 123 new/replaced functions, constraints, indexes, policies, triggers and realtime memberships.
- `20261022123000_source_grant_parity.sql`: explicit permission correction for target default ACLs inherited by newly created objects. No extra anonymous/client grants remain.

Each migration passed a target transaction ending in ROLLBACK before persistent application. Schema fingerprints were checked before applying, and existing table row counts were asserted unchanged inside and after each transaction. Newly introduced tables were asserted empty. Migration history is technical metadata; no business records were seeded. Failed preparatory attempts were verified to leave the original target catalog unchanged before correction/retry.

Final read-only comparison, ignoring database-local OIDs and additive column ordinal positions:

| Category | Source | Target | Missing / extra / changed |
| --- | ---: | ---: | --- |
| Application schemas | 5 | 5 | 0 / 0 / 0 |
| Relations | 79 | 79 | 0 / 0 / 0 |
| Base-table columns | 821 | 821 | 0 / 0 / 0 |
| Functions | 269 | 269 | 0 / 0 / 0 |
| Policies | 183 | 183 | 0 / 0 / 0 |
| Triggers | 57 | 57 | 0 / 0 / 0 |
| Constraints | 318 | 318 | 0 / 0 / 0 |
| Indexes | 158 | 158 | 0 / 0 / 0 |
| Realtime memberships | 8 | 8 | 0 / 0 / 0 |
| Table grants | 2239 | 2239 | 0 / 0 / 0 |
| Function grants | 853 | 853 | 0 / 0 / 0 |
| Schema grants | 15 | 15 | 0 / 0 / 0 |
| Default grants | 96 | 96 | 0 / 0 / 0 |

Enum definitions and replica identity settings also match. `scripts/verify-clone-schema-parity.cjs` verifies these categories without using application rows as evidence.

## Edge Functions and operational configuration

- Deployed source functions were downloaded to a private temporary directory for read-only comparison. Five match the current local source; the deployed source cron is older than the current local cron. The target's existing hardened cron already matched the current local source and was preserved.
- Updated only target `provision-team-leader` and `resolve-login-identifier`. Fresh target downloads confirm all six deployed entrypoints match the current local source after normalizing line endings/BOM.
- All six target functions are ACTIVE. Five retain JWT verification. The pre-login resolver retains `verify_jwt=false`, matching the checked-in login contract and allowing authentication with publishable keys. Source deployment metadata has `true`; it was not changed. Explicit target settings are now in `supabase/config.toml`.
- Target resolver GET smoke: HTTP 405 with `X-Resolve-Login-Version: login-v2`, proving the deployed handler is reachable without creating records.
- Compared Auth boolean/numeric settings, site URL, redirects and custom-SMTP presence. Other inspected fields matched; neither project has extra redirect URLs. Based on the user-provided production URL, only target Auth `site_url` now uses `https://conso-repo.pages.dev`; source remains `http://localhost:3000`. No secret values or provider credentials were copied.
- Both projects have zero Supabase Storage buckets and zero Storage policies. No buckets or uploaded objects were copied/created.
- Target notification cron remains active on `*/3 * * * *`, points to the target function and uses Vault. Source's older non-Vault command was not copied.
- Target `pg_net` is 0.20.4 versus source 0.20.0. The newer target patch was retained; no platform extension downgrade was attempted. Other inspected extension versions match.
- Added ignored target `.env.local` using only target public credentials. The public key was validated against target Auth settings. Onboarding is enabled as in the user's latest clone ENV; Communication Center remains disabled; storage provider matches source `r2`.
- R2 credentials remain deferred. Public/server templates and a target-only, no-overwrite configuration script are provided. No R2 object transfer or runtime upload was attempted.

## Checks actually executed

- `node --test tests/*.test.cjs` in the target: **25 passed, zero failed**.
- Final target Expo web export with the target public environment, onboarding enabled, and `EXPO_NO_DOTENV=1`: **passed** after the final frontend changes.
- Scanned 11 exported text assets: source project reference absent; target project reference present; no exact matches to the checked private environment credential values.
- Target TypeScript check: **109 diagnostics** after the drag-handle typing correction. A compiler-host comparison against backed-up pre-update target files found 122 baseline diagnostics, 14 resolved diagnostic signatures and one added diagnostic (`touchAction`), subsequently corrected. The final run confirms no `ChestTeamOrderRow.tsx` diagnostic. Typecheck is **not clean**.
- Existing target super-admin login and `get_my_login_profile` RPC: **passed**, with expected admin/super-admin role and NULL tenant. Signed out only the newly opened validation session. No new account was created.
- Hosted target smoke: **passed** for the page and served JavaScript bundle (HTTP 200). The bundle contains the target project reference and selected new feature route markers, with no source project reference. This does not prove authenticated tenant workflows.
- Target Auth `site_url`: **passed** read-after-write verification for `https://conso-repo.pages.dev`; additional redirects remained empty.
- Full tenant/participant/judge/result publishing E2E has not been run because it would require business fixtures prohibited by the user's no-new-data boundary.

## Remaining work

1. Recheck Cloudflare Pages check `119837626391` for the promoted target commit; it was still `Building` after the updated bundle became live.
2. Configure and test target R2 when the user supplies target credentials; no source objects are to be copied.
3. Retain the explicit TypeScript/E2E limitations above. Do not describe build/catalog checks as proof of all tenant workflows.

Historical clone seed migrations remain historical files; this update has not rerun them or removed their existing target records.
