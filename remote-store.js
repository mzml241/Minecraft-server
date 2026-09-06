'use strict';
// Durable off-box mirror of the DATA_DIR files (accounts, profiles, ledger,
// reservations and world files) in a Turso / libSQL database.
//
// Why: on Render's free plan the filesystem is ephemeral, so every deploy and
// every spin-down/spin-up starts with an empty DATA_DIR. This module pulls the
// last snapshot from Turso before the server loads its state and pushes any
// changed files back periodically and on shutdown (Render sends SIGTERM before
// both deploys and spin-downs).
//
// Only the JSON snapshots are mirrored. The local voxelcraft.sqlite file is a
// derived cache: the loaders in server.js fall back to JSON when the SQLite
// tables are empty and immediately re-populate them.
//
// Configuration (environment):
//   TURSO_DATABASE_URL   libsql://<db>-<org>.turso.io  (or https://...)
//   TURSO_AUTH_TOKEN     database token from `turso db tokens create <db>`
//   REMOTE_SYNC_INTERVAL_MS  push interval, default 60000
//
// No npm dependency is required: it speaks the Hrana-over-HTTP pipeline API
// with the global fetch that ships with Node 22.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TABLE = 'voxelcraft_files';
const TRACKED = [
  'accounts.json',
  'players.json',
  'database.json',
  'coin-ledger.json',
  'spawn-reservations.json'
];

function log(...args) { console.log(new Date().toISOString(), '[remote-store]', ...args); }

function httpUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  return value.replace(/^libsql:\/\//, 'https://').replace(/^wss?:\/\//, 'https://').replace(/\/+$/, '');
}

class RemoteStore {
  constructor({ dataDir, url = process.env.TURSO_DATABASE_URL, token = process.env.TURSO_AUTH_TOKEN, intervalMs } = {}) {
    this.dataDir = dataDir;
    this.worldDir = path.join(dataDir, 'worlds');
    this.url = httpUrl(url);
    this.token = String(token || '').trim();
    this.intervalMs = Math.max(10000, Number(intervalMs || process.env.REMOTE_SYNC_INTERVAL_MS) || 60000);
    this.hashes = new Map(); // relative path -> sha256 of last pushed content
    this.timer = null;
    this.pushing = null;
    this.ready = false;
    this.lastError = null;
    this.lastPushAt = null;
  }

  get enabled() { return !!(this.url && this.token); }

