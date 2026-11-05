// Only the verified TARGET can receive DDL. Source credentials are never used here.
// Default mode validates in a transaction ending in ROLLBACK.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { queries } = require('./clone-schema-catalog.cjs');
const TARGET = 'ahgvnikufbaszopilzdn';
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const tableKey = t => `${t.schema}.${t.name}`;
const qualifiedTable = t => `${quote(t.schema)}.${quote(t.name)}`;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const option = name => process.argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main() {
  const mode = option('mode') || 'check';
  const envPath = option('env'), catalogPath = option('catalog'), migrationPath = option('migration');
  if (!['check', 'apply'].includes(mode) || !envPath || !catalogPath || !migrationPath) {
    throw new Error('Usage: --env=<ignored-env> --catalog=<snapshot> --migration=<sql> --mode=check|apply');
  }
  const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
    .map(line => line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
    .map(m => [m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]));
  if (new URL(env.CLONE_SUPABASE_URL).hostname !== `${TARGET}.supabase.co`
    || env.CLONE_SUPABASE_PROJECT_REF !== TARGET) throw new Error('Target identity mismatch');
  if (!env.SUPABASE_ACCESS_TOKEN?.startsWith('sbp_')) throw new Error('Target management token missing');
  const headers = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' };
  async function query(sql, readOnly = true) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${TARGET}/database/query${readOnly ? '/read-only' : ''}`, {
      method: 'POST', headers, body: JSON.stringify({ query: sql, ...(readOnly ? {} : { read_only: false }) }),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      let message = '';
      try { message = (await response.json()).message || ''; } catch {}
      // Do not output details, queries, row values, credentials or full response bodies.
      message = message.replace(/(?:sbp_|sb_secret_)[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+/g, '[REDACTED]');
      throw new Error(`Target SQL HTTP ${response.status}: ${message.slice(0, 450)}`);
    }
    return response.json();
  }
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  let sql = fs.readFileSync(migrationPath, 'utf8');
  if (!sql.startsWith(`-- TARGET ONLY: ${TARGET}\n`) || !/\nBEGIN;\n/.test(sql)
    || !/COMMIT;\s*$/.test(sql) || !sql.includes(`target_catalog_sha256=${hash(catalog.target)}`)
    || !sql.includes(`source_catalog_sha256=${hash(catalog.source)}`)) {
    throw new Error('Migration snapshot/header validation failed');
  }
  const catalogQuery = 'SELECT jsonb_build_object(' + Object.entries(queries).map(([name, q]) =>
    `'${name}', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (${q}) x)`).join(', ') + ') AS catalog';
  const live = (await query(catalogQuery))[0]?.catalog;
  if (hash(live) !== hash(catalog.target)) throw new Error('Target catalog changed since snapshot: regenerate and review delta');
  const tables = catalog.target.relations.filter(t => t.kind === 'r');
  const countsSql = 'SELECT jsonb_object_agg(name, n) AS counts FROM (' + tables.map(t =>
    `SELECT ${literal(tableKey(t))} AS name, count(*) AS n FROM ${qualifiedTable(t)}`).join(' UNION ALL ') + ') counted';
  const counts = (await query(countsSql))[0]?.counts;
  if (!counts || tables.some(t => !Number.isSafeInteger(Number(counts[tableKey(t)])))) throw new Error('Target row counts unavailable');
  const assertions = catalog.source.relations.filter(t => t.kind === 'r').map(t =>
    `SELECT count(*) INTO observed FROM ${qualifiedTable(t)};\nIF observed <> ${Number(counts[tableKey(t)] || 0)} THEN RAISE EXCEPTION 'Target row-count preservation failed for %', ${literal(tableKey(t))}; END IF;`).join('\n');
  let history = '';
  if (mode === 'apply') {
    const match = path.basename(migrationPath).match(/^(\d{14})_([a-z0-9_]+)\.sql$/);
    if (!match || path.resolve(path.dirname(migrationPath)) !== path.resolve(__dirname, '../supabase/migrations')) {
      throw new Error('Apply requires a versioned migration in the target migration directory');
    }
    const existing = await query(`SELECT count(*)::int AS count FROM supabase_migrations.schema_migrations WHERE version=${literal(match[1])}`);
    if (existing[0]?.count !== 0) throw new Error('Migration version already recorded; refusing duplicate application');
    const body = sql.replace(/^[\s\S]*?\nBEGIN;\n/, '').replace(/COMMIT;\s*$/, '');
    // Dollar quoting keeps function-body regex/backslash syntax intact regardless
    // of the connection's standard_conforming_strings setting.
    const delimiter = `$clone_history_${crypto.createHash('sha256').update(body).digest('hex').slice(0, 16)}$`;
    if (body.includes(delimiter)) throw new Error('Migration history delimiter collision');
    history = `INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES (${literal(match[1])}, ${literal(match[2])}, ARRAY[${delimiter}${body}${delimiter}]::text[]);\n`;
  }
  sql = sql.replace(/COMMIT;\s*$/, `DO $preserve_rows$\nDECLARE observed bigint;\nBEGIN\n${assertions}\nEND;\n$preserve_rows$;\n${history}${mode === 'apply' ? 'COMMIT' : 'ROLLBACK'};\n`);
  console.log(`Executing target-only ${mode}: ${catalog.source.relations.length} expected relations; business row counts must remain unchanged.`);
  try {
    await query(sql, false);
  } catch (error) {
    const afterFailure = (await query(catalogQuery))[0]?.catalog;
    console.error(hash(afterFailure) === hash(catalog.target)
      ? 'Original target catalog verified unchanged after failed transaction.'
      : 'Target catalog differs after failed request: inspect before any retry.');
    throw error;
  }
  const after = (await query(countsSql))[0]?.counts;
  if (hash(counts) !== hash(after)) throw new Error('Target row counts changed after execution: investigate before any retry');
  if (mode === 'check') {
    const rolledBack = (await query(catalogQuery))[0]?.catalog;
    if (hash(rolledBack) !== hash(catalog.target)) throw new Error('Rollback catalog verification failed; inspect target before any retry');
  }
  console.log(JSON.stringify({ target: TARGET, mode, successful: true, originalTableRowCountsUnchanged: true, rollbackCatalogVerified: mode === 'check', sourceAccess: 'none' }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
