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
const ANNUAL_INTEREST_RATE = 0.07;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const app = fastify({ logger: false });

// Simple in-memory sessions (non-persistent)
const sessions = new Map();

function createPlayer(id) {
  return {
    id,
    cash: 3000,
    debt: 0,
    dripEnabled: false,
    holdings: {}, // companyId -> units
    ventureHoldings: {}, // ventureId -> equity percent
    ventureCommitments: {}, // ventureId -> committed cash
    ventureCashInvested: {}, // ventureId -> total invested cash
    lastInterestTs: null,
    lastCommandTs: Date.now()
  };
}

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
  sim._ventureSim = ventureSim;
  return {
    seed,
    sim,
    ventureSim,
    rngFn,
    clients: new Set(),
    clientPlayers: new Map(),
    players: new Map(),
    tickHandle: null,
    tickSeq: 0,
    tickBuffer: [],
    maxTicksCached: 50,
    lastSnapshot: null
  };
}

function startTickLoop(session) {
  if (session.tickHandle) return;
  session.tickHandle = setInterval(() => {
    const current = session.sim.lastTick || new Date('1990-01-01T00:00:00Z');
    const next = new Date(current.getTime() + session.sim.dtDays * MS_PER_DAY);
    const dtDays = Math.max(0, (next.getTime() - current.getTime()) / MS_PER_DAY);
    session.sim.tick(next);
    const events = session.ventureSim ? session.ventureSim.tick(next) : [];
    const ventureEvents = sanitizeVentureEvents(events);
    accrueInterest(session, dtDays);
    const dividendEvents = distributeDividends(session);
    const payload = {
      type: 'tick',
      lastTick: session.sim.lastTick ? session.sim.lastTick.toISOString() : null,
      companies: session.sim.companies.map(c => ({ id: c.id, name: c.name, marketCap: c.marketCap })),
      ventureEvents,
      dividendEvents,
      players: Array.from(session.players.values()).map(p => serializePlayer(p, session.sim))
    };
    cacheAndBroadcast(session, payload);
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

function cacheAndBroadcast(session, tick) {
  session.tickSeq += 1;
  const enriched = { ...tick, seq: session.tickSeq };
  session.tickBuffer.push(enriched);
  if (session.tickBuffer.length > session.maxTicksCached) {
    session.tickBuffer.shift();
  }
  broadcast(session, enriched);
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

function serializePlayer(player, sim) {
  const holdings = player.holdings || {};
  const equity = computeEquity(sim, holdings);
  const netWorth = player.cash + equity - player.debt;
  const bankrupt = netWorth < 0 && player.debt > 0;
  player.bankrupt = bankrupt;
  return {
    id: player.id,
    cash: player.cash,
    debt: player.debt,
    equity,
    netWorth,
    holdings,
    dripEnabled: !!player.dripEnabled,
    bankrupt,
    ventureHoldings: player.ventureHoldings || {},
    ventureCommitments: player.ventureCommitments || {},
    ventureCashInvested: player.ventureCashInvested || {}
  };
}

function computeEquity(sim, holdings) {
  let equity = 0;
  sim.companies.forEach(c => {
    const units = holdings[c.id] || 0;
    equity += units * (c.marketCap || 0);
  });
  return equity;
}

function computeVentureEquity(ventureSim, ventureHoldings) {
  let value = 0;
  if (!ventureSim || !ventureSim.companies) return value;
  ventureSim.companies.forEach(vc => {
    const pct = ventureHoldings[vc.id] || 0;
    if (pct > 0 && vc.currentValuation) {
      value += pct * vc.currentValuation;
    }
  });
  return value;
}

function maxBorrowable(sim, player) {
  const equity = computeEquity(sim, player.holdings || {});
  const ventureValue = computeVentureEquity(sim._ventureSim, player.ventureHoldings || {});
  const netWorth = player.cash + equity + ventureValue - player.debt;
  const cap = Math.max(0, netWorth) * 5;
  return Math.max(0, cap - player.debt);
}

function accrueInterest(session, dtDays) {
  if (!Number.isFinite(dtDays) || dtDays <= 0) return;
  session.players.forEach(player => {
    if (!player || player.debt <= 0) return;
    const interest = player.debt * ANNUAL_INTEREST_RATE * (dtDays / 365);
    if (interest <= 0) return;
    player.debt += interest;
    player.cash -= interest;
    player.lastInterestTs = session.sim.lastTick ? session.sim.lastTick.toISOString() : new Date().toISOString();
  });
}

function distributeDividends(session) {
  const events = [];
  const dividendMap = new Map();
  session.sim.companies.forEach(company => {
    if (!company || typeof company.drainDividendEvents !== 'function') return;
    const divs = company.drainDividendEvents();
    if (divs && divs.length) {
      dividendMap.set(company.id, { company, divs });
    }
  });
  if (dividendMap.size === 0) return events;
  session.players.forEach(player => {
    Object.entries(player.holdings || {}).forEach(([companyId, units]) => {
      const entry = dividendMap.get(companyId);
      if (!entry || !units || units <= 0) return;
      entry.divs.forEach(div => {
        const payout = units * div.amount;
        if (!Number.isFinite(payout) || payout <= 0) return;
        if (player.dripEnabled) {
          const marketCap = entry.company.marketCap || 0;
          if (marketCap > 0) {
            const extraUnits = payout / marketCap;
            player.holdings[companyId] = (player.holdings[companyId] || 0) + extraUnits;
            events.push({ playerId: player.id, companyId, payout, reinvested: true });
          }
        } else {
          player.cash += payout;
          events.push({ playerId: player.id, companyId, payout, reinvested: false });
        }
      });
    });
  });
  return events;
}

function sanitizeVentureEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.map(evt => {
    if (!evt || typeof evt !== 'object') return null;
    const {
      type,
      companyId,
      name,
      valuation,
      revenue,
      profit,
      refund,
      playerEquity,
      stageLabel
    } = evt;
    return {
      type,
      companyId,
      name,
      valuation,
      revenue,
      profit,
      refund,
      playerEquity,
      stageLabel
    };
  }).filter(Boolean);
}

function buildSnapshot(session) {
  return {
    seed: session.seed,
    lastTick: session.sim.lastTick ? session.sim.lastTick.toISOString() : null,
    sim: session.sim.exportState({ detail: false }),
    venture: session.ventureSim ? session.ventureSim.exportState({ detail: false }) : null,
    players: Array.from(session.players.values()).map(p => serializePlayer(p, session.sim))
  };
}

function handleCommand(session, player, msg) {
  if (player.bankrupt) {
    return { ok: false, error: 'bankrupt' };
  }
  if (!msg || typeof msg !== 'object') {
    return { ok: false, error: 'bad_payload' };
  }
  const type = msg.type;
  if (type === 'resync') {
    return {
      ok: true,
      type: 'resync',
      snapshot: buildSnapshot(session),
      player: serializePlayer(player, session.sim),
      ticks: session.tickBuffer.slice()
    };
  }
  if (type === 'buy') {
    const { companyId, amount } = msg;
    if (!companyId || !Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: 'bad_amount' };
    }
    const company = session.sim.companies.find(c => c.id === companyId);
    if (!company || company.marketCap <= 0) {
      return { ok: false, error: 'unknown_company' };
    }
    if (player.cash < amount) {
      return { ok: false, error: 'insufficient_cash' };
    }
    const units = amount / company.marketCap;
    player.cash -= amount;
    player.holdings[companyId] = (player.holdings[companyId] || 0) + units;
    return { ok: true, type: 'buy', companyId, amount, units };
  }
  if (type === 'sell') {
    const { companyId, amount } = msg;
    if (!companyId || !Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: 'bad_amount' };
    }
    const company = session.sim.companies.find(c => c.id === companyId);
    if (!company || company.marketCap <= 0) {
      return { ok: false, error: 'unknown_company' };
    }
    const unitsOwned = player.holdings[companyId] || 0;
    const currentValue = unitsOwned * company.marketCap;
    if (unitHostedInvalid(unitsOwned) || currentValue <= 0) {
      return { ok: false, error: 'no_position' };
    }
    if (amount > currentValue) {
      return { ok: false, error: 'amount_exceeds_position' };
    }
    const unitsToSell = amount / company.marketCap;
    player.holdings[companyId] = Math.max(0, unitsOwned - unitsToSell);
    if (player.holdings[companyId] < 1e-9) delete player.holdings[companyId];
    player.cash += amount;
    return { ok: true, type: 'sell', companyId, amount, units: unitsToSell };
  }
  if (type === 'borrow') {
    const amount = msg.amount;
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: 'bad_amount' };
    }
    const cap = maxBorrowable(session.sim, player);
    if (amount > cap) {
      return { ok: false, error: 'above_limit', cap };
    }
    player.cash += amount;
    player.debt += amount;
    return { ok: true, type: 'borrow', amount, capRemaining: maxBorrowable(session.sim, player) };
  }
  if (type === 'repay') {
    const amount = msg.amount;
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: 'bad_amount' };
    }
    const repayable = Math.min(amount, player.cash, player.debt);
    if (repayable <= 0) {
      return { ok: false, error: 'nothing_to_repay' };
    }
    player.cash -= repayable;
    player.debt -= repayable;
    return { ok: true, type: 'repay', amount: repayable, capRemaining: maxBorrowable(session.sim, player) };
  }
  if (type === 'set_drip') {
    const enabled = !!msg.enabled;
    player.dripEnabled = enabled;
    return { ok: true, type: 'set_drip', enabled };
  }
  if (type === 'ping') {
    return { ok: true, type: 'pong', ts: Date.now() };
  }
  return { ok: false, error: 'unknown_command' };
}

