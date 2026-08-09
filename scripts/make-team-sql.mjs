/**
 * Prints the SQL that creates your team row, with both access codes hashed the
 * same way the API hashes them (PBKDF2-SHA256, 200k iterations, random salt).
 *
 *   node scripts/make-team-sql.mjs "Team name" 2026 <team-code> <editor-code>
 *
 * Paste the output into the Supabase SQL editor. The plaintext codes are never
 * stored anywhere — keep them yourself and hand them out.
 */
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const ITERATIONS = 200_000;

const hashCode = (code) => {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(code.trim(), salt, ITERATIONS, 32, 'sha256');
  return {
    algo: 'pbkdf2-sha256',
    iterations: ITERATIONS,
    salt: salt.toString('base64url'),
    hash: hash.toString('base64url'),
  };
};

const [name = '', season = '', viewCode, editCode] = process.argv.slice(2);

if (!viewCode || !editCode) {
  console.error('Usage: node scripts/make-team-sql.mjs "Team name" 2026 <team-code> <editor-code>');
  process.exit(1);
}
if (viewCode.trim().length < 6) {
  console.error('The team code should be at least 6 characters.');
  process.exit(1);
}
if (editCode.trim().length < 8) {
  console.error('The editor code should be at least 8 characters.');
  process.exit(1);
}
if (viewCode.trim() === editCode.trim()) {
  console.error('The two codes must be different — that is what separates viewers from editors.');
  process.exit(1);
}

const sqlString = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sqlJson = (o) => `${sqlString(JSON.stringify(o))}::jsonb`;

console.log(`-- Creates the team. Safe to re-run: it replaces the existing row's codes.
insert into teams (name, season, view_code, edit_code)
values (${sqlString(name)}, ${sqlString(season)}, ${sqlJson(hashCode(viewCode))}, ${sqlJson(hashCode(editCode))});`);
