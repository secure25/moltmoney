#!/usr/bin/env node
/**
 * Local PostgreSQL manager (no Docker required).
 *
 * Uses the PostgreSQL binaries bundled by the `embedded-postgres` npm package
 * and drives them with `initdb` / `pg_ctl` so the server runs detached from
 * this script — exactly like `docker-compose up -d` / `down`.
 *
 * Commands:
 *   node scripts/db.mjs up      # init (first run), start, create DB if missing
 *   node scripts/db.mjs down    # fast shutdown
 *   node scripts/db.mjs status  # is the server running?
 *   node scripts/db.mjs logs    # tail the server log
 *   node scripts/db.mjs reset   # stop + wipe the data dir (destroys local data)
 *
 * Configuration (all optional, via environment):
 *   MOLTMONEY_PG_DIR       data directory, default: .pgdata (repo root, gitignored)
 *   MOLTMONEY_PG_PORT      default: 54329 (avoids clashing with any system Postgres)
 *   MOLTMONEY_PG_USER      default: moltmoney
 *   MOLTMONEY_PG_DB        default: moltmoney
 *   MOLTMONEY_PG_PASSWORD  default: moltmoney_dev (auth is 'trust' locally, so any
 *                          password in DATABASE_URL is accepted)
 */
import { createRequire } from 'node:module';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PG_DIR = path.resolve(repoRoot, process.env.MOLTMONEY_PG_DIR || '.pgdata');
const PORT = parseInt(process.env.MOLTMONEY_PG_PORT || '54329', 10);
const USER = process.env.MOLTMONEY_PG_USER || 'moltmoney';
const DB = process.env.MOLTMONEY_PG_DB || 'moltmoney';
const LOG_FILE = path.join(PG_DIR, 'server.log');

const platformPkg = {
  'win32-x64': '@embedded-postgres/windows-x64',
  'darwin-arm64': '@embedded-postgres/darwin-arm64',
  'darwin-x64': '@embedded-postgres/darwin-x64',
  'linux-x64': '@embedded-postgres/linux-x64',
  'linux-arm64': '@embedded-postgres/linux-arm64',
}[`${process.platform}-${process.arch}`];

if (!platformPkg) {
  console.error(`Unsupported platform: ${process.platform}-${process.arch}`);
  console.error('Install Docker and use `npm run docker:up` instead, or add a platform package for your system.');
  process.exit(1);
}

let binDir = null;
const pkgJsonCandidates = [];
try {
  pkgJsonCandidates.push(path.dirname(require.resolve(`${platformPkg}/package.json`)));
} catch {
  // package "exports" may block subpath resolution — fall through to paths
}
pkgJsonCandidates.push(
  path.join(repoRoot, 'node_modules', platformPkg),
  path.join(repoRoot, 'node_modules', 'embedded-postgres', 'node_modules', platformPkg)
);
for (const candidate of pkgJsonCandidates) {
  if (existsSync(path.join(candidate, 'package.json'))) {
    binDir = path.join(candidate, 'native', 'bin');
    break;
  }
}
if (!binDir) {
  console.error(`Could not find ${platformPkg}. Run "npm install" at the repo root first.`);
  process.exit(1);
}

const exe = (name) =>
  path.join(binDir, process.platform === 'win32' ? `${name}.exe` : name);

function run(cmd, args) {
  // 'ignore' everywhere: pg_ctl's grandchild (postgres.exe) inherits handles,
  // and any inherited stdout pipe would keep callers' pipelines from seeing EOF.
  // Diagnostics come from exit codes + the server log file.
  const res = spawnSync(cmd, args, { stdio: 'ignore' });
  return { status: res.status ?? 1, stdout: '', stderr: '' };
}

function isRunning() {
  return run(exe('pg_ctl'), ['-D', PG_DIR, 'status']).status === 0;
}

function cmdUp() {
  if (isRunning()) {
    console.log(`Postgres is already running on port ${PORT} (data dir: ${PG_DIR})`);
    return 0;
  }

  if (!existsSync(path.join(PG_DIR, 'PG_VERSION'))) {
    console.log(`Initialising PostgreSQL data directory at ${PG_DIR} ...`);
    const init = run(exe('initdb'), ['-D', PG_DIR, '-U', USER, '-A', 'trust', '-E', 'UTF8', '--no-locale']);
    if (init.status !== 0) {
      console.error('initdb failed.');
      return 1;
    }
  }

  console.log(`Starting PostgreSQL on localhost:${PORT} ...`);
  // Windows mitigations (see README):
  // - autovacuum=off: beta embedded binaries' workers crash-loop on some hosts.
  // - shared_buffers=16MB: small mapping => far fewer ASLR "error 487"
  //   shared-memory reattach failures for spawned children.
  const start = run(exe('pg_ctl'), [
    '-D', PG_DIR,
    '-l', LOG_FILE,
    '-o', `-p ${PORT} -c autovacuum=off -c shared_buffers=16MB`,
    'start',
  ]);
  if (start.status !== 0) {
    console.error('Failed to start PostgreSQL. Last log lines:');
    tailLog(15);
    return 1;
  }

  console.log('');
  console.log('PostgreSQL is ready. DATABASE_URL for your .env files:');
  console.log(`  postgresql://${USER}:moltmoney_dev@localhost:${PORT}/${DB}`);
  console.log('');
  console.log('First time? Create the database + schema with:  npm run db:migrate:reset');
  return 0;
}

function cmdDown() {
  if (!isRunning()) {
    console.log('PostgreSQL is not running.');
    return 0;
  }
  const res = run(exe('pg_ctl'), ['-D', PG_DIR, '-m', 'fast', 'stop']);
  return res.status === 0 ? 0 : 1;
}

function cmdStatus() {
  const running = isRunning();
  console.log(running ? `Running on localhost:${PORT} (data dir: ${PG_DIR})` : 'Stopped.');
  return running ? 0 : 1;
}

function tailLog(lines = 30) {
  if (!existsSync(LOG_FILE)) return;
  const content = readFileSync(LOG_FILE, 'utf8').trim().split(/\r?\n/);
  console.log(content.slice(-lines).join('\n'));
}

function cmdLogs() {
  tailLog(40);
  return 0;
}

function cmdReset() {
  cmdDown();
  if (existsSync(PG_DIR)) {
    console.log(`Removing data directory ${PG_DIR} ...`);
    rmSync(PG_DIR, { recursive: true, force: true });
  }
  console.log('Data directory removed. Run "npm run db:up" for a fresh database.');
  return 0;
}

const command = process.argv[2];
const handlers = { up: cmdUp, down: cmdDown, status: cmdStatus, logs: cmdLogs, reset: cmdReset };

if (!handlers[command]) {
  console.error('Usage: node scripts/db.mjs <up|down|status|logs|reset>');
  process.exit(1);
}
process.exit(handlers[command]());
