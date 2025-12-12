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
const DEFAULT_TICK_INTERVAL_MS = 500;
const GAME_START_YEAR = 1985;
const GAME_END_YEAR = 2050;
const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS || 50);
const SNAPSHOT_HISTORY_LIMIT = 1000;
const SNAPSHOT_QUARTER_LIMIT = 120;
const TICK_HISTORY_LIMIT = 1;
const TICK_QUARTER_LIMIT = 40;
// Venture spinouts (VC → public) need a richer history payload on ticks so
// multiplayer clients can render pre-IPO valuation/financial history similar
// to singleplayer. Limit this to spinouts to avoid bloating every tick.
const FROM_VENTURE_TICK_HISTORY_LIMIT = 400;
const GAME_START_DATE = new Date(Date.UTC(GAME_START_YEAR, 0, 1));

const app = fastify({ logger: false });

function getTickIntervalMs(session) {
  const raw = session && Number(session.tickIntervalMs);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TICK_INTERVAL_MS;
  const minMs = 50;
  const maxMs = 5000;
  return Math.min(maxMs, Math.max(minMs, raw));
}

function canonicalizePlayerId(id) {
  if (!id) return null;
  const cleaned = id.toString().trim().replace(/\s+/g, ' ').slice(0, 30);
  return cleaned || null;
}

function isPlayerIdTaken(session, candidateId) {
  const canonical = canonicalizePlayerId(candidateId);
  if (!canonical) return false;
  const lower = canonical.toLowerCase();
  let taken = false;
  session.clientPlayers.forEach((pid) => {
    const canon = canonicalizePlayerId(pid);
    if (canon && canon.toLowerCase() === lower) {
      taken = true;
    }
  });
  if (!taken) {
    session.players.forEach((_, pid) => {
      const canon = canonicalizePlayerId(pid);
      if (canon && canon.toLowerCase() === lower) {
        taken = true;
      }
    });
  }
  return taken;
}

// Simple in-memory sessions (non-persistent)
const sessions = new Map();
const SESSION_CLEANUP_DELAY_MS = 60_000;
const SESSION_IDLE_TIMEOUT_MS = 4 * 60 * 1000; // 4 minutes without player commands
const SESSION_CLIENT_IDLE_MS = 2 * 60 * 1000; // Kill if no clients for this long
const SESSION_IDLE_CHECK_MS = 1000; // how often to check client idleness

function getTotalClientCount() {
  let total = 0;
  sessions.forEach(session => {
    total += session.clients.size || 0;
  });
  return total;
}

function createPlayer(id) {
  return {
    id,
    cash: 3000,
    debt: 0,
    bankrupt: false,
    character: 'wojak',
    dripEnabled: false,
    holdings: {}, // companyId -> units
    ventureHoldings: {}, // ventureId -> equity percent
    ventureCommitments: {}, // ventureId -> committed cash
    ventureCashInvested: {}, // ventureId -> total invested cash
    lastInterestTs: null,
    lastCommandTs: Date.now()
  };
}

function pickIpoDate(config = {}, rngFn = Math.random, startYear = GAME_START_YEAR) {
  const rand = typeof rngFn === 'function' ? rngFn : Math.random;
  const staticCfg = config.static || {};
  if (staticCfg.ipo_instantly) {
    return new Date(Date.UTC(startYear, 0, 1));
  }
  let from = Number(staticCfg?.ipo_window?.from);
  let to = Number(staticCfg?.ipo_window?.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    from = startYear + 1;
    to = startYear + 6;
  }
  if (to < from) [from, to] = [to, from];
  const year = Math.floor(rand() * (to - from + 1) + from);
  const day = Math.floor(rand() * 365) + 1;
  const date = new Date(Date.UTC(year, 0, 1));
  date.setUTCDate(day);
  return date;
}