  async execute(statements) {
    const requests = statements.map(({ sql, args = [] }) => ({
      type: 'execute',
      stmt: { sql, args: args.map(v => v === null || v === undefined ? { type: 'null' } : typeof v === 'number' ? { type: 'integer', value: String(v) } : { type: 'text', value: String(v) }) }
    }));
    requests.push({ type: 'close' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${this.url}/v2/pipeline`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Turso HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
      const payload = await response.json();
      const results = [];
      for (const item of payload.results || []) {
        if (item.type === 'error') throw new Error(`Turso: ${item.error?.message || 'unknown error'}`);
        if (item.response?.type === 'execute') {
          const result = item.response.result;
          const cols = (result.cols || []).map(c => c.name);
          results.push((result.rows || []).map(row => Object.fromEntries(row.map((cell, i) => [cols[i], cell.type === 'null' ? null : cell.type === 'integer' ? Number(cell.value) : cell.value]))));
        }
      }
      return results;
    } finally {
      clearTimeout(timer);
    }
  }

  async ensureSchema() {
    await this.execute([{ sql: `CREATE TABLE IF NOT EXISTS ${TABLE} (path TEXT PRIMARY KEY, content TEXT NOT NULL, sha256 TEXT NOT NULL, updated_at TEXT NOT NULL)` }]);
  }

  // Relative paths that may be mirrored. Anything else is ignored on both sides.
  isTracked(rel) {
    if (TRACKED.includes(rel)) return true;
    return /^worlds\/[A-Za-z0-9_-]{1,40}\.json$/.test(rel);
  }

  localFiles() {
    const out = [];
    for (const name of TRACKED) if (fs.existsSync(path.join(this.dataDir, name))) out.push(name);
    if (fs.existsSync(this.worldDir)) {
      for (const name of fs.readdirSync(this.worldDir)) {
        const rel = `worlds/${name}`;
        if (this.isTracked(rel) && !name.startsWith('.')) out.push(rel);
      }
    }
    return out;
  }

  // Restore the newest remote copy of every tracked file that is missing
  // locally (or older than the remote copy). Runs once before state is loaded.
  async pull() {
    if (!this.enabled) { log('disabled (set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to enable durable storage)'); return { restored: 0 }; }
    try {
      await this.ensureSchema();
      const [rows] = await this.execute([{ sql: `SELECT path, content, sha256, updated_at FROM ${TABLE}` }]);
      let restored = 0;
      for (const row of rows) {
        const rel = String(row.path || '');
        if (!this.isTracked(rel)) continue;
        const target = path.join(this.dataDir, rel);
        let useRemote = true;
        if (fs.existsSync(target)) {
          const localMtime = fs.statSync(target).mtimeMs;
          const remoteTime = Date.parse(row.updated_at) || 0;
          const localHash = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
          useRemote = localHash !== row.sha256 && remoteTime > localMtime;
        }
        if (useRemote) {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          const tmp = `${target}.${process.pid}.tmp`;
          fs.writeFileSync(tmp, row.content);
          fs.renameSync(tmp, target);
          restored += 1;
        }
        this.hashes.set(rel, row.sha256);
      }
      this.ready = true;
      this.lastError = null;
      log(`pull complete · ${rows.length} remote file(s) · ${restored} restored into ${this.dataDir}`);
      return { restored, remote: rows.length };
    } catch (error) {
      this.lastError = error.message;
      log('pull failed:', error.message);
      return { restored: 0, error: error.message };
    }
  }

  // Upload every tracked file whose content changed since the last push.
  async push({ force = false } = {}) {
    if (!this.enabled) return { pushed: 0 };
    if (this.pushing) return this.pushing;
    const run = async () => {
      try {
        if (!this.ready) await this.ensureSchema();
        const statements = [];
        const pending = [];
        const now = new Date().toISOString();
        for (const rel of this.localFiles()) {
          const content = fs.readFileSync(path.join(this.dataDir, rel), 'utf8');
          const sha = crypto.createHash('sha256').update(content).digest('hex');
          if (!force && this.hashes.get(rel) === sha) continue;
          statements.push({
            sql: `INSERT INTO ${TABLE} (path, content, sha256, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET content=excluded.content, sha256=excluded.sha256, updated_at=excluded.updated_at`,
            args: [rel, content, sha, now]
          });
          pending.push([rel, sha]);
        }
        if (!statements.length) return { pushed: 0 };
        await this.execute(statements);
        for (const [rel, sha] of pending) this.hashes.set(rel, sha);
        this.ready = true;
        this.lastError = null;
        this.lastPushAt = now;
        log(`pushed ${pending.length} file(s): ${pending.map(([rel]) => rel).join(', ')}`);
        return { pushed: pending.length };
      } catch (error) {
        this.lastError = error.message;
        log('push failed:', error.message);
        return { pushed: 0, error: error.message };
      }
    };
    // Assign before the first await inside run() can resolve, so concurrent
    // callers share the in-flight upload.
    let promise;
    this.pushing = promise = run().finally(() => { if (this.pushing === promise) this.pushing = null; });
    return promise;
  }

  start() {
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(() => { this.push(); }, this.intervalMs);
    this.timer.unref?.();
    log(`periodic push every ${Math.round(this.intervalMs / 1000)}s`);
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  status() {
    return { enabled: this.enabled, ready: this.ready, lastPushAt: this.lastPushAt, lastError: this.lastError, trackedFiles: this.hashes.size };
  }
}

module.exports = { RemoteStore, TRACKED };
