// Catalog metadata only. Both projects use the Management API's read-only endpoint.
// Never queries application rows, Auth users, Storage objects or secret values.
const fs = require('node:fs');
const path = require('node:path');

const queries = {
  schemas: `SELECT n.nspname AS name, pg_catalog.pg_get_userbyid(n.nspowner) AS owner
    FROM pg_catalog.pg_namespace n WHERE n.nspname='public' ORDER BY n.nspname`,
  schema_grants: `SELECT n.nspname AS name, CASE WHEN a.grantee=0 THEN 'PUBLIC'
    ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee,
    a.privilege_type AS privilege, a.is_grantable AS grantable
    FROM pg_catalog.pg_namespace n CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
    WHERE n.nspname='public' ORDER BY n.nspname,grantee,privilege`,
  default_grants: `SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS owner,
    COALESCE(n.nspname,'') AS schema, d.defaclobjtype AS object_type,
    CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee,
    a.privilege_type AS privilege, a.is_grantable AS grantable
    FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a
    WHERE d.defaclnamespace=0 OR n.nspname='public'
    ORDER BY owner,schema,object_type,grantee,privilege`,
  relations: `SELECT c.relname AS name, c.relkind AS kind, c.relrowsecurity AS rls,
    c.relreplident AS replica_identity,
    c.relforcerowsecurity AS force_rls, pg_catalog.pg_get_userbyid(c.relowner) AS owner
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S') ORDER BY c.relname`,
  columns: `SELECT c.relname AS table_name, a.attname AS name, a.attnum AS position,
    pg_catalog.format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS not_null,
    pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expression,
    a.attidentity AS identity, a.attgenerated AS generated,
    CASE WHEN a.attcollation<>t.typcollation THEN co.collname END AS collation
    FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_type t ON t.oid=a.atttypid
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    LEFT JOIN pg_catalog.pg_collation co ON co.oid=a.attcollation
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0
      AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,
  functions: `SELECT p.oid::int AS oid, p.proname AS name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
    pg_catalog.pg_get_function_result(p.oid) AS result,
    pg_catalog.pg_get_functiondef(p.oid) AS definition,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner,
    l.lanname AS language
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_catalog.pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public' ORDER BY p.oid`,
  constraints: `SELECT c.relname AS table_name, co.conname AS name, co.contype AS type,
    pg_catalog.pg_get_constraintdef(co.oid) AS definition, co.convalidated AS validated
    FROM pg_catalog.pg_constraint co JOIN pg_catalog.pg_class c ON c.oid=co.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' ORDER BY c.relname,co.conname`,
  indexes: `SELECT i.tablename AS table_name, i.indexname AS name, i.indexdef AS definition,
    EXISTS (SELECT 1 FROM pg_catalog.pg_constraint co WHERE co.conindid=c.oid) AS constraint_backed
    FROM pg_catalog.pg_indexes i JOIN pg_catalog.pg_namespace n ON n.nspname=i.schemaname
    JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=i.indexname
    WHERE i.schemaname='public' ORDER BY i.indexname`,
  policies: `SELECT tablename AS table_name, policyname AS name, permissive, roles, cmd,
    qual, with_check FROM pg_catalog.pg_policies WHERE schemaname='public'
    ORDER BY tablename,policyname`,
  triggers: `SELECT c.relname AS table_name, t.tgname AS name,
    pg_catalog.pg_get_triggerdef(t.oid) AS definition, t.tgenabled AS enabled
    FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
  table_grants: `SELECT c.relname AS name, CASE WHEN a.grantee=0 THEN 'PUBLIC'
    ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee,
    a.privilege_type AS privilege, a.is_grantable AS grantable
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,
      pg_catalog.acldefault('r',c.relowner))) a
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m')
    ORDER BY c.relname,grantee,privilege`,
  function_grants: `SELECT p.proname AS name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
    CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END AS grantee,
    a.privilege_type AS privilege, a.is_grantable AS grantable
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl,
      pg_catalog.acldefault('f',p.proowner))) a
    WHERE n.nspname='public' ORDER BY p.proname,arguments,grantee,privilege`,
  types: `SELECT t.typname AS name, t.typtype AS kind,
    ARRAY(SELECT e.enumlabel FROM pg_catalog.pg_enum e WHERE e.enumtypid=t.oid
      ORDER BY e.enumsortorder) AS enum_labels
    FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typtype IN ('e','d') ORDER BY t.typname`,
  publications: `SELECT pubname AS publication, schemaname AS schema, tablename AS table_name
    FROM pg_catalog.pg_publication_tables WHERE schemaname='public'
    ORDER BY pubname,tablename`,
};

// These seven application-owned helper schemas were discovered in the live source.
// Managed Supabase schemas are not recreated. Empty target schemas are captured too.
const applicationSchemas = ['public', 'code_letter_private', 'group_entry_private',
  'private', 'program_read_private', 'scoring_private', 'stage_portal_private',
  'team_substitution_private'];
const schemaList = applicationSchemas.map(name => `'${name}'`).join(',');
const schemaColumns = {
  relations: 'n.nspname', columns: 'n.nspname', functions: 'n.nspname',
  constraints: 'n.nspname', indexes: 'i.schemaname', policies: 'schemaname',
  triggers: 'n.nspname', table_grants: 'n.nspname', function_grants: 'n.nspname', types: 'n.nspname',
};
for (const [name, sql] of Object.entries(queries)) {
  let scoped = sql.replace(/\b(n\.nspname|i\.schemaname|schemaname)='public'/g, `$1 IN (${schemaList})`);
  if (schemaColumns[name]) {
    scoped = scoped.replace(/^SELECT /, `SELECT ${schemaColumns[name]} AS schema, `);
    scoped = scoped.replace(/ORDER BY (?!e\.enumsortorder)/g, `ORDER BY ${schemaColumns[name]},`);
  }
  queries[name] = scoped;
}

async function main() {
  const envPath = process.argv.find(x => x.startsWith('--env='))?.slice(6);
  const output = process.argv.find(x => x.startsWith('--out='))?.slice(6);
  if (!envPath || !output) throw new Error('Usage: --env=<ignored-env-path> --out=<private-catalog-output>');
  const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
    .map(line => line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
    .map(m => [m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]));
  const projects = [
    ['source', 'negkevoetuvuqqlecdno', env.SOURCE_SUPABASE_ACCESS_TOKEN],
    ['target', 'ahgvnikufbaszopilzdn', env.SUPABASE_ACCESS_TOKEN],
  ];
  for (const [name, ref] of projects) {
    const url = name === 'source' ? env.SOURCE_SUPABASE_URL : env.CLONE_SUPABASE_URL;
    if (new URL(url).hostname !== `${ref}.supabase.co`) throw new Error(`${name} project identity mismatch`);
  }
  const query = 'SELECT jsonb_build_object(' + Object.entries(queries).map(([name, sql]) =>
    `'${name}', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (${sql}) x)`).join(', ') + ') AS catalog';
  const catalogs = { observed_at: new Date().toISOString() };
  for (const [name, ref, token] of projects) {
    if (!token?.startsWith('sbp_')) throw new Error(`${name} access token missing`);
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query/read-only`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }), signal: AbortSignal.timeout(45000),
    });
    // Do not echo response bodies: catalog errors can include SQL definitions.
    if (!response.ok) throw new Error(`${name} read-only catalog HTTP ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows[0]?.catalog) throw new Error(`${name} unexpected catalog response`);
    catalogs[name] = rows[0].catalog;
    console.log(`${name}: ${catalogs[name].relations.length} relations, ${catalogs[name].functions.length} functions`);
  }
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(catalogs, null, 2), { mode: 0o600 });
  console.log('Read-only catalogs saved. No application rows or credentials exported.');
}
module.exports = { queries };
if (require.main === module) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
