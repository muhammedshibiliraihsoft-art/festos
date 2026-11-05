// Configure only the verified target. Refuses to overwrite existing secret names.
const fs = require('node:fs');
const input = process.argv.find(x => x.startsWith('--env='))?.slice(6);
if (!input) throw new Error('Usage: --env=<ignored-target-env-path>');
const env = Object.fromEntries(fs.readFileSync(input, 'utf8').split(/\r?\n/)
  .map(line => line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
  .map(m => [m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]));
const target = 'ahgvnikufbaszopilzdn';
async function main() {
  if (env.CLONE_SUPABASE_PROJECT_REF !== target
    || new URL(env.CLONE_SUPABASE_URL).hostname !== `${target}.supabase.co`) {
    throw new Error('Target project identity mismatch');
  }
  if (!env.SUPABASE_ACCESS_TOKEN?.startsWith('sbp_')) throw new Error('Target management token missing');
  const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
  const missing = required.filter(name => !env[name] || /^(replace|your_|<)/i.test(env[name]));
  if (missing.length) throw new Error(`Missing target configuration: ${missing.join(', ')}`);
  const names = [...required, 'R2_PUBLIC_DOMAIN'].filter(name => Boolean(env[name]));
  const url = `https://api.supabase.com/v1/projects/${target}/secrets`;
  const headers = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' };
  const before = await fetch(url, { headers });
  if (!before.ok) throw new Error(`Target secret-name inventory HTTP ${before.status}`);
  const existing = new Set((await before.json()).map(s => s.name));
  const conflicts = names.filter(name => existing.has(name));
  if (conflicts.length) throw new Error(`Refusing to overwrite configured secrets: ${conflicts.join(', ')}`);
  const response = await fetch(url, {
    method: 'POST', headers, body: JSON.stringify(names.map(name => ({ name, value: env[name] }))),
  });
  if (!response.ok) throw new Error(`Target secret configuration HTTP ${response.status}`);
  const after = await fetch(url, { headers });
  if (!after.ok) throw new Error(`Target secret verification HTTP ${after.status}`);
  const verified = new Set((await after.json()).map(s => s.name));
  if (names.some(name => !verified.has(name))) throw new Error('Target secret-name verification incomplete');
  console.log(`Configured target secret names: ${names.join(', ')}. Values suppressed.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