function unitHostedInvalid(units) {
  return !Number.isFinite(units) || units <= 0;
}

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
  const requestedPlayerId = url.searchParams.get('player') || null;
  let session = sessions.get(sessionId);
  if (!session) {
    session = await buildMatch();
    sessions.set(sessionId, session);
  }
  session.clients.add(ws);
  const playerId = requestedPlayerId || `p_${Math.floor(Math.random() * 1e9).toString(36)}`;
  let player = session.players.get(playerId);
  if (!player) {
    player = createPlayer(playerId);
    session.players.set(playerId, player);
  }
  session.clientPlayers.set(ws, playerId);

  // Send initial snapshot
  ws.send(JSON.stringify({
    type: 'snapshot',
    ...buildSnapshot(session),
    player: serializePlayer(player, session.sim),
    ticks: session.tickBuffer.slice()
  }));

  startTickLoop(session);

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', error: 'bad_json' }));
      return;
    }
    const pid = session.clientPlayers.get(ws);
    if (!pid) {
      ws.send(JSON.stringify({ type: 'error', error: 'no_player' }));
      return;
    }
    const p = session.players.get(pid);
    if (!p) {
      ws.send(JSON.stringify({ type: 'error', error: 'no_player' }));
      return;
    }
    const result = handleCommand(session, p, msg);
    ws.send(JSON.stringify({
      type: 'command_result',
      ok: result.ok,
      data: result.ok ? result : undefined,
      error: result.ok ? undefined : result.error,
      player: serializePlayer(p, session.sim)
    }));
  });

  ws.on('close', () => {
    session.clients.delete(ws);
    session.clientPlayers.delete(ws);
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