function ensureIpoMetadata(companies = [], rngFn = Math.random, startYear = GAME_START_YEAR) {
  companies.forEach(cfg => {
    if (!cfg || typeof cfg !== 'object') return;
    if (!cfg.static) cfg.static = {};
    if (!cfg.static.ipo_window || !Number.isFinite(cfg.static.ipo_window.from) || !Number.isFinite(cfg.static.ipo_window.to)) {
      const fallbackYear = startYear + 1;
      cfg.static.ipo_window = { from: fallbackYear, to: fallbackYear + 4 };
    }
    if (!cfg.ipoDate) {
      cfg.ipoDate = pickIpoDate(cfg, rngFn, startYear);
    }
  });
}

async function buildMatch(seed = Date.now()) {
  const rng = new SeededRandom(seed);
  const rngFn = () => rng.random();
  const presetOpts = { rng: rngFn, baseDir: path.join(__dirname, '..') };
  const pubs = [];
  pubs.push(...await Presets.generateClassicCompanies(presetOpts));
  pubs.push(...await Presets.generatePublicHardTechPresetCompanies(3, presetOpts));
  ensureIpoMetadata(pubs, rngFn, GAME_START_YEAR);
  const ventures = [
    ...(await Presets.generateHypergrowthPresetCompanies(presetOpts)),
    ...await Presets.generatePrivateHardTechCompanies(null, presetOpts)
  ];
  const sim = new Simulation(pubs, { seed, rng: rngFn, macroEvents: macroEvents || [], startYear: GAME_START_YEAR });
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
    idleCheckHandle: null,
    tickIntervalMs: DEFAULT_TICK_INTERVAL_MS,
    localDebugAllowed: false
  };
}

