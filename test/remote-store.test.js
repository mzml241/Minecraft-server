const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { RemoteStore } = require('../remote-store');

// Minimal in-memory Hrana pipeline server standing in for Turso.
function fakeTurso() {
  const rows = new Map();
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      if (req.headers.authorization !== 'Bearer secret') { res.writeHead(401); return res.end('nope'); }
      const { requests } = JSON.parse(body);
      const results = [];
      for (const r of requests) {
        if (r.type === 'close') { results.push({ type: 'ok', response: { type: 'close' } }); continue; }
        const sql = r.stmt.sql, args = r.stmt.args.map(a => a.type === 'null' ? null : a.value);
        let out = { cols: [], rows: [] };
        if (/^INSERT/i.test(sql)) rows.set(args[0], { path: args[0], content: args[1], sha256: args[2], updated_at: args[3] });
        else if (/^SELECT/i.test(sql)) {
          out.cols = ['path', 'content', 'sha256', 'updated_at'].map(name => ({ name }));
          out.rows = [...rows.values()].map(v => out.cols.map(c => ({ type: 'text', value: v[c.name] })));
        }
        results.push({ type: 'ok', response: { type: 'execute', result: out } });
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ results }));
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, rows, url: `http://127.0.0.1:${server.address().port}` })));
}

test('remote store is a no-op without credentials', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-rs-'));
  const store = new RemoteStore({ dataDir: dir, url: '', token: '' });
  assert.equal(store.enabled, false);
  assert.deepEqual(await store.pull(), { restored: 0 });
  assert.deepEqual(await store.push(), { pushed: 0 });
});

test('push mirrors tracked files and pull restores them into an empty DATA_DIR', async () => {
  const { server, rows, url } = await fakeTurso();
  try {
    const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-rs-a-'));
    fs.mkdirSync(path.join(dirA, 'worlds'));
    fs.writeFileSync(path.join(dirA, 'accounts.json'), JSON.stringify({ accounts: { bob: 1 } }));
    fs.writeFileSync(path.join(dirA, 'worlds', 'main.json'), JSON.stringify({ seed: 42 }));
    fs.writeFileSync(path.join(dirA, 'worlds', 'ignored.txt'), 'x');
    fs.writeFileSync(path.join(dirA, 'voxelcraft.sqlite'), 'binary');

    const a = new RemoteStore({ dataDir: dirA, url, token: 'secret' });
    assert.equal(a.enabled, true);
    assert.deepEqual(await a.push(), { pushed: 2 });
    assert.deepEqual([...rows.keys()].sort(), ['accounts.json', 'worlds/main.json']);
    // unchanged content is not re-uploaded
    assert.deepEqual(await a.push(), { pushed: 0 });
    fs.writeFileSync(path.join(dirA, 'accounts.json'), JSON.stringify({ accounts: { bob: 1, amy: 2 } }));
    assert.deepEqual(await a.push(), { pushed: 1 });

    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-rs-b-'));
    const b = new RemoteStore({ dataDir: dirB, url, token: 'secret' });
    const pulled = await b.pull();
    assert.equal(pulled.restored, 2);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dirB, 'accounts.json'), 'utf8')), { accounts: { bob: 1, amy: 2 } });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dirB, 'worlds', 'main.json'), 'utf8')), { seed: 42 });
    // nothing changed locally after pull, so no push needed
    assert.deepEqual(await b.push(), { pushed: 0 });
  } finally {
    server.close();
  }
});

test('pull reports errors instead of throwing when the remote is unreachable', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-rs-'));
  const store = new RemoteStore({ dataDir: dir, url: 'http://127.0.0.1:1', token: 'secret' });
  const result = await store.pull();
  assert.equal(result.restored, 0);
  assert.ok(result.error);
});
