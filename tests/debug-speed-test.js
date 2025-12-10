/**
 * Debug-speed smoke test.
 *
 * Starts the server on a random port, creates a single multiplayer session
 * with one host client, measures tick intervals at default speed and after
 * issuing a debug_set_speed command, and logs the observed timings.
 *
 * This is not a strict unit test; it is a diagnostic tool to confirm that
 * debug_set_speed is accepted by the server and that the tick interval
 * actually changes.
 */
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
let WebSocket;
try {
  WebSocket = require('ws');
} catch (err) {
  WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));
}

const SERVER_READY_TIMEOUT_MS = 8000;
const DEFAULT_SAMPLE_TICKS = 6;
const FAST_SAMPLE_TICKS = 20;

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

function connectHost(wsBase, sessionId, playerId, tickTimes, firstPhaseCount) {
  return new Promise((resolve, reject) => {
    const url = `${wsBase}/ws?session=${encodeURIComponent(sessionId)}&player=${encodeURIComponent(playerId)}&role=host`;
    const ws = new WebSocket(url);
    let resolved = false;
    let snapshotSeen = false;
    let phase = 'default';

    const fail = (err) => {
      if (resolved) return;
      resolved = true;
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const timeout = setTimeout(() => fail(new Error('WebSocket connect timeout')), 5000);

    ws.on('open', () => {
      // Wait for snapshot before resolving
    });

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
        const now = Date.now();
        tickTimes.push({ phase, ts: now });
        return;
      }
      if (msg.type === 'snapshot' && !snapshotSeen) {
        snapshotSeen = true;
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          resolve(ws);
        }
        return;
      }
      if (msg.type === 'command_result' && msg.data && msg.data.type === 'debug_set_speed') {
        phase = 'fast';
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

async function runDebugSpeedCheck(baseHttp, baseWs) {
  const sessionId = `dbg_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  // Create session via HTTP
  const sessionResp = await fetch(`${baseHttp}/session/${sessionId}`);
  if (!sessionResp.ok) {
    throw new Error(`Failed to create session ${sessionId}: HTTP ${sessionResp.status}`);
  }

  const tickTimes = [];
  const hostWs = await connectHost(baseWs, sessionId, 'HostDebug', tickTimes, DEFAULT_SAMPLE_TICKS);

  try {
    // Start the game
    hostWs.send(JSON.stringify({ type: 'start_game' }));

    // Collect a handful of ticks at default speed
    await waitForCondition(
      () => tickTimes.filter(t => t.phase === 'default').length >= DEFAULT_SAMPLE_TICKS,
      8000,
      50,
      'default-speed ticks'
    );

    // Request a faster speed (e.g., 8x)
    hostWs.send(JSON.stringify({ type: 'debug_set_speed', speed: 8 }));

    // Collect a larger batch of ticks in the fast phase
    await waitForCondition(
      () => tickTimes.filter(t => t.phase === 'fast').length >= FAST_SAMPLE_TICKS,
      8000,
      20,
      'fast-speed ticks'
    );

    const defaults = tickTimes.filter(t => t.phase === 'default').map(t => t.ts);
    const fasts = tickTimes.filter(t => t.phase === 'fast').map(t => t.ts);

    const deltas = (arr) => {
      const out = [];
      for (let i = 1; i < arr.length; i += 1) {
        out.push(arr[i] - arr[i - 1]);
      }
      return out;
    };

    const avg = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

    const defaultDeltas = deltas(defaults);
    const fastDeltas = deltas(fasts);
    const defaultAvg = avg(defaultDeltas);
    const fastAvg = avg(fastDeltas);

    console.log(JSON.stringify({
      sessionId,
      defaultTickCount: defaults.length,
      fastTickCount: fasts.length,
      defaultAvgMs: defaultAvg,
      fastAvgMs: fastAvg
    }, null, 2));
  } finally {
    try { hostWs.close(); } catch (_) { /* ignore */ }
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
    await runDebugSpeedCheck(baseHttp, baseWs);
  } catch (err) {
    console.error('debug-speed-test failed:', err);
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
  console.error('debug-speed-test crashed:', err);
  process.exit(1);
});

