# Repository boundary

- Editable target: `https://github.com/muhammedshibiliraihsoft-art/festos.git`. Verify `origin`, worktree, and branch before committing or pushing.
- Read-only source reference: `https://github.com/consoliumfestival-blip/conso-repo.git`. Never edit its checkout or push to it.
- Source production Supabase is read-only. Use catalog inspection and SELECT-only queries; never write schema, data, Auth, Storage, secrets, or deployment settings there.
- Target Supabase project `ahgvnikufbaszopilzdn` is the only database destination. Verify project identity and migration history before changes.
- Preserve the independent college boundary: import only the tenant-independent reference/configuration rows represented by the versioned target migration. Do not copy tenant, festival, user/profile, operational-history, Auth, or Storage data.
- Keep the target migration chain safe for fresh installs. Do not restore source tenant/festival seed or backfill operations removed from the target-specific historical migrations.
- Preserve application routes, APIs, permissions, and valid workflows. Review schema/data effects and existing work before pushing target `main`.
