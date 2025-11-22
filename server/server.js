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

const macroEvents = require('../data/macroEvents.json');

const PORT = process.env.PORT || 4000;
const ANNUAL_INTEREST_RATE = 0.07;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const GAME_END_YEAR = 2050;

const app = fastify({ logger: false });

// Simple in-memory sessions (non-persistent)
const sessions = new Map();
const SESSION_CLEANUP_DELAY_MS = 60_000;
const SESSION_IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes without player commands
const SESSION_CLIENT_IDLE_MS = 2 * 60 * 1000; // Kill if no clients for this long
const SESSION_IDLE_CHECK_MS = 1000; // how often to check client idleness

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
  pubs.push(...await Presets.generateHardTechPresetCompanies(3, presetOpts));
  pubs.push(...await Presets.generateSteadyMegacorpCompanies(2, presetOpts));
  pubs.push(...await Presets.generateProductRotatorCompanies(2, presetOpts));
  const ventures = [
    ...(await Presets.generateHypergrowthPresetCompanies(presetOpts)),
    ...Presets.generateBinaryHardTechCompanies(1, presetOpts)
  ];
  const sim = new Simulation(pubs, { seed, rng: rngFn, macroEvents: macroEvents || [] });
  const ventureSim = new VentureSimulation(ventures, sim.lastTick, { seed, rng: rngFn });
  sim._ventureSim = ventureSim;
  return {
    seed,
    sim,
    ventureSim,
    rngFn,
    started: false,
    hostId: null,
    playerRoles: new Map(),
    clients: new Set(),
    clientPlayers: new Map(),
    players: new Map(),
    ended: false,
    tickHandle: null,
    tickSeq: 0,
    tickBuffer: [],
    maxTicksCached: 50,
    lastSnapshot: null,
    idleTimer: null,
    idleWarned: false,
    lastActivity: Date.now(),
    idleGuardTimer: null,
    clientActivity: new Map(),
    idleCheckHandle: null
  };
}

function startTickLoop(session) {
  if (session.tickHandle || session.ended || !session.started) return;
  session.tickHandle = setInterval(() => {
    if (session.ended) {
      stopTickLoop(session);
      return;
    }
    // Client-idle check handled by separate timer; this remains the tick driver.
    const currentYear = session.sim.lastTick ? session.sim.lastTick.getUTCFullYear() : 1990;
    if (currentYear >= GAME_END_YEAR) {
      endSession(session);
      return;
    }
    const current = session.sim.lastTick || new Date('1990-01-01T00:00:00Z');
    const next = new Date(current.getTime() + session.sim.dtDays * MS_PER_DAY);
    if (next.getUTCFullYear() > GAME_END_YEAR) {
      next.setUTCFullYear(GAME_END_YEAR, 0, 1);
    }
    const dtDays = Math.max(0, (next.getTime() - current.getTime()) / MS_PER_DAY);
    // console.log(`[Server Debug] Tick: dtDays=${dtDays}, current=${current.toISOString()}, next=${next.toISOString()}`);
    session.sim.tick(next);
    const ventureEventsRaw = session.ventureSim ? session.ventureSim.tick(next) : [];
    handleVentureEventsSession(session, ventureEventsRaw);
    // if (session.ventureSim && session.ventureSim.companies.length > 0) {
    //    console.log(`[Server Debug] VC[0] Val: ${session.ventureSim.companies[0].currentValuation}, Rev: ${session.ventureSim.companies[0].revenue}`);
    // }
    const ventureEvents = sanitizeVentureEvents(ventureEventsRaw);
    accrueInterest(session, dtDays);
    const dividendEvents = distributeDividends(session);
    const payload = {
      type: 'tick',
      lastTick: session.sim.lastTick ? session.sim.lastTick.toISOString() : null,
      companies: session.sim.companies.map(c => {
        if (typeof c.toSnapshot === 'function') {
          // Send minimal history in ticks to save bandwidth, but enough for live updates
          return c.toSnapshot({ historyLimit: 1, quarterLimit: 2 });
        }
        return {
          id: c.id,
          marketCap: c.marketCap,
          history: c.history ? c.history.slice(-1) : []
        };
      }),
      ventureEvents,
      venture: session.ventureSim ? session.ventureSim.getTickSnapshot() : null,
      dividendEvents,
      players: Array.from(session.players.values()).map(p => serializePlayer(p, session.sim))
    };
    cacheAndBroadcast(session, payload);
    const newYear = session.sim.lastTick ? session.sim.lastTick.getUTCFullYear() : currentYear;
    if (newYear >= GAME_END_YEAR) {
      endSession(session);
    }
  }, 500);
}

