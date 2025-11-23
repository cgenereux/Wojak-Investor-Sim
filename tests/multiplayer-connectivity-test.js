/**
 * start the server on a random port, create a few sessions,
 * attach multiple players over WebSocket, start games, and confirm ticks arrive.
 * this is a lightweight liveness check (not a load test).
 */
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
let WebSocket;
try {
  WebSocket = require('ws');
} catch (err) {
  // Fallback to server-local dependency if root node_modules lacks ws.
  WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));
}

const SESSION_COUNT = Number(process.env.MP_SESSIONS || 2);
const PLAYERS_PER_SESSION = Number(process.env.MP_PLAYERS || 4);
const MIN_TICKS = Number(process.env.MP_MIN_TICKS || 3);
const TICK_TIMEOUT_MS = Number(process.env.MP_TICK_TIMEOUT_MS || 7000);
const SERVER_READY_TIMEOUT_MS = Number(process.env.MP_SERVER_TIMEOUT_MS || 8000);
const SESSION_RUNTIME_MS = Number(process.env.MP_SESSION_RUNTIME_MS || 6000);

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const address = srv.address();
      const port = address && address.port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function waitForHealth(baseUrl, timeoutMs) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return true;
      lastErr = new Error(`Health check HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await wait(200);
  }
  throw lastErr || new Error('Health check timed out');
}

function waitForCondition(fn, timeoutMs, intervalMs = 50, label = 'condition') {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (fn()) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for ${label}`));
      }
    }, intervalMs);
  });
}

function connectClient({ wsUrl, sessionId, playerId, role, tickCounter }) {
  return new Promise((resolve, reject) => {
    const url = `${wsUrl}/ws?session=${encodeURIComponent(sessionId)}&player=${encodeURIComponent(playerId)}&role=${role}`;
    const ws = new WebSocket(url);
    let resolved = false;
    const fail = (err) => {
      if (resolved) return;
      resolved = true;
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const timeout = setTimeout(() => fail(new Error('WebSocket connect timeout')), 5000);
    ws.on('open', () => { /* wait for snapshot before resolving */ });
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (err) {
        fail(new Error('bad_json'));
        ws.close();
        return;
      }
      if (msg.type === 'error') {
        fail(new Error(msg.error || 'ws_error'));
        ws.close();
        return;
      }
      if (msg.type === 'tick') {
        tickCounter.count += 1;
        return;
      }
      if (msg.type === 'snapshot' && !resolved) {
        clearTimeout(timeout);
        resolved = true;
        resolve(ws);
      }
    });
    ws.on('close', (code, reason) => {
      if (!resolved) {
        fail(new Error(`ws closed early (${code}): ${reason || ''}`));
      }
    });
    ws.on('error', (err) => fail(err));
  });
}

async function runSession({ baseHttp, baseWs, sessionId, playersPerSession, minTicks }) {
  const tickCounter = { count: 0 };
  // Create session via HTTP so guests can join.
  const sessionResp = await fetch(`${baseHttp}/session/${sessionId}`);
  if (!sessionResp.ok) {
    throw new Error(`Failed to create session ${sessionId}: HTTP ${sessionResp.status}`);
  }

  const sockets = [];
  try {
    for (let i = 0; i < playersPerSession; i++) {
      const role = i === 0 ? 'host' : 'guest';
      const playerId = `p${sessionId}_${i}`;
      const ws = await connectClient({
        wsUrl: baseWs,
        sessionId,
        playerId,
        role,
        tickCounter
      });
      sockets.push(ws);
    }

    // Start the game from the host.
    const host = sockets[0];
    host.send(JSON.stringify({ type: 'start_game' }));

    // Wait for ticks to arrive.
    await waitForCondition(() => tickCounter.count >= minTicks, TICK_TIMEOUT_MS, 50, `ticks for ${sessionId}`);

    // Keep the session alive briefly to catch disconnects.
    await wait(SESSION_RUNTIME_MS);

    return { sessionId, tickCount: tickCounter.count };
  } finally {
    sockets.forEach(ws => {
      try { ws.close(); } catch (_) { /* ignore */ }
    });
  }
}

async function main() {
  const port = await getFreePort();
  const baseHttp = `http://127.0.0.1:${port}`;
  const baseWs = `ws://127.0.0.1:${port}`;
  const serverProc = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js')], {
    env: { ...process.env, PORT: port },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverReady = false;
  try {
    await waitForHealth(baseHttp, SERVER_READY_TIMEOUT_MS);
    serverReady = true;
    const sessionIds = Array.from({ length: SESSION_COUNT }, (_, s) => `mp_${Date.now()}_${s}_${Math.floor(Math.random() * 1e6)}`);
    const runs = sessionIds.map(sessionId => runSession({
      baseHttp,
      baseWs,
      sessionId,
      playersPerSession: PLAYERS_PER_SESSION,
      minTicks: MIN_TICKS
    }));
    const results = await Promise.all(runs);
    console.log(JSON.stringify({
      port,
      sessions: SESSION_COUNT,
      playersPerSession: PLAYERS_PER_SESSION,
      minTicks: MIN_TICKS,
      results
    }, null, 2));
  } catch (err) {
    console.error('Multiplayer smoke failed:', err);
    process.exitCode = 1;
  } finally {
    if (serverProc && !serverProc.killed) {
      serverProc.kill();
    }
    if (!serverReady) {
      await wait(500);
    }
  }
}

main().catch(err => {
  console.error('Multiplayer smoke crashed:', err);
  process.exit(1);
});
