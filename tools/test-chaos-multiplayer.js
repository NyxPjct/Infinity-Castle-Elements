const assert = require('assert/strict');
const { once } = require('events');
const { io: createClient } = require('socket.io-client');
const { server, startServer } = require('../server');

function eventOnce(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout waiting for ${event}`));
    }, timeout);
    const handler = payload => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, handler);
  });
}

function expectNoEvent(socket, event, timeout = 300) {
  return new Promise((resolve, reject) => {
    const handler = payload => {
      clearTimeout(timer);
      socket.off(event, handler);
      reject(new Error(`Unexpected ${event}: ${JSON.stringify(payload)}`));
    };
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, timeout);
    socket.on(event, handler);
  });
}

function eventWhere(socket, event, predicate, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout waiting for matching ${event}`));
    }, timeout);
    const handler = payload => {
      let matched = false;
      try { matched = Boolean(predicate(payload)); } catch {}
      if (!matched) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

function emitAck(socket, event, payload, timeout = 4000) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeout).emit(event, payload, (err, response) => {
      if (err) return reject(err);
      resolve(response);
    });
  });
}

async function connect(url) {
  const socket = createClient(url, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true
  });
  await eventOnce(socket, 'connect');
  return socket;
}

async function main() {
  const clients = [];
  try {
    startServer(0, '127.0.0.1');
    if (!server.listening) await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address === 'object', 'Server must expose an address');
    const url = `http://127.0.0.1:${address.port}`;

    const earth = await connect(url); clients.push(earth);
    const created = await emitAck(earth, 'create-room', {
      name: 'Earth',
      element: 'earth',
      mode: 'chaos'
    });
    assert.equal(created.ok, true);
    assert.equal(created.mode, 'chaos');
    assert.equal(created.maxPlayers, 4);
    assert.equal(created.level, 1);
    const code = created.code;
    assert.match(code, /^[A-Z0-9]{6}$/);

    const duplicate = await connect(url); clients.push(duplicate);
    const duplicateJoin = await emitAck(duplicate, 'join-room', {
      code,
      name: 'Duplicate Earth',
      element: 'earth',
      mode: 'chaos'
    });
    assert.equal(duplicateJoin.ok, false);
    assert.match(duplicateJoin.error, /elemento.*ocupado/i);
    duplicate.close();
    clients.splice(clients.indexOf(duplicate), 1);

    const air = await connect(url); clients.push(air);
    const light = await connect(url); clients.push(light);
    const darkness = await connect(url); clients.push(darkness);

    const joins = await Promise.all([
      emitAck(air, 'join-room', { code, name: 'Air', element: 'air', mode: 'chaos' }),
      emitAck(light, 'join-room', { code, name: 'Light', element: 'light', mode: 'chaos' }),
      emitAck(darkness, 'join-room', { code, name: 'Darkness', element: 'darkness', mode: 'chaos' })
    ]);
    for (const joined of joins) {
      assert.equal(joined.ok, true);
      assert.equal(joined.mode, 'chaos');
      assert.equal(joined.maxPlayers, 4);
    }

    const startPromise = eventOnce(earth, 'start-level');
    earth.emit('ready', { ready: true });
    air.emit('ready', { ready: true });
    light.emit('ready', { ready: true });
    darkness.emit('ready', { ready: true });
    const start = await startPromise;
    assert.equal(start.mode, 'chaos');
    assert.equal(start.level, 1);

    const sharedTrapPromises = [air, light, darkness].map(socket => eventOnce(socket, 'trap-trigger'));
    const trapSnapshotPromise = eventWhere(air, 'room-state', room => Array.isArray(room?.trapStates) && room.trapStates.some(t => t.key === 'as4242'));
    earth.emit('trap-trigger', { level: 1, key: 'as4242' });
    const sharedTraps = await Promise.all(sharedTrapPromises);
    for (const sharedTrap of sharedTraps) {
      assert.equal(sharedTrap.level, 1);
      assert.equal(sharedTrap.key, 'as4242');
      assert.ok(Number.isFinite(sharedTrap.activatedAt));
    }
    const trapSnapshot = await trapSnapshotPromise;
    assert.ok(trapSnapshot.trapStates.some(t => t.key === 'as4242'), 'Room snapshot must persist revealed trap state');

    const unlockedPromise = eventOnce(earth, 'chaos-unlocked');
    for (const socket of [earth, air, light, darkness]) {
      socket.emit('chaos-seal-activate', { level: 1 });
    }
    const unlocked = await unlockedPromise;
    assert.equal(unlocked.level, 1);

    const completePromise = eventOnce(earth, 'level-complete');
    for (const socket of [earth, air, light, darkness]) {
      socket.emit('goal-state', { atGoal: true });
    }
    const completed = await completePromise;
    assert.equal(completed.mode, 'chaos');
    assert.equal(completed.completedLevel, 1);
    assert.equal(completed.level, 2);
    assert.equal(completed.finished, false);

    const resetPromises = [earth, air, light, darkness].map(socket => eventOnce(socket, 'reset-level'));
    const lightRewardPromise = eventOnce(light, 'death-reward');
    const noRewardPromises = [earth, air, darkness].map(socket => expectNoEvent(socket, 'death-reward'));
    light.emit('player-death');
    const [lightReward, resets] = await Promise.all([lightRewardPromise, Promise.all(resetPromises)]);
    assert.equal(lightReward.coins, 5);
    await Promise.all(noRewardPromises);
    for (const reset of resets) {
      assert.equal(reset.mode, 'chaos');
      assert.equal(reset.deaths, 1);
      assert.equal('rewardCoins' in reset, false);
      assert.equal('deathPlayerId' in reset, false);
    }

    const multiA = await connect(url); clients.push(multiA);
    const multiCreated = await emitAck(multiA, 'create-room', {
      name: 'Multi A',
      element: 'earth',
      mode: 'multiplayer'
    });
    assert.equal(multiCreated.ok, true);
    assert.equal(multiCreated.mode, 'multiplayer');
    assert.equal(multiCreated.maxPlayers, 2);

    const multiB = await connect(url); clients.push(multiB);
    const multiJoin = await emitAck(multiB, 'join-room', {
      code: multiCreated.code,
      name: 'Multi B',
      element: 'air',
      mode: 'multiplayer'
    });
    assert.equal(multiJoin.ok, true);

    const multiStartPromise = eventOnce(multiA, 'start-level');
    multiA.emit('ready', { ready: true });
    multiB.emit('ready', { ready: true });
    const multiStart = await multiStartPromise;
    assert.equal(multiStart.level, 1);

    const multiTrapPromise = eventOnce(multiB, 'trap-trigger');
    const multiSnapshotPromise = eventWhere(multiB, 'room-state', room => Array.isArray(room?.trapStates) && room.trapStates.some(t => t.key === 'sw777'));
    multiA.emit('trap-trigger', { level: 1, key: 'sw777' });
    const [multiTrap, multiSnapshot] = await Promise.all([multiTrapPromise, multiSnapshotPromise]);
    assert.equal(multiTrap.key, 'sw777');
    assert.ok(multiSnapshot.trapStates.some(t => t.key === 'sw777'), 'Two-player room snapshot must persist wall reveal');

    const multiResetA = eventOnce(multiA, 'reset-level');
    const multiResetB = eventOnce(multiB, 'reset-level');
    const multiAReward = eventOnce(multiA, 'death-reward');
    const multiBNoReward = expectNoEvent(multiB, 'death-reward');
    multiA.emit('player-death');
    const [multiReward, resetA, resetB] = await Promise.all([multiAReward, multiResetA, multiResetB]);
    assert.equal(multiReward.coins, 5);
    assert.equal(resetA.deaths, 1);
    assert.equal(resetB.deaths, 1);
    await multiBNoReward;

    console.log('Online integration: PASS — Chaos + 2P traps are room-wide and only the player who dies receives +5 coins.');
  } finally {
    for (const socket of clients) {
      try { socket.close(); } catch {}
    }
    if (server.listening) {
      await new Promise(resolve => server.close(resolve));
    }
  }
}

main().catch(error => {
  console.error('Chaos multiplayer integration: FAIL');
  console.error(error);
  process.exitCode = 1;
});
