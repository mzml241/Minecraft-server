const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'shared', 'block-registry.json'), 'utf8'));
const client = fs.readFileSync(path.join(root, 'client', 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('block contract is contiguous and shape-aware IDs are shared', () => {
  const ids = Object.values(contract.ids).map(Number).sort((a, b) => a - b);
  assert.deepEqual(ids, Array.from({ length: ids.length }, (_, index) => index + 1));
  assert.equal(contract.ids.door, 44);
  assert.equal(contract.ids.oak_stairs, 54);
  assert.equal(contract.blockShapes[String(contract.ids.door)], 'door');
  assert.equal(contract.blockShapes[String(contract.ids.oak_stairs)], 'stair');
  assert.equal(contract.blockShapes[String(contract.ids.oak_slab)], 'slab');
});

test('client and server implement the same stateful shape protocol', () => {
  for (const source of [client, server]) {
    assert.match(source, /blockStates/);
    assert.match(source, /normalizeBlockState/);
    assert.match(source, /door/);
  }
  assert.match(client, /function localShapeBoxes\(/);
  assert.match(client, /function rayIntersectsLocalBox\(/);
  assert.match(client, /function scheduleDoorAnimation\(/);
  assert.match(server, /function serverBlockCollisionBoxes\(/);
  assert.match(server, /function serverDoorGroup\(/);
  assert.match(server, /message\.type === 'doorPlace'/);
  assert.match(server, /state: id===0\?null:world\.blockStates\[key\]/);
});
