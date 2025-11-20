const fastify = require('fastify');
const WebSocket = require('ws');
const path = require('path');

// Load sim modules (side-effect globals)
require('../src/sim/simShared.js');
require('../src/sim/ventureStrategies.js');
require('../src/sim/publicCompanies.js');
require('../src/sim/macroEvents.js');
require('../src/sim/ventureEngineCore.js');
require('../src/sim/simEngine.js');
require('../src/presets/presets.js');

const { SeededRandom } = global.SimShared || {};
const { Simulation } = global;
const { VentureSimulation } = global.VentureEngineModule || {};
const Presets = global.PresetGenerators || {};

const PORT = process.env.PORT || 4000;

const app = fastify({ logger: false });

// Simple in-memory sessions (non-persistent)
const sessions = new Map();

async function buildMatch(seed = Date.now()) {
  const rng = new SeededRandom(seed);
  const rngFn = () => rng.random();
  const presetOpts = { rng: rngFn, baseDir: path.join(__dirname, '..') };
  const pubs = [];
  pubs.push(...await Presets.generateHardTechPresetCompanies(1, presetOpts));
  pubs.push(...await Presets.generateSteadyMegacorpCompanies(1, presetOpts));
  pubs.push(...await Presets.generateProductRotatorCompanies(1, presetOpts));
  const ventures = [
    ...(await Presets.generateHypergrowthPresetCompanies(presetOpts)),
    ...Presets.generateBinaryHardTechCompanies(1, presetOpts)
  ];
  const sim = new Simulation(pubs, { seed, rng: rngFn, macroEvents: [] });
  const ventureSim = new VentureSimulation(ventures, sim.lastTick, { seed, rng: rngFn });
  return { seed, sim, ventureSim, rngFn, clients: new Set(), tickHandle: null };
}

function startTickLoop(session) {
  if (session.tickHandle) return;
  session.tickHandle = setInterval(() => {
    const current = session.sim.lastTick || new Date('1990-01-01T00:00:00Z');
    const next = new Date(current.getTime() + session.sim.dtDays * 24 * 60 * 60 * 1000);
    session.sim.tick(next);
    const events = session.ventureSim ? session.ventureSim.tick(next) : [];
    const payload = {
      type: 'tick',
      lastTick: session.sim.lastTick ? session.sim.lastTick.toISOString() : null,
      companies: session.sim.companies.map(c => ({ id: c.id, name: c.name, marketCap: c.marketCap })),
      ventureEvents: events || []
    };
    broadcast(session, payload);
  }, 500);
}

function stopTickLoop(session) {
  if (session.tickHandle) {
    clearInterval(session.tickHandle);
    session.tickHandle = null;
  }
}

function broadcast(session, message) {
  const payload = JSON.stringify(message);
  session.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

app.get('/health', async () => ({ ok: true }));

app.get('/session/:id', async (req, res) => {
  const { id } = req.params;
  let session = sessions.get(id);
  if (!session) {
    session = await buildMatch();
    sessions.set(id, session);
  }
  return { id, seed: session.seed, lastTick: session.sim.lastTick };
});

const server = app.server;
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, url);
  });
});

wss.on('connection', async (ws, req, url) => {
  const sessionId = url.searchParams.get('session') || 'default';
  let session = sessions.get(sessionId);
  if (!session) {
    session = await buildMatch();
    sessions.set(sessionId, session);
  }
  session.clients.add(ws);

  // Send initial snapshot
  ws.send(JSON.stringify({
    type: 'snapshot',
    seed: session.seed,
    sim: session.sim.exportState({ detail: false }),
    venture: session.ventureSim ? session.ventureSim.exportState({ detail: false }) : null
  }));

  startTickLoop(session);

  ws.on('message', (data) => {
    // Placeholder for command routing (buy/sell/etc.)
    console.log('Received command', data.toString());
  });

  ws.on('close', () => {
    session.clients.delete(ws);
    if (session.clients.size === 0) {
      stopTickLoop(session);
    }
  });
});

app.listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log(`Server running on ${PORT}`))
  .catch(err => {
    console.error('Failed to start server', err);
    process.exit(1);
  });