function startTickLoop(session) {
  if (session.tickHandle || session.ended || !session.started) return;
  const interval = getTickIntervalMs(session);
  session.tickHandle = setInterval(() => {
    if (session.ended) {
      stopTickLoop(session);
      return;
    }
    // Client-idle check handled by separate timer; this remains the tick driver.
    const currentYear = session.sim.lastTick ? session.sim.lastTick.getUTCFullYear() : GAME_START_YEAR;
    if (currentYear >= GAME_END_YEAR) {
      endSession(session);
      return;
    }
    const current = session.sim.lastTick || GAME_START_DATE;
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
    const refDate = session.sim.lastTick || GAME_START_DATE;
    const companiesPayload = session.sim.companies
      .filter(c => {
        if (c && typeof c.isVisibleAt === 'function') {
          return c.isVisibleAt(refDate);
        }
        return true;
      })
      .map(c => {
        if (typeof c.toSnapshot === 'function') {
          const fromVenture = c.fromVenture || (c.static && c.static.fromVenture);
          const historyLimit = fromVenture ? FROM_VENTURE_TICK_HISTORY_LIMIT : TICK_HISTORY_LIMIT;
          return c.toSnapshot({ historyLimit, quarterLimit: TICK_QUARTER_LIMIT });
        }
        return {
          id: c.id,
          marketCap: c.marketCap,
          history: c.history ? c.history.slice(-1) : []
        };
      });
    const payload = {
      type: 'tick',
      lastTick: session.sim.lastTick ? session.sim.lastTick.toISOString() : null,
      companies: companiesPayload,
      ventureEvents,
      venture: session.ventureSim ? session.ventureSim.getTickSnapshot() : null,
      dividendEvents,
      macroEvents: session.sim.getActiveMacroEvents ? session.sim.getActiveMacroEvents() : [],
      players: Array.from(session.players.values()).map(p => serializePlayer(p, session.sim))
    };
    cacheAndBroadcast(session, payload);
    const newYear = session.sim.lastTick ? session.sim.lastTick.getUTCFullYear() : currentYear;
    if (newYear >= GAME_END_YEAR) {
      endSession(session);
    }
  }, interval);
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

function restartTickLoop(session) {
  stopTickLoop(session);
  if (session && session.started && !session.ended) {
    startTickLoop(session);
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

function broadcastPlayers(session) {
  const players = Array.from(session.players.values()).map(p => serializePlayer(p, session.sim));
  broadcast(session, { type: 'players_update', players });
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
  const idleSeconds = reason === 'idle_timeout' ? SESSION_IDLE_TIMEOUT_MS / 1000 : null;
  broadcast(session, {
    type: 'end',
    reason,
    year: GAME_END_YEAR,
    lastTick: session.sim.lastTick ? session.sim.lastTick.toISOString() : null,
    idleSeconds
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

/*
app.register(require('@fastify/http-proxy'), {
  upstream: 'https://us.i.posthog.com',
  prefix: '/ingest',
  rewritePrefix: '/ingest', // Keep /ingest or strip it? PostHog expects /ingest/s/ or /ingest/i/ etc?
  // The user's example showed stripping it: pathRewrite: { '^/ingest': '' }
  // Fastify proxy uses `rewritePrefix` to replace the prefix. If we want to strip it, we set it to empty string?
  // Wait, fastify-http-proxy documentation says:
  // "rewritePrefix: Rewrite the prefix to the specified string. Default: '' (empty string)."
  // If we want to forward /ingest/v1/decide to https://us.i.posthog.com/v1/decide, we should strip /ingest.
  rewritePrefix: '',
  http2: false
}); */

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
  // Ensure venture holdings/commitments stay in sync with the sim (covers reconnect/resync)
  if (sim && sim._ventureSim && player && player.id) {
    const holdings = {};
    const commitments = {};
    sim._ventureSim.companies.forEach(vc => {
      if (!vc) return;
      const pct = vc.playerEquityMap ? (vc.playerEquityMap[player.id] || 0) : 0;
      if (Number.isFinite(pct) && pct > 0) holdings[vc.id] = pct;
      const commit = vc.pendingCommitments ? (vc.pendingCommitments[player.id] || 0) : 0;
      if (Number.isFinite(commit) && commit > 0) commitments[vc.id] = commit;
    });
    player.ventureHoldings = holdings;
    player.ventureCommitments = commitments;
  }
  const holdings = player.holdings || {};
  const equity = computeEquity(sim, holdings);
  const ventureValue = computeVentureEquity(sim._ventureSim, player.ventureHoldings || {}, player.id);
  const commitments = computeVentureCommitments(player.ventureCommitments || {}, sim._ventureSim, player.id);
  const netWorth = computeNetWorth(sim, player);
  const bankrupt = netWorth < 0 && player.debt > 0;
  player.bankrupt = bankrupt;
  const netWorthComponents = {
    cash: player.cash,
    debt: player.debt,
    equity,
    ventureEquity: ventureValue,
    commitments,
    netWorth
  };
  const character = player.character || 'wojak';
  return {
    id: player.id,
    name: player.id,
    cash: player.cash,
    debt: player.debt,
    character,
    equity,
    ventureEquity: ventureValue,
    ventureCommitmentsValue: commitments,
    netWorth,
    holdings,
    dripEnabled: !!player.dripEnabled,
    bankrupt,
    ventureHoldings: player.ventureHoldings || {},
    ventureCommitments: player.ventureCommitments || {},
    ventureCashInvested: player.ventureCashInvested || {},
    netWorthComponents
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

function computeVentureEquity(ventureSim, ventureHoldings, playerId = null) {
  let value = 0;
  if (!ventureSim || !ventureSim.companies) return value;
  ventureSim.companies.forEach(vc => {
    let pct = ventureHoldings ? (ventureHoldings[vc.id] || 0) : 0;
    if ((!pct || pct <= 0) && playerId && vc && vc.playerEquityMap && Number.isFinite(vc.playerEquityMap[playerId])) {
      pct = vc.playerEquityMap[playerId] || 0;
    }
    if (pct > 0 && vc.currentValuation) {
      value += pct * vc.currentValuation;
    }
  });
  return value;
}

function computeVentureCommitments(commitments, ventureSim = null, playerId = null) {
  let total = 0;
  Object.values(commitments || {}).forEach(v => {
    if (Number.isFinite(v)) total += v;
  });
  if (ventureSim && playerId) {
    ventureSim.companies.forEach(vc => {
      if (!vc || !vc.pendingCommitments) return;
      if (commitments && Number.isFinite(commitments[vc.id])) return;
      const v = vc.pendingCommitments[playerId];
      if (Number.isFinite(v)) total += v;
    });
  }
  return total;
}

function computeNetWorth(sim, player) {
  if (!sim || !player) return 0;
  const equity = computeEquity(sim, player.holdings || {});
  const ventureValue = computeVentureEquity(sim._ventureSim, player.ventureHoldings || {}, player.id);
  const commitments = computeVentureCommitments(player.ventureCommitments || {}, sim._ventureSim, player.id);
  return player.cash + equity + ventureValue + commitments - player.debt;
}

function maxBorrowable(sim, player) {
  const netWorth = computeNetWorth(sim, player);
  // Borrowing cap is 4× net worth (matches singleplayer + README).
  const cap = Math.max(0, netWorth) * 4;
  return Math.max(0, cap - player.debt);
}

function accrueInterest(session, dtDays) {
  if (!Number.isFinite(dtDays) || dtDays <= 0) return;
  session.players.forEach(player => {
    if (!player || player.debt <= 0) return;
    const interest = player.debt * ANNUAL_INTEREST_RATE * (dtDays / 365);
    if (interest <= 0) return;
    const payFromCash = Math.min(player.cash, interest);
    player.cash -= payFromCash;
    const unpaid = interest - payFromCash;
    if (unpaid > 0) {
      player.debt += unpaid; // capitalize unpaid interest into debt
    }
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
        const equityPct = Number.isFinite(evt.playerEquity) ? evt.playerEquity : (Number.isFinite(evt.equityGranted) ? evt.equityGranted : null);
        if (Number.isFinite(equityPct) && equityPct > 0) {
          player.ventureHoldings[evt.companyId] = equityPct;
        }
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
      // Credit any refund/liquidation payout on the authoritative server
      const player = evt.playerId ? session.players.get(evt.playerId) : null;
      if (player && evt.companyId) {
        const refund = Number(evt.refund) || 0;
        if (refund > 0) {
          player.cash += refund;
        }
        if (player.ventureCommitments) {
          delete player.ventureCommitments[evt.companyId];
        }
      }
      return;
    }
    if (evt.type === 'venture_ipo') {
      // Always extract from ventureSim so it leaves the private roster
      let ventureCompany = null;
      if (session.ventureSim) {
        ventureCompany = session.ventureSim.extractCompany(evt.companyId);
      }
      // Fallback to the provided reference if extraction failed
      if (!ventureCompany && evt.companyRef) {
        ventureCompany = evt.companyRef;
      } else if (!ventureCompany && session.ventureSim) {
        ventureCompany = session.ventureSim.getCompanyById(evt.companyId);
      }
      if (ventureCompany && typeof session.sim.adoptVentureCompany === 'function') {
        session.sim.adoptVentureCompany(ventureCompany, session.sim.lastTick);
        // Transfer ownership to public holdings
        session.players.forEach(p => {
          const directPct = p.ventureHoldings ? (p.ventureHoldings[evt.companyId] || 0) : 0;
          const mapPct = ventureCompany.playerEquityMap ? (ventureCompany.playerEquityMap[p.id] || 0) : 0;
          const pct = Math.max(directPct, mapPct);
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
  const simState = session.sim.exportState({
    detail: false,
    historyLimit: SNAPSHOT_HISTORY_LIMIT,
    quarterLimit: SNAPSHOT_QUARTER_LIMIT
  });
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
  if (!msg || typeof msg !== 'object') {
    return { ok: false, error: 'bad_payload' };
  }
  const type = msg.type;
  if (!type) {
    return { ok: false, error: 'bad_payload' };
  }
  const allowedWhileBankrupt = (type === 'ping' || type === 'resync' || type === 'liquidate_assets' || type === 'debug_set_speed');
  const currentNetWorth = computeNetWorth(session.sim, player);
  const isBankruptNow = currentNetWorth < 0 && player.debt > 0;
  if (isBankruptNow && !allowedWhileBankrupt) {
    return { ok: false, error: 'bankrupt' };
  }
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
  if (type === 'debug_set_speed') {
    const speed = Number(msg.speed);
    if (!Number.isFinite(speed) || speed <= 0) {
      return { ok: false, error: 'bad_speed' };
    }
    if (!session.localDebugAllowed) {
      return { ok: false, error: 'unauthorized' };
    }
    const role = session.playerRoles.get(player.id) || 'guest';
    if (role !== 'host') {
      return { ok: false, error: 'unauthorized' };
    }
    const clamped = Math.max(0.25, Math.min(speed, 16));
    const interval = DEFAULT_TICK_INTERVAL_MS / clamped;
    session.tickIntervalMs = interval;
    restartTickLoop(session);
    return {
      ok: true,
      type: 'debug_set_speed',
      speed: clamped,
      intervalMs: interval
    };
  }
  if (type === 'debug_bankrupt_company') {
    if (!session.localDebugAllowed) {
      return { ok: false, error: 'unauthorized' };
    }
    const role = session.playerRoles.get(player.id) || 'guest';
    if (role !== 'host') {
      return { ok: false, error: 'unauthorized' };
    }
    const rawName = (msg.companyName || msg.name || '').toString().trim();
    if (!rawName) {
      return { ok: false, error: 'bad_name' };
    }
    const targetKey = rawName.toLowerCase();
    const now = session.sim.lastTick ? new Date(session.sim.lastTick) : GAME_START_DATE;

    // Try public market first
    let company = null;
    if (session.sim && Array.isArray(session.sim.companies)) {
      company = session.sim.companies.find(c => c && typeof c.name === 'string' && c.name.toLowerCase() === targetKey);
    }
    if (company && typeof company.markBankrupt === 'function') {
      try {
        company.markBankrupt(now);
      } catch (err) {
        return { ok: false, error: 'failed' };
      }
      return {
        ok: true,
        type: 'debug_bankrupt_company',
        scope: 'public',
        companyId: company.id || null,
        name: company.name || rawName
      };
    }

    // Fallback: try venture companies by name
    const ventureSim = session.ventureSim;
    let vc = null;
    if (ventureSim && Array.isArray(ventureSim.companies)) {
      vc = ventureSim.companies.find(c => c && typeof c.name === 'string' && c.name.toLowerCase() === targetKey);
    }
    if (!vc) {
      return { ok: false, error: 'not_found' };
    }
    // Use existing failure helpers where possible
    try {
      if (typeof vc.handleHardTechFailure === 'function') {
        vc.handleHardTechFailure(now);
        // handleHardTechFailure stashes a pendingHardTechFailure event; consume it so
        // the next tick will process it as normal venture_failed.
        const ev = vc.pendingHardTechFailure;
        if (ev && Array.isArray(ventureSim._pendingDebugEvents)) {
          ventureSim._pendingDebugEvents.push(ev);
        } else if (ev) {
          ventureSim._pendingDebugEvents = [ev];
        }
      } else {
        // Generic debug failure path if no hard-tech helper is present
        vc.status = 'failed';
        vc.currentValuation = 0;
        vc.marketCap = 0;
        vc.failedAt = now;
        vc.failedAtWall = Date.now();
        vc.lastEventNote = 'Debug: forced failure.';
      }
    } catch (err) {
      return { ok: false, error: 'failed' };
    }
    return {
      ok: true,
      type: 'debug_bankrupt_company',
      scope: 'venture',
      companyId: vc.id || null,
      name: vc.name || rawName
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
  if (type === 'liquidate_assets') {
    player.cash = 0;
    player.debt = 0;
    player.holdings = {};
    player.ventureHoldings = {};
    player.ventureCommitments = {};
    player.ventureCashInvested = {};
    player.lastCommandTs = Date.now();
    broadcastPlayers(session);
    return { ok: true, type: 'liquidate_assets' };
  }
  if (type === 'set_drip') {
    const enabled = !!msg.enabled;
    player.dripEnabled = enabled;
    return { ok: true, type: 'set_drip', enabled };
  }
  if (type === 'set_character') {
    const key = (msg.character || '').toString().trim().toLowerCase();
    // Simple allowlist
    const allowed = new Set(['wojak', 'grug', 'zoomer', 'bloomer']);
    if (!allowed.has(key)) {
      return { ok: false, error: 'bad_character' };
    }
    player.character = key;
    broadcastPlayers(session);
    return { ok: true, type: 'set_character', character: key };
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
  if (type === 'vc_invest') {
    const companyId = msg.companyId;
    const pct = Number(msg.pct);
    if (!companyId || !session.ventureSim) {
      return { ok: false, error: 'unknown_company' };
    }
    if (!Number.isFinite(pct) || pct <= 0) {
      return { ok: false, error: 'bad_amount' };
    }
    const company = session.ventureSim.getCompanyById(companyId);
    if (!company || company.status !== 'raising' || !company.currentRound) {
      return { ok: false, error: 'not_raising' };
    }
    const equityFraction = pct / 100;
    const investResult = session.ventureSim.invest(companyId, equityFraction, player.id);
    if (!investResult?.success) {
      return { ok: false, error: investResult?.reason || 'invest_failed' };
    }
    const amount = investResult.amount || 0;
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: 'bad_amount' };
    }
    if (player.cash < amount) {
      // roll back pending commitment
      company.pendingCommitment = Math.max(0, (company.pendingCommitment || 0) - amount);
      if (company.currentRound) {
        company.currentRound.playerCommitAmount = Math.max(0, (company.currentRound.playerCommitAmount || 0) - amount);
        company.currentRound.playerCommitEquity = Math.max(0, (company.currentRound.playerCommitEquity || 0) - equityFraction);
        if ((company.currentRound.playerCommitAmount || 0) <= 0) {
          company.currentRound.playerCommitted = false;
        }
      }
      return { ok: false, error: 'insufficient_cash' };
    }
    player.cash -= amount;
    player.ventureCommitments[companyId] = (player.ventureCommitments[companyId] || 0) + amount;
    player.lastCommandTs = Date.now();
    return {
      ok: true,
      type: 'vc_invest',
      companyId,
      amount,
      equityFraction: investResult.equityFraction || equityFraction
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
  // Buffer any early messages that might arrive before session setup completes.
  const bufferedMessages = [];
  const bufferMessage = (data) => bufferedMessages.push(data);
  ws.on('message', bufferMessage);

  if (getTotalClientCount() >= MAX_CONNECTIONS) {
    try {
      ws.send(JSON.stringify({ type: 'error', error: 'server_full' }));
      ws.close(4009, 'server_full');
    } catch (err) { /* ignore */ }
    ws.removeListener('message', bufferMessage);
    return;
  }
  const sessionId = url.searchParams.get('session') || 'default';
  const requestedPlayerId = url.searchParams.get('player') || null;
  const role = url.searchParams.get('role') === 'host' ? 'host' : 'guest';
  const remoteAddr = (req.socket && req.socket.remoteAddress) || '';
  const hostHeader = (req.headers && req.headers.host) || '';
  const isLocalRequest = /(^127\.0\.0\.1)|(::1)|(^localhost)|(\.local$)/i.test(remoteAddr) ||
    /(^127\.0\.0\.1)|(::1)|(^localhost)|(\.local$)/i.test(hostHeader);
  let session = sessions.get(sessionId);
  if (!session) {
    if (role === 'guest') {
      ws.close(4004, 'Session not found');
      ws.removeListener('message', bufferMessage);
      return;
    }
    session = await buildMatch();
    sessions.set(sessionId, session);
  }
  if (isLocalRequest) {
    session.localDebugAllowed = true;
  }
  session.lastActivity = Date.now();
  resetIdleTimer(session);
  session.id = sessionId;
  const rawPlayerId = requestedPlayerId || `p_${Math.floor(Math.random() * 1e9).toString(36)}`;
  const playerId = canonicalizePlayerId(rawPlayerId);
  if (!playerId) {
    try {
      ws.send(JSON.stringify({ type: 'error', error: 'invalid_name' }));
      ws.close(4006, 'invalid_name');
    } catch (err) { /* ignore */ }
    ws.removeListener('message', bufferMessage);
    return;
  }
  const lowerPid = playerId.toLowerCase();
  const socketsWithSameId = [];
  session.clientPlayers.forEach((pid, socket) => {
    const canon = canonicalizePlayerId(pid);
    if (canon && canon.toLowerCase() === lowerPid) {
      socketsWithSameId.push(socket);
    }
  });
  const existingPlayer = session.players.get(playerId) || null;
  if (existingPlayer) {
    const hasActiveDupes = socketsWithSameId.some(socket =>
      socket !== ws && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
    );
    if (hasActiveDupes) {
      try {
        ws.send(JSON.stringify({ type: 'error', error: 'name_taken' }));
        ws.close(4005, 'name_taken');
      } catch (err) { /* ignore */ }
      return;
    }
    // Allow reconnect when no other live socket is using this id
    socketsWithSameId.forEach(socket => {
      try {
        if (socket !== ws && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
          socket.close(4001, 'replaced');
        }
      } catch (err) { /* ignore */ }
    });
  } else {
    if (session.started) {
      try {
        ws.send(JSON.stringify({ type: 'error', error: 'match_started' }));
        ws.close(4010, 'match_started');
      } catch (err) { /* ignore */ }
      ws.removeListener('message', bufferMessage);
      return;
    }
    if (socketsWithSameId.length > 0) {
      try {
        ws.send(JSON.stringify({ type: 'error', error: 'name_taken' }));
        ws.close(4005, 'name_taken');
      } catch (err) { /* ignore */ }
      ws.removeListener('message', bufferMessage);
      return;
    }
  }
  session.clients.add(ws);
  let player = existingPlayer || createPlayer(playerId);
  if (!existingPlayer) {
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

  const handleIncomingMessage = (data) => {
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
  };

  // Swap the temporary buffer listener for the real handler now that setup is done.
  ws.removeListener('message', bufferMessage);
  ws.on('message', handleIncomingMessage);

  // Send initial snapshot
  ws.send(JSON.stringify({
    type: 'snapshot',
    ...buildSnapshot(session),
    player: serializePlayer(player, session.sim),
    ticks: session.tickBuffer.slice()
  }));
  // Replay any messages that arrived during session setup (e.g. early set_character)
  if (bufferedMessages.length) {
    bufferedMessages.splice(0).forEach(handleIncomingMessage);
  }
  // Notify everyone of the updated roster
  broadcastPlayers(session);

  if (session.started) {
    startTickLoop(session);
  }

  ws.on('close', () => {
    session.clients.delete(ws);
    session.clientPlayers.delete(ws);
    // Remove player if no other socket is using this id
    const stillHasClient = Array.from(session.clientPlayers.values()).includes(playerId);
    if (!stillHasClient && !session.started) {
      session.players.delete(playerId);
    }
    broadcastPlayers(session);
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
