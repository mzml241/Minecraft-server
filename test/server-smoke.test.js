const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const root = path.resolve(__dirname, '..');

function waitForOutput(child, pattern, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for server output ${pattern}:\n${output}`));
    }, timeoutMs);
    const onData = chunk => {
      output += chunk.toString();
      if (pattern.test(output)) {
        cleanup();
        resolve(output);
      }
    };
    const onExit = code => {
      cleanup();
      reject(new Error(`Server exited with code ${code} before becoming ready:\n${output}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('exit', onExit);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', onExit);
  });
}

function waitForMessage(socket, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for expected WebSocket message'));
    }, timeoutMs);
    const onMessage = raw => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message);
    };
    socket.on('message', onMessage);
  });
}

function openAndJoin(port) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    let helloMessage=null;
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('Timed out waiting for WebSocket join response'));
    }, 10000);
    socket.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on('message', raw => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message.type === 'hello') {
        helloMessage=message;
        assert.equal(message.version, 1);
        socket.send(JSON.stringify({
          type: 'join',
          username: 'smoketest',
          password: 'a-safe-test-password',
          name: 'Smoke Test'
        }));
      }
      if (message.type === 'joined') {
        clearTimeout(timer);
        resolve({ socket, message, hello: helloMessage });
      }
    });
  });
}

test('server exposes public APIs and authenticates a WebSocket player', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voxelcraft-server-test-'));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATA_DIR: dataDir,
      PORT: String(port),
      HOST: '127.0.0.1',
      ADMIN_TOKEN: 'test-admin-token',
      SESSION_SECRET: 'test-session-secret-for-smoke-tests'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let joinedSocket;
  try {
    await waitForOutput(child, /VoxelCraft server listening/);
    const base = `http://127.0.0.1:${port}`;

    const health = await fetch(`${base}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });

    const mapResponse = await fetch(`${base}/api/map/tiles?x=0&z=0&radius=96&step=2`);
    assert.equal(mapResponse.status, 200);
    const mapBody = await mapResponse.json();
    assert.equal(mapBody.type, 'mapTiles');
    assert.equal(mapBody.size, 64);
    assert.equal(mapBody.step, 2);
    assert.ok(mapBody.worldId);
    assert.ok(Number.isInteger(mapBody.revision));
    assert.ok(mapBody.tiles.length > 0 && mapBody.tiles.length <= 49);
    assert.ok(mapBody.tiles.every(tile => tile.size === 64 && Buffer.from(tile.indices, 'base64').length === 64 * 64));

    const status = await fetch(`${base}/api/status`);
    assert.equal(status.status, 200);
    const statusBody = await status.json();
    assert.equal(statusBody.activeWorldId, 'main');
    assert.equal(statusBody.maxPlayers, 20);

    const catalog = await fetch(`${base}/api/store/catalog`);
    assert.equal(catalog.status, 200);
    const catalogBody = await catalog.json();
    assert.equal(catalogBody.prefabs.length, 24);
    assert.equal(catalogBody.allPaid, true);

    const quote = await fetch(`${base}/api/land/quote?x=0&z=0`);
    assert.equal(quote.status, 200);
    assert.equal((await quote.json()).parcel.size, 16);

    const unauthorized = await fetch(`${base}/api/admin/worlds?token=test-admin-token`);
    assert.equal(unauthorized.status, 401, 'admin tokens must not be accepted in URLs');
    const authorized = await fetch(`${base}/api/admin/worlds`, { headers: { 'x-admin-token': 'test-admin-token' } });
    assert.equal(authorized.status, 200);

    const joined = await openAndJoin(port);
    joinedSocket = joined.socket;
    assert.equal(joined.message.username, 'smoketest');
    assert.match(joined.message.playerId, /^u_[a-f0-9]{16}$/);
    assert.equal(joined.message.freeClaimAvailable, true);
    assert.equal(joined.message.physics.version, 1);
    assert.equal(joined.message.physics.player.stepHeight, 1.05);
    assert.deepEqual(joined.hello.blockRegistry, { version: 1, maxId: 59 });
    assert.deepEqual(joined.message.blockRegistry, { version: 1, maxId: 59 });
    const worldState = await waitForMessage(joinedSocket, message => message.type === 'worldState');
    assert.deepEqual(worldState.world.blockRegistry, { version: 1, maxId: 59 });
    assert.ok(worldState.world.blockStates && typeof worldState.world.blockStates === 'object');

    const physicsStatus = await (await fetch(`${base}/api/status`)).json();
    assert.equal(physicsStatus.physics.worldHeight, 80);
    assert.equal(physicsStatus.physics.seaLevel, 30);

    const modeMessage = waitForMessage(joinedSocket, message => message.type === 'serverMode' && message.mode === 'survival');
    const modeChange = await fetch(`${base}/api/admin/world/mode`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': 'test-admin-token' },
      body: JSON.stringify({ mode: 'survival' })
    });
    assert.equal(modeChange.status, 200);
    await modeMessage;

    joinedSocket.send(JSON.stringify({
      type: 'playerState',
      x: joined.message.spawn.x,
      y: joined.message.spawn.y,
      z: joined.message.spawn.z,
      mode: 'creative',
      fly: true,
      onGround: false,
      inWater: false,
      sprint: false,
      jump: false
    }));
    const rejectedFlight = await waitForMessage(joinedSocket, message => message.type === 'playerStateRejected');
    assert.equal(rejectedFlight.reason, 'collision_or_teleport');
    await new Promise(resolve => setTimeout(resolve, 25));

    joinedSocket.send(JSON.stringify({
      type: 'playerState',
      x: joined.message.spawn.x,
      y: joined.message.spawn.y,
      z: joined.message.spawn.z,
      mode: 'creative',
      fly: false,
      onGround: true,
      inWater: false,
      sprint: true,
      jump: false,
      selectedBlock: 1
    }));
    const players = await waitForMessage(joinedSocket, message => message.type === 'players' && message.players.some(player => player.id === joined.message.playerId && player.sprint === true));
    const self = players.players.find(player => player.id === joined.message.playerId);
    assert.equal(self.mode, 'survival');
    assert.equal(self.fly, false);
    assert.equal(self.sprint, true);
    assert.equal(self.onGround, true);

    await new Promise(resolve => {
      joinedSocket.once('close', resolve);
      joinedSocket.close(1000, 'test complete');
    });
    joinedSocket = null;
    assert.ok(fs.existsSync(path.join(dataDir, 'database.json')));
    assert.ok(fs.existsSync(path.join(dataDir, 'worlds', 'main.json')));
  } finally {
    if (joinedSocket) joinedSocket.terminate();
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