function stopTickLoop(session) {
  if (session.tickHandle) {
    clearInterval(session.tickHandle);
    session.tickHandle = null;
  }
  if (session.idleCheckHandle) {
    clearInterval(session.idleCheckHandle);
    session.idleCheckHandle = null;
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

function endSession(session, reason = 'timeline_end') {
  if (session.ended) return;
  session.ended = true;
  stopTickLoop(session);
  broadcast(session, {
    type: 'end',
    reason,
    year: GAME_END_YEAR,
    lastTick: session.sim.lastTick ? session.sim.lastTick.toISOString() : null
  });
  scheduleSessionCleanup(session);
}

function scheduleSessionCleanup(session) {
  if (session.cleanupTimer) return;
  session.cleanupTimer = setTimeout(() => {
    for (const [key, value] of sessions.entries()) {
      if (value === session) {
        sessions.delete(key);
        break;
      }
    }
  }, SESSION_CLEANUP_DELAY_MS);
}

function resetIdleTimer(session) {
  if (session.idleTimer) clearTimeout(session.idleTimer);
  session.idleWarned = false;
  session.idleTimer = setTimeout(() => {
    broadcast(session, {
      type: 'idle_warning',
      message: `No player actions for ${SESSION_IDLE_TIMEOUT_MS / 1000}s — closing server.`,
      idleSeconds: SESSION_IDLE_TIMEOUT_MS / 1000
    });
    endSession(session, 'idle_timeout');
  }, SESSION_IDLE_TIMEOUT_MS);
}

// Extra guard: end session if the idle timeout elapses without a real command (excluding pings).
function armIdleGuard(session) {
  if (session.idleGuardTimer) clearTimeout(session.idleGuardTimer);
  session.idleGuardTimer = setTimeout(() => {
    broadcast(session, {
      type: 'idle_warning',
      message: `No player actions for ${SESSION_IDLE_TIMEOUT_MS / 1000}s — closing server.`,
      idleSeconds: SESSION_IDLE_TIMEOUT_MS / 1000
    });
    endSession(session, 'idle_timeout');
  }, SESSION_IDLE_TIMEOUT_MS);
}

app.get('/health', async () => ({ ok: true }));

app.get('/session/:id', async (req, res) => {
  const { id } = req.params;
  let session = sessions.get(id);
  if (!session) {
    session = await buildMatch();
    sessions.set(id, session);
  }
  // Track last activity
  session.lastActivity = Date.now();
  resetIdleTimer(session);
  return { id, seed: session.seed, lastTick: session.sim.lastTick };
});

function serializePlayer(player, sim) {
  const holdings = player.holdings || {};
  const equity = computeEquity(sim, holdings);
  const ventureValue = computeVentureEquity(sim._ventureSim, player.ventureHoldings || {});
  const commitments = computeVentureCommitments(player.ventureCommitments || {});
  const netWorth = player.cash + equity + ventureValue + commitments - player.debt;
  const bankrupt = netWorth < 0 && player.debt > 0;
  player.bankrupt = bankrupt;
  return {
    id: player.id,
    cash: player.cash,
    debt: player.debt,
    equity,
    ventureEquity: ventureValue,
    ventureCommitmentsValue: commitments,
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

function computeVentureCommitments(commitments) {
  let total = 0;
  Object.values(commitments || {}).forEach(v => {
    if (Number.isFinite(v)) total += v;
  });
  return total;
}

function maxBorrowable(sim, player) {
  const equity = computeEquity(sim, player.holdings || {});
  const ventureValue = computeVentureEquity(sim._ventureSim, player.ventureHoldings || {});
  const commitments = computeVentureCommitments(player.ventureCommitments || {});
  const netWorth = player.cash + equity + ventureValue + commitments - player.debt;
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
      stageLabel,
      playerId: evt.playerId || evt.commitPlayerId || evt.leadPlayerId || null,
      equityOffered: evt.equityOffered || evt.equityGranted || null,
      invested: evt.invested || evt.playerCommitAmount || null
    };
  }).filter(Boolean);
}

function handleVentureEventsSession(session, events) {
  if (!Array.isArray(events) || events.length === 0) return;
  events.forEach(evt => {
    if (!evt || typeof evt !== 'object') return;
    const playerId = evt.playerId || evt.commitPlayerId || evt.leadPlayerId || null;
    const company = session.ventureSim ? session.ventureSim.getCompanyById(evt.companyId) : null;
    if (company && company.playerEquityMap) {
      session.players.forEach(p => {
        const pct = company.playerEquityMap[p.id] || 0;
        if (pct > 0) {
          p.ventureHoldings[evt.companyId] = pct;
        } else if (p.ventureHoldings && p.ventureHoldings[evt.companyId]) {
          delete p.ventureHoldings[evt.companyId];
        }
      });
    }
    if (evt.type === 'venture_round_closed') {
      const player = playerId ? session.players.get(playerId) : null;
      if (player && evt.companyId) {
        const invested = Number(evt.invested) || 0;
        if (invested > 0) {
          player.ventureCashInvested[evt.companyId] = (player.ventureCashInvested[evt.companyId] || 0) + invested;
          player.ventureCommitments[evt.companyId] = Math.max(0, (player.ventureCommitments[evt.companyId] || 0) - invested);
          if (player.ventureCommitments[evt.companyId] < 1e-9) delete player.ventureCommitments[evt.companyId];
        }
      }
      return;
    }
    if (evt.type === 'venture_round_failed') {
      const player = playerId ? session.players.get(playerId) : null;
      if (player && evt.companyId) {
        const refund = Number(evt.refund) || 0;
        if (refund > 0) player.cash += refund;
        delete player.ventureCommitments[evt.companyId];
      }
      return;
    }
    if (evt.type === 'venture_failed') {
      session.players.forEach(p => {
        if (p.ventureHoldings && p.ventureHoldings[evt.companyId]) delete p.ventureHoldings[evt.companyId];
        if (p.ventureCommitments && p.ventureCommitments[evt.companyId]) delete p.ventureCommitments[evt.companyId];
      });
      return;
    }
    if (evt.type === 'venture_ipo') {
      let ventureCompany = evt.companyRef || null;
      if (!ventureCompany && session.ventureSim) {
        ventureCompany = session.ventureSim.extractCompany(evt.companyId) || session.ventureSim.getCompanyById(evt.companyId);
      }
      if (ventureCompany && typeof session.sim.adoptVentureCompany === 'function') {
        session.sim.adoptVentureCompany(ventureCompany, session.sim.lastTick);
        // Transfer ownership to public holdings
        session.players.forEach(p => {
          const pct = p.ventureHoldings ? (p.ventureHoldings[evt.companyId] || 0) : 0;
          if (pct > 0) {
            p.holdings[ventureCompany.id] = (p.holdings[ventureCompany.id] || 0) + pct;
            delete p.ventureHoldings[evt.companyId];
            delete p.ventureCommitments[evt.companyId];
          }
        });
      }
      return;
    }
  });
}

function buildSnapshot(session) {
  const simState = session.sim.exportState({ detail: false, historyLimit: 1000, quarterLimit: 100 });
  // simState.companies is already formatted by exportState -> toSnapshot
  return {
    type: 'snapshot',
    seed: session.seed,
    started: session.started,
    hostId: session.hostId,
    lastTick: session.sim.lastTick ? session.sim.lastTick.toISOString() : null,
    sim: simState,
    venture: session.ventureSim ? session.ventureSim.exportState({ detail: true }) : null,
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
  if (type !== 'ping') {
    session.lastActivity = Date.now();
    resetIdleTimer(session);
    armIdleGuard(session);
    // Track per-player activity for idle detection
    if (player && player.id) {
      session.clientActivity.set(player.id, session.lastActivity);
    }
  }
  if (type === 'resync') {
    return {
      ok: true,
      type: 'resync',
      snapshot: buildSnapshot(session),
      player: serializePlayer(player, session.sim),
      ticks: session.tickBuffer.slice()
    };
  }
  if (type === 'start_game') {
    if (!session.hostId) {
      session.hostId = player.id;
    } else if (session.hostId !== player.id) {
      return { ok: false, error: 'not_host' };
    }
    if (session.started) {
      return { ok: true, type: 'start_game', alreadyStarted: true };
    }
    session.started = true;
    startTickLoop(session);
    broadcast(session, { type: 'match_started', hostId: session.hostId || player.id });
    return { ok: true, type: 'start_game' };
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
  if (type === 'vc_lead') {
    const companyId = msg.companyId;
    if (!companyId || !session.ventureSim) {
      return { ok: false, error: 'unknown_company' };
    }
    const company = session.ventureSim.getCompanyById(companyId);
    if (!company) {
      return { ok: false, error: 'unknown_company' };
    }
    if (!company.currentRound && typeof company.generateRound === 'function') {
      company.generateRound(session.sim.lastTick || new Date());
    }
    const currentRound = company.currentRound;
    const raiseAmount = currentRound ? currentRound.raiseAmount : null;
    if (!currentRound || company.status !== 'raising') {
      return { ok: false, error: 'not_raising' };
    }
    if (!Number.isFinite(raiseAmount) || raiseAmount <= 0) {
      return { ok: false, error: 'bad_round' };
    }
    if (player.cash < raiseAmount) {
      return { ok: false, error: 'insufficient_cash' };
    }
    const leadResult = session.ventureSim.leadRound(companyId, player.id);
    if (!leadResult?.success) {
      return { ok: false, error: leadResult?.reason || 'lead_failed' };
    }
    player.cash -= raiseAmount;
    player.ventureCommitments[companyId] = (player.ventureCommitments[companyId] || 0) + raiseAmount;
    player.lastCommandTs = Date.now();
    return {
      ok: true,
      type: 'vc_lead',
      companyId,
      invested: raiseAmount,
      equityOffered: leadResult.equityOffered,
      stageLabel: leadResult.stageLabel
    };
  }
  if (type === 'debug_set_cash') {
    const amount = msg.amount;
    if (!Number.isFinite(amount)) {
      return { ok: false, error: 'bad_amount' };
    }
    player.cash = amount;
    return { ok: true, type: 'debug_set_cash', amount };
  }
  if (type === 'kill_session') {
    endSession(session, 'manual_kill');
    return { ok: true, type: 'kill_session' };
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
  const role = url.searchParams.get('role') === 'host' ? 'host' : 'guest';
  let session = sessions.get(sessionId);
  if (!session) {
    session = await buildMatch();
    sessions.set(sessionId, session);
  }
  session.lastActivity = Date.now();
  resetIdleTimer(session);
  session.id = sessionId;
  session.clients.add(ws);
  const playerId = requestedPlayerId || `p_${Math.floor(Math.random() * 1e9).toString(36)}`;
  let player = session.players.get(playerId);
  if (!player) {
    player = createPlayer(playerId);
    session.players.set(playerId, player);
  }
  session.playerRoles.set(playerId, role);
  if (!session.hostId && role === 'host') {
    session.hostId = playerId;
  }
  session.clientPlayers.set(ws, playerId);
  armIdleGuard(session);
  session.clientActivity.set(playerId, Date.now());
  if (!session.idleCheckHandle) {
    session.idleCheckHandle = setInterval(() => {
      if (!session || session.ended) return;
      const now = Date.now();
      // If no clients, let the no-client killer handle it
      if (!session.clients || session.clients.size === 0) return;
      // If any client has recent activity, keep alive
      let allIdle = true;
      session.clientPlayers.forEach((pid) => {
        const last = session.clientActivity.get(pid) || 0;
        if (now - last < SESSION_IDLE_TIMEOUT_MS) {
          allIdle = false;
        }
      });
      if (allIdle) {
        broadcast(session, {
          type: 'idle_warning',
          message: `No player actions for ${SESSION_IDLE_TIMEOUT_MS / 1000}s — closing server.`,
          idleSeconds: SESSION_IDLE_TIMEOUT_MS / 1000
        });
        endSession(session, 'idle_timeout');
      }
    }, SESSION_IDLE_CHECK_MS);
  }

  // Send initial snapshot
  ws.send(JSON.stringify({
    type: 'snapshot',
    ...buildSnapshot(session),
    player: serializePlayer(player, session.sim),
    ticks: session.tickBuffer.slice()
  }));

  if (session.started) {
    startTickLoop(session);
  }

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
      // Hard kill session after short grace when no clients remain
      setTimeout(() => {
        if (session.clients.size === 0) {
          endSession(session, 'client_idle');
        }
      }, SESSION_CLIENT_IDLE_MS);
    }
  });
});

app.listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log(`Server running on ${PORT}`))
  .catch(err => {
    console.error('Failed to start server', err);
    process.exit(1);
  });
