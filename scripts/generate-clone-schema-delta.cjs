// Generate target-only DDL from read-only catalog snapshots. Never executes SQL.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const input = process.argv.find(x => x.startsWith('--catalog='))?.slice(10);
const output = process.argv.find(x => x.startsWith('--out='))?.slice(6);
if (!input || !output) throw new Error('Usage: --catalog=<catalog-json> --out=<migration-sql>');
if (fs.existsSync(output)) throw new Error('Refusing to overwrite an existing migration');
const catalog = JSON.parse(fs.readFileSync(input, 'utf8'));
const { source, target } = catalog;
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const table = (name, schema = 'public') => `${quote(schema)}.${quote(name)}`;
const signature = f => `${f.schema}.${f.name}(${f.arguments})`;
const functionName = f => `${quote(f.schema)}.${quote(f.name)}(${f.arguments})`;
const relationKey = obj => `${obj.schema}.${obj.table_name || obj.name}`;
const key = obj => `${obj.schema}.${obj.table_name}.${obj.name}`;
const byName = list => new Map(list.map(x => [relationKey(x), x]));
const byKey = list => new Map(list.map(x => [key(x), x]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sha = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
if (!same(source.types, target.types)) throw new Error('Types differ: explicit type migration review is required');
if (!same(source.default_grants, target.default_grants)) {
  throw new Error('Default grants differ: explicit privilege migration review is required');
}
const targetTables = byName(target.relations);
const targetColumns = byKey(target.columns);
const targetFunctions = new Map(target.functions.map(f => [signature(f), f]));
const newTables = source.relations.filter(t => !targetTables.has(relationKey(t)));
if (newTables.some(t => t.kind !== 'r')) throw new Error('New non-table relation requires explicit review');

const statements = [];
const counts = {};
function section(name, sql) {
  counts[name] = sql.length;
  if (sql.length) statements.push(`\n-- ${name}\n${sql.join('\n\n')}`);
}
function columnDefinition(c) {
  if (c.identity || c.generated || c.collation) throw new Error(`Special column requires review: ${key(c)}`);
  return `${quote(c.name)} ${c.type}${c.default_expression == null ? '' : ` DEFAULT ${c.default_expression}`}${c.not_null ? ' NOT NULL' : ''}`;
}
const previousSchemas = new Set(target.schemas.map(s => s.name));
section('Application helper schemas', source.schemas.filter(s => !previousSchemas.has(s.name))
  .map(s => `CREATE SCHEMA ${quote(s.name)} AUTHORIZATION ${quote(s.owner)};`));
section('Create missing tables without business rows', newTables.map(t =>
  `CREATE TABLE ${table(t.name, t.schema)} (\n${source.columns.filter(c => relationKey(c) === relationKey(t))
    .map(c => `  ${columnDefinition(c)}`).join(',\n')}\n);\nALTER TABLE ${table(t.name, t.schema)} OWNER TO ${quote(t.owner)};`));
const columnSql = [];
for (const c of source.columns) {
  if (!targetTables.has(relationKey(c))) continue;
  const previous = targetColumns.get(key(c));
  if (!previous) columnSql.push(`ALTER TABLE ${table(c.table_name, c.schema)} ADD COLUMN ${columnDefinition(c)};`);
  else {
    for (const property of ['type', 'identity', 'generated', 'collation']) {
      if (c[property] !== previous[property]) throw new Error(`Column ${property} changed; explicit review required: ${key(c)}`);
    }
    if (c.default_expression !== previous.default_expression) {
      columnSql.push(`ALTER TABLE ${table(c.table_name, c.schema)} ALTER COLUMN ${quote(c.name)} ${c.default_expression == null ? 'DROP DEFAULT' : `SET DEFAULT ${c.default_expression}`};`);
    }
    if (c.not_null !== previous.not_null) {
      columnSql.push(`ALTER TABLE ${table(c.table_name, c.schema)} ALTER COLUMN ${quote(c.name)} ${c.not_null ? 'SET' : 'DROP'} NOT NULL;`);
    }
  }
}
section('Add fields and align structural defaults and nullability', columnSql);

const updatedFunctions = source.functions.filter(f => !targetFunctions.has(signature(f))
  || f.definition !== targetFunctions.get(signature(f)).definition);
for (const f of updatedFunctions) {
  const previous = targetFunctions.get(signature(f));
  if (previous && f.result !== previous.result) throw new Error(`Return type changed: ${signature(f)}`);
  if (/sbp_[a-f0-9]{20,}|sb_secret_[A-Za-z0-9_-]{15,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(?:negkevoetuvuqqlecdno|ahgvnikufbaszopilzdn)/i.test(f.definition)) {
    throw new Error(`Source-bound credential or URL requires review in function ${f.name}`);
  }
}
section('Current source function definitions, not function execution', updatedFunctions
  .sort((a, b) => a.oid - b.oid)
  .map(f => `${f.definition.trim().replace(/;?$/, ';')}\nALTER FUNCTION ${functionName(f)} OWNER TO ${quote(f.owner)};`));

const previousConstraints = byKey(target.constraints);
// Constraint triggers create their own pg_constraint row when CREATE CONSTRAINT
// TRIGGER runs below. pg_get_constraintdef's "TRIGGER ..." is not ADD CONSTRAINT SQL.
section('Constraints', source.constraints.filter(c => c.type !== 't' && (!previousConstraints.has(key(c))
  || c.definition !== previousConstraints.get(key(c)).definition))
  .sort((a, b) => (a.type === 'f') - (b.type === 'f'))
  .map(c => `${previousConstraints.has(key(c)) ? `ALTER TABLE ${table(c.table_name, c.schema)} DROP CONSTRAINT ${quote(c.name)};\n` : ''}ALTER TABLE ${table(c.table_name, c.schema)} ADD CONSTRAINT ${quote(c.name)} ${c.definition};`));

const previousIndexes = byKey(target.indexes);
section('Non-constraint indexes', source.indexes.filter(i => !i.constraint_backed
  && (!previousIndexes.has(key(i)) || previousIndexes.get(key(i)).definition !== i.definition))
  .map(i => `${previousIndexes.has(key(i)) ? `DROP INDEX ${quote(i.schema)}.${quote(i.name)};\n` : ''}${i.definition};`));

const previousTriggers = byKey(target.triggers);
section('Triggers', source.triggers.filter(t => !previousTriggers.has(key(t))
  || !same(t, previousTriggers.get(key(t)))).map(t => {
    const enabled = { O: 'ENABLE', D: 'DISABLE', R: 'ENABLE REPLICA', A: 'ENABLE ALWAYS' }[t.enabled];
    if (!enabled) throw new Error(`Unknown trigger state: ${key(t)}`);
    return `${previousTriggers.has(key(t)) ? `DROP TRIGGER ${quote(t.name)} ON ${table(t.table_name, t.schema)};\n` : ''}${t.definition};\nALTER TABLE ${table(t.table_name, t.schema)} ${enabled} TRIGGER ${quote(t.name)};`;
  }));

const previousPolicies = byKey(target.policies);
section('Row access policies', source.policies.filter(p => !previousPolicies.has(key(p))
  || !same(p, previousPolicies.get(key(p)))).map(p =>
    `${previousPolicies.has(key(p)) ? `DROP POLICY ${quote(p.name)} ON ${table(p.table_name, p.schema)};\n` : ''}CREATE POLICY ${quote(p.name)} ON ${table(p.table_name, p.schema)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(r => r === 'public' ? 'PUBLIC' : quote(r)).join(', ')}${p.qual ? ` USING (${p.qual})` : ''}${p.with_check ? ` WITH CHECK (${p.with_check})` : ''};`));
section('Row level security flags', source.relations.filter(t => t.kind === 'r'
  && (!targetTables.has(relationKey(t)) || t.rls !== targetTables.get(relationKey(t)).rls
    || t.force_rls !== targetTables.get(relationKey(t)).force_rls)).map(t =>
    `ALTER TABLE ${table(t.name, t.schema)} ${t.rls ? 'ENABLE' : 'DISABLE'} ROW LEVEL SECURITY;\nALTER TABLE ${table(t.name, t.schema)} ${t.force_rls ? 'FORCE' : 'NO FORCE'} ROW LEVEL SECURITY;`));
section('Replica identity', source.relations.filter(t => ['r', 'p'].includes(t.kind)
  && t.replica_identity && t.replica_identity !== (targetTables.get(relationKey(t))?.replica_identity || 'd'))
  .map(t => {
    const mode = { d: 'DEFAULT', f: 'FULL', n: 'NOTHING' }[t.replica_identity];
    if (!mode) throw new Error(`Replica identity index requires review: ${relationKey(t)}`);
    return `ALTER TABLE ${table(t.name, t.schema)} REPLICA IDENTITY ${mode};`;
  }));

function grantSql(sourceGrants, targetGrants, objects, objectKey, objectSql) {
  return objects.flatMap(obj => {
    const identity = objectKey(obj);
    const desired = sourceGrants.filter(g => objectKey(g) === identity);
    const previous = targetGrants.filter(g => objectKey(g) === identity);
    if (same(desired, previous)) return [];
    // A newly created object inherits target default ACLs before explicit grants.
    // Reset Supabase client/service principals even when absent from the old snapshot.
    const roles = [...new Set(['PUBLIC', 'anon', 'authenticated', 'service_role',
      ...desired.map(g => g.grantee), ...previous.map(g => g.grantee)])];
    const role = name => name === 'PUBLIC' ? name : quote(name);
    return [roles.map(r => `REVOKE ALL PRIVILEGES ON ${objectSql(obj)} FROM ${role(r)};`).join('\n'),
      ...desired.map(g => `GRANT ${g.privilege} ON ${objectSql(obj)} TO ${role(g.grantee)}${g.grantable ? ' WITH GRANT OPTION' : ''};`)];
  });
}
section('Schema grants', grantSql(source.schema_grants, target.schema_grants,
  source.schemas, x => x.name, s => `SCHEMA ${quote(s.name)}`));
section('Table grants', grantSql(source.table_grants, target.table_grants,
  source.relations.filter(t => ['r', 'p', 'v', 'm'].includes(t.kind)), relationKey, t => `TABLE ${table(t.name, t.schema)}`));
section('Function grants', grantSql(source.function_grants, target.function_grants,
  source.functions, signature, f => `FUNCTION ${functionName(f)}`));
const publicationKey = p => `${p.publication}.${p.schema}.${p.table_name}`;
const previousPublications = new Set(target.publications.map(publicationKey));
section('Realtime publication membership', source.publications.filter(p => !previousPublications.has(publicationKey(p)))
  .map(p => `ALTER PUBLICATION ${quote(p.publication)} ADD TABLE ${quote(p.schema)}.${quote(p.table_name)};`));

const sql = `-- TARGET ONLY: ahgvnikufbaszopilzdn\n-- Source catalog observed: ${catalog.observed_at}\n-- Source Supabase was queried only through the read-only catalog endpoint.\n-- This generator emits schema DDL only; approved global reference rows use a separate migration.
-- No tenant-owned rows, Auth users, Storage objects or points-configuration records imported.\n-- source_catalog_sha256=${sha(source)}\n-- target_catalog_sha256=${sha(target)}\nBEGIN;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '90s';\nSET LOCAL check_function_bodies = false;\n${statements.join('\n')}\n\nNOTIFY pgrst, 'reload schema';\nCOMMIT;\n`;
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output, sql);
console.log(JSON.stringify({ migration: output, sections: counts, bytes: Buffer.byteLength(sql), executed: false }, null, 2));
