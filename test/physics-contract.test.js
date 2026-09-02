const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'client', 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('client and server expose the same authoritative physics contract', () => {
  for (const field of ['onGround', 'inWater', 'sprint', 'fly', 'jump']) {
    assert.match(client, new RegExp(`${field}:`), `client must send ${field}`);
    assert.match(server, new RegExp(`${field}:message\\.${field}`), `server must read ${field}`);
  }
  assert.match(client, /applyServerPhysics\(m\.physics\)/);
  assert.match(server, /physics: PHYSICS_CONFIG/);
  assert.match(server, /serverPlayerGrounded\(/);
  assert.match(server, /serverPlayerInWater\(/);
  assert.match(server, /serverAutoStepPathClear\(/);
  assert.match(client, /moveWithAutoStep\(/);
  assert.match(client, /objectInteractAccepted/);
  assert.match(client, /objectInteractRejected/);
});

test('server collision uses the generated voxel base, not a height-only shortcut', () => {
  assert.match(server, /function serverBaseBlockAt\(/);
  assert.match(server, /function serverCaveAt\(/);
  assert.match(server, /serverBlockIdAt\(x,y,z\)/);
  assert.doesNotMatch(server, /function serverSolidAt\([\s\S]*?return y<=serverMapColumn\(x,z\)\.h;/);
});
