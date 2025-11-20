// --- DOM Elements ---
const bodyEl = document.body;
const netWorthDisplay = document.getElementById('netWorthDisplay');
const currentDateDisplay = document.getElementById('currentDateDisplay');
const companiesGrid = document.getElementById('companiesGrid');

const speedSlider = document.getElementById('speedSlider');
const speedThumbLabel = document.getElementById('speedThumbLabel');
const backBtn = document.getElementById('back-btn');
const portfolioList = document.getElementById('portfolioList');
const emptyPortfolioMsg = document.getElementById('emptyPortfolioMsg');
const playerCashDisplay = document.getElementById('playerCashDisplay');
const playerStakeDisplay = document.getElementById('playerStakeDisplay');
const investmentAmountInput = document.getElementById('investmentAmountInput');
const buyBtn = document.getElementById('buyBtn');
const sellBtn = document.getElementById('sellBtn');
const bankBtn = document.getElementById('bankBtn');
const subFinancialDisplay = document.getElementById('subFinancialDisplay');
const wojakImage = document.getElementById('wojakImage');
const faviconLink = document.getElementById('faviconLink');
const macroEventsDisplay = document.getElementById('macroEventsDisplay');
const buyMaxBtn = document.getElementById('buyMaxBtn');
const sellMaxBtn = document.getElementById('sellMaxBtn');
const vcBtn = document.getElementById('vcBtn');
const vcView = document.getElementById('vc-view');
const backToMainBtn = document.getElementById('back-to-main-btn');
const dripToggle = document.getElementById('dripToggle');
const multiplayerBtn = document.getElementById('multiplayerBtn');
const multiplayerModal = document.getElementById('multiplayerModal');
const closeMultiplayerBtn = document.getElementById('closeMultiplayerBtn');
const mpBackendInput = document.getElementById('mpBackendInput');
const mpSessionInput = document.getElementById('mpSessionInput');
const connectMultiplayerBtn = document.getElementById('connectMultiplayerBtn');
const playerLeaderboardEl = document.getElementById('playerLeaderboard');
const connectedPlayersEl = document.getElementById('connectedPlayers');
const connectedPlayersSessionEl = document.getElementById('connectedPlayersSession');

const DEFAULT_WOJAK_SRC = 'wojaks/wojak.png';
const MALDING_WOJAK_SRC = 'wojaks/malding-wojak.png';

// --- Helper utilities ---
const PresetGenerators = window.PresetGenerators || {};
const {
    generateHardTechPresetCompanies,
    generateSteadyMegacorpCompanies,
    generateHypergrowthPresetCompanies,
    generateBinaryHardTechCompanies,
    generateProductRotatorCompanies,
    DEFAULT_VC_ROUNDS,
    HARDTECH_VC_ROUNDS
} = PresetGenerators;

if (!generateHardTechPresetCompanies || !generateSteadyMegacorpCompanies || !generateHypergrowthPresetCompanies || !generateBinaryHardTechCompanies || !generateProductRotatorCompanies) {
    throw new Error('PresetGenerators failed to load. Ensure presets.js is included before main.js.');
}

const pipelineModule = window.PipelineUI;
if (!pipelineModule) {
    throw new Error('Pipeline UI module failed to load. Ensure pipelineUi.js is included before main.js.');
}
const { getPipelineHTML, updatePipelineDisplay } = pipelineModule;

const simShared = window.SimShared || {};
const SeededRandom = simShared.SeededRandom || null;

const wojakFactory = window.WojakManagerFactory;
if (!wojakFactory) {
    throw new Error('Wojak manager module failed to load. Ensure wojakManager.js is included before main.js.');
}

const dashboardModule = window.DashboardRenderers;
if (!dashboardModule) {
    throw new Error('Dashboard renderer module failed to load. Ensure dashboardRenderers.js is included before main.js.');
}
const { renderCompanies: renderCompaniesUI, renderPortfolio: renderPortfolioUI } = dashboardModule;

window.triggerMacroEvent = function (eventId) {
    if (!sim || typeof sim.triggerMacroEvent !== 'function') {
        console.warn('Simulation not ready; cannot trigger macro event.');
        return null;
    }
    const event = sim.triggerMacroEvent(eventId);
    if (event) {
        console.log(`Macro event triggered: ${event.label}`);
        updateMacroEventsDisplay();
    } else {
        console.warn('Macro event not found or failed to trigger:', eventId);
    }
    return event;
};

// --- Banking Modal Elements ---
const bankingModal = document.getElementById('bankingModal');
const closeBankingBtn = document.getElementById('closeBankingBtn');
const bankingCashDisplay = document.getElementById('bankingCashDisplay');
const bankingNetWorthDisplay = document.getElementById('bankingNetWorthDisplay');
const currentDebtDisplay = document.getElementById('currentDebtDisplay');
const maxBorrowDisplay = document.getElementById('maxBorrowDisplay');
const bankingAmountInput = document.getElementById('bankingAmountInput');
const borrowBtn = document.getElementById('borrowBtn');
const repayBtn = document.getElementById('repayBtn');

// --- Game State ---
let currentDate = new Date('1990-01-01T00:00:00Z');
let isPaused = false;
let gameInterval;
let activeCompanyDetail = null;
let isMillionaire = false;
let isBillionaire = false;
let isTrillionaire = false;
const jsConfetti = new JSConfetti();
let currentSpeed = 1;
let wasAutoPaused = false;
let isGameReady = false;
let currentSort = 'ipoQueue';
let currentFilter = 'all';
const DRIP_STORAGE_KEY = 'wojak_drip_enabled';
let dripEnabled = false;
const SPEED_STEPS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8];
const SESSION_ID_KEY = 'wojak_session_id';
const BACKEND_URL_KEY = 'wojak_backend_url';
try {
    const stored = localStorage.getItem(DRIP_STORAGE_KEY);
    if (stored === 'true') dripEnabled = true;
    if (stored === 'false') dripEnabled = false;
} catch (err) {
    console.warn('Unable to read DRIP setting:', err);
}

// --- Financial State ---
let cash = 3000;
let portfolio = [];
let netWorth = cash;
let netWorthHistory = [{ x: currentDate.getTime(), y: netWorth }];
let netWorthAth = netWorth;
let lastDrawdownTriggerAth = 0;
let wojakManager = null;
if (wojakImage) {
    wojakManager = wojakFactory.createWojakManager({
        imageElement: wojakImage,
        defaultSrc: DEFAULT_WOJAK_SRC,
        maldingSrc: MALDING_WOJAK_SRC,
        getNetWorth: () => netWorth
    });
}

// --- Banking State ---
let totalBorrowed = 0;
let lastInterestDate = new Date(currentDate);
const ANNUAL_INTEREST_RATE = 0.07;

// --- Global Game Constants ---
const GAME_END_YEAR = 2050;

let sim;
let companies = [];
let ventureSim;
let ventureCompanies = [];

// Per-match context (seed + rng + refs) to keep public/venture in sync.
let matchSeed = null;
let matchRng = null;
let matchRngFn = null;
let ws;
let serverPlayer = null;
let clientPlayerId = null;
let serverTicks = new Set();
let isServerAuthoritative = false;
let connectionStatusEl = null;
let resyncBtn = null;
let disconnectBtn = null;
let latestServerPlayers = [];
let activeSessionId = null;
let activeBackendUrl = null;
let manualDisconnect = false;
const playerNetWorthSeries = new Map();
const PLAYER_COLORS = ['#22c55e', '#3b82f6', '#f97316', '#a855f7', '#06b6d4', '#ef4444', '#0ea5e9', '#10b981'];

function initMatchContext(seedOverride = null) {
    if (!matchSeed) {
        const urlSeed = new URL(window.location.href).searchParams.get('seed');
        matchSeed = seedOverride ?? (urlSeed ? Number(urlSeed) : Number(Date.now()));
    }
    if (!matchRng && SeededRandom) {
        matchRng = new SeededRandom(matchSeed);
        matchRngFn = () => matchRng.random();
    } else if (!matchRngFn) {
        matchRngFn = Math.random;
    }
}

function ensureConnectionBanner() {
    if (connectionStatusEl) return;
    const wrapper = document.createElement('div');
    wrapper.id = 'connectionStatusBanner';
    wrapper.style.position = 'fixed';
    wrapper.style.top = '12px';
    wrapper.style.right = '12px';
    wrapper.style.zIndex = '999';
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '8px';
    wrapper.style.padding = '8px 10px';
    wrapper.style.borderRadius = '8px';
    wrapper.style.background = '#0f172a';
    wrapper.style.color = '#e2e8f0';
    wrapper.style.boxShadow = '0 6px 18px rgba(0,0,0,0.18)';

    const statusText = document.createElement('span');
    statusText.id = 'connectionStatusText';
    statusText.textContent = 'Connecting...';
    statusText.style.fontSize = '12px';
    statusText.style.fontWeight = '600';

    const resyncButton = document.createElement('button');
    resyncButton.textContent = 'Force Resync';
    resyncButton.style.background = '#1e293b';
    resyncButton.style.border = '1px solid #334155';
    resyncButton.style.color = '#e2e8f0';
    resyncButton.style.cursor = 'pointer';
    resyncButton.style.borderRadius = '6px';
    resyncButton.style.padding = '6px 8px';
    resyncButton.style.fontSize = '11px';
    resyncButton.addEventListener('click', () => requestResync('manual'));

    const disconnectButton = document.createElement('button');
    disconnectButton.textContent = 'Go Offline';
    disconnectButton.style.background = '#7c2d12';
    disconnectButton.style.border = '1px solid #b45309';
    disconnectButton.style.color = '#fef3c7';
    disconnectButton.style.cursor = 'pointer';
    disconnectButton.style.borderRadius = '6px';
    disconnectButton.style.padding = '6px 8px';
    disconnectButton.style.fontSize = '11px';
    disconnectButton.addEventListener('click', () => disconnectMultiplayer());

    wrapper.appendChild(statusText);
    wrapper.appendChild(resyncButton);
    wrapper.appendChild(disconnectButton);
    document.body.appendChild(wrapper);
    connectionStatusEl = statusText;
    resyncBtn = resyncButton;
    disconnectBtn = disconnectButton;
}

function setConnectionStatus(text, tone = 'info') {
    if (!connectionStatusEl) return;
    connectionStatusEl.textContent = text;
    const parent = connectionStatusEl.parentElement;
    if (!parent) return;
    let bg = '#0f172a';
    if (tone === 'ok') bg = '#0f2a17';
    else if (tone === 'warn') bg = '#2a1f0f';
    else if (tone === 'error') bg = '#2a0f12';
    parent.style.background = bg;
}

function requestResync(reason = 'manual') {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        setConnectionStatus('Resync unavailable (disconnected)', 'warn');
        return;
    }
    setConnectionStatus('Resyncing...', 'warn');
    ws.send(JSON.stringify({ type: 'resync', reason }));
}

function disconnectMultiplayer() {
    manualDisconnect = true;
    activeBackendUrl = null;
    activeSessionId = null;
    try {
        localStorage.removeItem(BACKEND_URL_KEY);
        localStorage.removeItem(SESSION_ID_KEY);
    } catch (err) {
        console.warn('Failed clearing multiplayer prefs', err);
    }
    if (ws) {
        try { ws.close(); } catch (err) { /* ignore */ }
    }
    isServerAuthoritative = false;
    setConnectionStatus('Offline', 'warn');
    setTimeout(() => {
        window.location.reload();
    }, 150);
}

function connectWebSocket() {
    if (manualDisconnect) {
        console.warn('Manual disconnect set; skipping WS connect');
        return;
    }
    const backendUrl = activeBackendUrl || window.WOJAK_BACKEND_URL || '';
    if (!backendUrl) {
        console.warn('WOJAK_BACKEND_URL not set; skipping WS connect');
        return;
    }
    const session = activeSessionId || localStorage.getItem(SESSION_ID_KEY) || 'default';
    activeSessionId = session;
    isServerAuthoritative = true;
    ensureConnectionBanner();
    setConnectionStatus('Connecting...', 'warn');
    const playerId = localStorage.getItem('wojak_player_id') || `p_${Math.floor(Math.random() * 1e9).toString(36)}`;
    localStorage.setItem('wojak_player_id', playerId);
    clientPlayerId = playerId;
    const wsUrl = `${backendUrl.replace(/^http/, 'ws')}/ws?session=${encodeURIComponent(session)}&player=${encodeURIComponent(playerId)}`;
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
    try {
        ws = new WebSocket(wsUrl);
    } catch (err) {
        console.error('WS connect failed:', err);
        setConnectionStatus('WS connect failed', 'error');
        return;
    }
    ws.onopen = () => {
        console.log('WS connected');
        setConnectionStatus('Connected', 'ok');
    };
    ws.onclose = (evt) => {
        console.warn('WS closed, retrying in 2s', evt?.code, evt?.reason || '');
        setConnectionStatus('Reconnecting...', 'warn');
        if (!manualDisconnect) {
            setTimeout(connectWebSocket, 2000);
        } else {
            setConnectionStatus('Disconnected', 'warn');
        }
    };
    ws.onerror = (err) => {
        console.error('WS error', err);
        setConnectionStatus('Connection error', 'error');
    };
    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            handleServerMessage(msg);
        } catch (err) {
            console.error('Bad WS message', err);
        }
    };
}

function handleServerMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'snapshot') {
        hydrateFromSnapshot(msg);
        applyTicks(msg.ticks || []);
        setConnectionStatus('Synced', 'ok');
        return;
    }
    if (msg.type === 'resync') {
        if (msg.snapshot) {
            hydrateFromSnapshot({ ...msg.snapshot, player: msg.player, ticks: msg.ticks });
            applyTicks(msg.ticks || []);
        }
        setConnectionStatus('Resynced', 'ok');
        return;
    }
    if (msg.type === 'tick') {
        applyTick(msg);
        setConnectionStatus('Live', 'ok');
        return;
    }
    if (msg.type === 'command_result') {
        if (!msg.ok) {
            console.warn('Command failed', msg.error);
        }
        if (msg.ok && msg.data && msg.data.type === 'resync' && msg.data.snapshot) {
            hydrateFromSnapshot({ ...msg.data.snapshot, player: msg.player });
            applyTicks(msg.data.ticks || []);
            setConnectionStatus('Resynced', 'ok');
            if (netWorthChart) netWorthChart.update();
            return;
        }
        if (msg.player) {
            updatePlayerFromServer(msg.player);
        }
        updateNetWorth();
        updateDisplay();
        if (netWorthChart) netWorthChart.update();
        return;
    }
    if (msg.type === 'error') {
        console.warn('Server error', msg.error);
    }
}

function hydrateFromSnapshot(snapshot) {
    if (!snapshot || !snapshot.sim) return;
    if (isServerAuthoritative) {
        netWorthHistory.length = 0;
        serverTicks = new Set();
        latestServerPlayers = snapshot.players || [];
        playerNetWorthSeries.clear();
    }
    companies = (snapshot.sim.companies || []).map(c => ({
        id: c.id,
        name: c.name,
        marketCap: c.marketCap || 0,
        history: c.history || []
    }));
    serverPlayer = snapshot.player || null;
    if (snapshot.lastTick) {
        currentDate = new Date(snapshot.lastTick);
    }
    syncPortfolioFromServer();
    updateNetWorth();
    renderCompanies(true);
    updateDisplay();
    if (netWorthChart) netWorthChart.update();
    if (isServerAuthoritative) {
        const ts = snapshot.lastTick ? new Date(snapshot.lastTick).getTime() : Date.now();
        updateNetWorthSeriesFromPlayers(ts, latestServerPlayers);
        refreshNetWorthChartDatasets();
    }
}

function applyTick(tick) {
    if (!tick || !Array.isArray(tick.companies)) return;
    if (tick.seq && serverTicks.has(tick.seq)) return;
    if (tick.seq) {
        serverTicks.add(tick.seq);
        if (serverTicks.size > 500) {
            serverTicks = new Set(Array.from(serverTicks).slice(-250));
        }
    }
    const tickTs = tick.lastTick ? new Date(tick.lastTick).getTime() : Date.now();
    currentDate = new Date(tickTs);
    tick.companies.forEach(update => {
        const existing = companies.find(c => c.id === update.id);
        if (existing) {
            existing.marketCap = update.marketCap;
            if (Array.isArray(existing.history)) {
                existing.history.push({ x: tickTs, y: update.marketCap });
            }
        }
    });
    if (Array.isArray(tick.players) && tick.players.length) {
        const me = tick.players.find(p => (serverPlayer && p.id === serverPlayer.id) || (clientPlayerId && p.id === clientPlayerId)) || tick.players[0];
        if (me) updatePlayerFromServer(me);
        latestServerPlayers = tick.players;
        renderPlayerLeaderboard(tick.players);
        if (isServerAuthoritative) {
            updateNetWorthSeriesFromPlayers(tickTs, tick.players);
        }
    }
    updateNetWorth();
    renderCompanies();
    updateDisplay();
    if (isServerAuthoritative) {
        refreshNetWorthChartDatasets();
    } else if (netWorthChart) {
        netWorthChart.update();
    }
    if (companyDetailChart) companyDetailChart.update();
}

function applyTicks(ticks) {
    if (!Array.isArray(ticks)) return;
    ticks.forEach(applyTick);
}

function updatePlayerFromServer(playerSummary) {
    serverPlayer = playerSummary;
    if (isServerAuthoritative && serverPlayer) {
        if (typeof serverPlayer.cash === 'number') {
            cash = serverPlayer.cash;
        }
        if (typeof serverPlayer.debt === 'number') {
            totalBorrowed = serverPlayer.debt;
        }
        dripEnabled = !!serverPlayer.dripEnabled;
        if (dripToggle) {
            dripToggle.checked = dripEnabled;
        }
    }
    syncPortfolioFromServer();
    if (latestServerPlayers && latestServerPlayers.length) {
        renderPlayerLeaderboard(latestServerPlayers);
    }
}

function syncPortfolioFromServer() {
    if (!serverPlayer || !serverPlayer.holdings) return;
    const nextPortfolio = [];
    Object.entries(serverPlayer.holdings).forEach(([companyId, units]) => {
        if (!units || units <= 0) return;
        const company = companies.find(c => c.id === companyId);
        if (!company) return;
        nextPortfolio.push({ companyName: company.name, unitsOwned: units });
    });
    portfolio = nextPortfolio;
    renderPortfolio();
}

function sendCommand(cmd) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn('WS not ready; command skipped', cmd);
        return;
    }
    ws.send(JSON.stringify(cmd));
}
const companyRenderState = {
    lastRenderTs: 0,
    minInterval: 500,
    hoveredCompanyName: null,
    companyQueueCounter: 0
};

function ensureVentureSimulation(force = false) {
    if ((force || !ventureSim) && typeof VentureSimulation !== 'undefined' && ventureCompanies.length > 0) {
        const ventureOpts = matchRngFn ? { rng: matchRngFn, seed: matchSeed } : {};
        ventureSim = new VentureSimulation(ventureCompanies, currentDate, ventureOpts);
        window.ventureSim = ventureSim;
    }
}

async function loadCompaniesData() {
    try {
        initMatchContext();
        const [companiesResponse, ventureCompaniesResponse, macroEventsResponse] = await Promise.all([
            fetch('data/legacy-companies/companies.json'),
            fetch('data/legacy-companies/venture_companies.json'),
            fetch('data/macroEvents.json')
        ]);

        if (!companiesResponse.ok) { throw new Error(`HTTP error! status: ${companiesResponse.status} for companies.json`); }
        if (!ventureCompaniesResponse.ok) { throw new Error(`HTTP error! status: ${ventureCompaniesResponse.status} for venture_companies.json`); }

        const rawCompanies = await companiesResponse.json();
        ventureCompanies = await ventureCompaniesResponse.json();
        const macroEvents = macroEventsResponse.ok ? await macroEventsResponse.json() : [];
        if (!Array.isArray(ventureCompanies)) ventureCompanies = [];
        let filteredCompanies = []; // temporarily ignore legacy companies
        const presetOptions = matchRngFn ? { rng: matchRngFn } : {};
        const presetHardTechCompanies = await generateHardTechPresetCompanies(3, presetOptions);
        if (Array.isArray(presetHardTechCompanies)) {
            filteredCompanies.push(...presetHardTechCompanies);
        }
        const presetMegacorpCompanies = await generateSteadyMegacorpCompanies(2, presetOptions);
        if (Array.isArray(presetMegacorpCompanies)) {
            filteredCompanies.push(...presetMegacorpCompanies);
        }
        const productRotatorCompanies = await generateProductRotatorCompanies(2, presetOptions);
        if (Array.isArray(productRotatorCompanies)) {
            filteredCompanies.push(...productRotatorCompanies);
        }
        const presetVentureCompanies = await generateHypergrowthPresetCompanies(presetOptions);
        if (Array.isArray(presetVentureCompanies)) {
            ventureCompanies.push(...presetVentureCompanies);
        }
        const hardTechCompanies = generateBinaryHardTechCompanies(1, presetOptions);
        ventureCompanies.push(...hardTechCompanies);
        ensureVentureSimulation(true);
        const simOptions = matchRngFn ? { macroEvents, seed: matchSeed, rng: matchRngFn } : { macroEvents };
        return new Simulation(filteredCompanies, simOptions);
    } catch (error) {
        console.error("Could not load data:", error);
        alert("Failed to load game data. Please ensure JSON files are in the same directory and a local server is running.");
        return null;
    }
}

// --- Chart Objects ---
let netWorthChart, companyDetailChart, financialYoyChart;
let currentChartRange = 80; // Default to Max (20 years * 4 quarters)

// --- Formatting ---
const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
function formatLargeNumber(num, precision = 2) {
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    if (absNum >= 1e12) return `${sign}$${(absNum / 1e12).toFixed(precision)}T`;
    if (absNum >= 1e9) return `${sign}$${(absNum / 1e9).toFixed(precision)}B`;
    if (absNum >= 1e6) return `${sign}$${(absNum / 1e6).toFixed(precision)}M`;
    if (absNum >= 1e3) return `${sign}$${(absNum / 1e3).toFixed(1)}K`;
    return currencyFormatter.format(num);
}
function formatDate(date) { return date.toISOString().split('T')[0]; }


function updateDisplay() {
    let publicAssets = 0;
    portfolio.forEach(holding => {
        const company = companies.find(c => c.name === holding.companyName);
        if (company) {
            const value = company.marketCap * holding.unitsOwned;
            publicAssets += value;
        }
    });
    const privateAssets = ventureSim ? ventureSim.getPlayerHoldingsValue() : 0;
    const pendingCommitments = ventureSim ? ventureSim.getPendingCommitments() : 0;
    const equityValue = publicAssets + privateAssets + pendingCommitments;
    const localTotalAssets = cash + equityValue;

    const displayNetWorth = serverPlayer && typeof serverPlayer.netWorth === 'number'
        ? serverPlayer.netWorth
        : netWorth;
    const displayCash = serverPlayer && typeof serverPlayer.cash === 'number'
        ? serverPlayer.cash
        : Math.max(0, cash);
    const displayDebt = serverPlayer && typeof serverPlayer.debt === 'number'
        ? serverPlayer.debt
        : totalBorrowed;

    netWorthDisplay.textContent = currencyFormatter.format(displayNetWorth);
    netWorthDisplay.style.color = displayNetWorth >= 0 ? '#00c742' : '#dc3545';
    currentDateDisplay.textContent = formatDate(currentDate);

    // Update the single display line
    const commitmentsLabel = pendingCommitments > 0 ? ` | VC Commitments: ${currencyFormatter.format(pendingCommitments)}` : '';
    subFinancialDisplay.textContent = `Equities: ${currencyFormatter.format(publicAssets + privateAssets)}${commitmentsLabel} | Cash: ${currencyFormatter.format(displayCash)} | Liabilities: ${currencyFormatter.format(displayDebt)}`;

    if (netWorth < 0 && totalBorrowed > 0) {
        endGame("bankrupt");
    }
    updateMacroEventsDisplay();
}

function renderCompanies(force = false) {
    if (isServerAuthoritative && companies.length === 0) return;
    renderCompaniesUI({
        companies,
        companiesGrid,
        currentFilter,
        currentSort,
        formatLargeNumber,
        state: companyRenderState,
        force
    });
}

function renderPortfolio() {
    renderPortfolioUI({
        portfolio,
        companies,
        ventureSim,
        portfolioList,
        emptyPortfolioMsg,
        currencyFormatter
    });
}

function updateNetWorthSeriesFromPlayers(ts, players) {
    if (!isServerAuthoritative || !Array.isArray(players)) return;
    players.forEach(p => {
        const id = p.id || 'player';
        const nw = Number.isFinite(p.netWorth) ? p.netWorth : null;
        if (nw === null) return;
        if (!playerNetWorthSeries.has(id)) {
            playerNetWorthSeries.set(id, []);
        }
        const series = playerNetWorthSeries.get(id);
        const last = series[series.length - 1];
        if (last && last.x === ts) {
            last.y = nw;
        } else {
            series.push({ x: ts, y: nw });
        }
        if (series.length > 1000) {
            series.splice(0, series.length - 800);
        }
    });
}

function refreshNetWorthChartDatasets() {
    if (!netWorthChart) return;
    if (isServerAuthoritative) {
        const datasets = [];
        Array.from(playerNetWorthSeries.entries()).forEach(([id, data], idx) => {
            if (!Array.isArray(data) || data.length === 0) return;
            const sorted = [...data].sort((a, b) => a.x - b.x);
            datasets.push({
                label: id,
                data: sorted,
                borderColor: PLAYER_COLORS[idx % PLAYER_COLORS.length],
                backgroundColor: 'transparent',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
                fill: false,
                tension: 0.25,
                cubicInterpolationMode: 'monotone'
            });
        });
        if (datasets.length === 0) {
            datasets.push({
                label: 'Net Worth',
                data: netWorthHistory,
                borderColor: '#00c742',
                backgroundColor: 'transparent',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.25,
                fill: false,
                cubicInterpolationMode: 'monotone'
            });
        }
        netWorthChart.data.datasets = datasets;
        netWorthChart.update();
    } else {
        netWorthChart.data.datasets = [{
            label: 'Net Worth',
            data: netWorthHistory,
            borderColor: '#00c742',
            backgroundColor: 'rgba(0, 199, 66, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverBackgroundColor: '#00c742',
            pointHoverBorderWidth: 0,
            pointHoverRadius: 6,
            tension: 0.4,
            fill: true
        }];
        netWorthChart.update();
    }
}

function renderPlayerLeaderboard(players = []) {
    if (!playerLeaderboardEl || !connectedPlayersEl) return;
    if (!isServerAuthoritative || !Array.isArray(players) || players.length === 0) {
        connectedPlayersEl.style.display = 'none';
        playerLeaderboardEl.innerHTML = '';
        return;
    }
    const sorted = [...players].sort((a, b) => (b.netWorth || 0) - (a.netWorth || 0));
    const rows = sorted.map(p => {
        const net = currencyFormatter.format(p.netWorth || 0);
        const cashStr = currencyFormatter.format(p.cash || 0);
        return `
          <div class="portfolio-item" data-portfolio-type="public" data-portfolio-key="player-${p.id}">
              <div class="company-name">${p.id}</div>
              <div class="portfolio-info">
                  Net Worth: <span class="portfolio-value">${net}</span> | Cash: <span class="portfolio-value">${cashStr}</span>
              </div>
          </div>
        `;
    }).join('');
    playerLeaderboardEl.innerHTML = rows;
    connectedPlayersEl.style.display = 'block';
    if (connectedPlayersSessionEl && activeSessionId) {
        connectedPlayersSessionEl.textContent = `Session: ${activeSessionId}`;
    }
}

function updateMacroEventsDisplay() {
    if (!macroEventsDisplay) return;
    const events = (sim && typeof sim.getActiveMacroEvents === 'function') ? sim.getActiveMacroEvents() : [];
    if (!events || events.length === 0) {
        macroEventsDisplay.innerHTML = '';
        macroEventsDisplay.classList.remove('active');
        return;
    }
    macroEventsDisplay.classList.add('active');
    const html = events.map(evt => {
        const desc = evt.description ? evt.description.replace(/"/g, '&quot;') : '';
        return `<span class="macro-event-pill" title="${desc}">${evt.label}</span>`;
    }).join('');
    macroEventsDisplay.innerHTML = html;
}

// --- Utility: Parse user-entered currency/number strings ---
function parseUserAmount(input) {
    if (typeof input !== 'string') input = String(input);
    // Remove everything except digits, decimal point, and minus sign
    input = input.replace(/[^0-9.\-]/g, '');
    // Handle multiple decimals (keep only the first)
    const parts = input.split('.');
    if (parts.length > 2) input = parts[0] + '.' + parts.slice(1).join('');
    return parseFloat(input);
}

// --- Game Logic ---
function updateNetWorth() {
    if (serverPlayer && isServerAuthoritative) {
        netWorth = serverPlayer.netWorth || netWorth;
    } else {
        let totalHoldingsValue = portfolio.reduce((sum, holding) => {
            const company = companies.find(c => c.name === holding.companyName);
            return sum + (company ? company.marketCap * holding.unitsOwned : 0);
        }, 0);
        const ventureHoldingsValue = ventureSim ? ventureSim.getPlayerHoldingsValue() : 0;
        const pendingCommitments = ventureSim ? ventureSim.getPendingCommitments() : 0;
        netWorth = cash + totalHoldingsValue + ventureHoldingsValue + pendingCommitments - totalBorrowed;
    }
    netWorthHistory.push({ x: currentDate.getTime(), y: netWorth });
    if (netWorthHistory.length > 2000) netWorthHistory.shift();

    if (netWorth > netWorthAth) {
        netWorthAth = netWorth;
        lastDrawdownTriggerAth = 0;
    }
    const drawdown = netWorthAth > 0 ? (netWorthAth - netWorth) / netWorthAth : 0;
    if (drawdown >= 0.4 && netWorthAth > 0 && lastDrawdownTriggerAth !== netWorthAth) {
        lastDrawdownTriggerAth = netWorthAth;
        if (wojakManager) {
            wojakManager.triggerMalding(netWorthAth, drawdown);
        }
    }
    if (wojakManager) {
        wojakManager.handleRecovery(netWorth);
    }

    if (netWorth >= 1000000 && !isMillionaire) {
        isMillionaire = true;
        if (wojakManager) {
            wojakManager.setBaseImage('wojaks/suit-wojak.png', true);
        }
        jsConfetti.addConfetti({ emojis: ['💰', '💵'], confettiNumber: 150, emojiSize: 30, });
    }
    if (netWorth >= 1000000000 && !isBillionaire) {
        isBillionaire = true;
        if (wojakManager) {
            wojakManager.setBaseImage('wojaks/red-suit-wojak.png', true);
        }
        jsConfetti.addConfetti({ emojis: ['💎', '📀'], confettiNumber: 40, emojiSize: 40, });
    }
    if (netWorth >= 1000000000000 && !isTrillionaire) {
        isTrillionaire = true;
        if (wojakManager) {
            wojakManager.setBaseImage('wojaks/purple-suit-wojak.png', true);
        }
        jsConfetti.addConfetti({ emojis: ['🌌', '🥇', '🔮'], confettiNumber: 100, emojiSize: 30, });
        setTimeout(() => { jsConfetti.addConfetti({ emojis: ['🌌', '🥇', '🔮'], confettiNumber: 100, emojiSize: 30, }); }, 1000);
        setTimeout(() => { jsConfetti.addConfetti({ emojis: ['🌌', '🥇', '🔮'], confettiNumber: 100, emojiSize: 30, }); }, 2000);
    }

    if (netWorth >= 5000000) {
        vcBtn.disabled = false;
        vcBtn.parentElement.classList.remove('disabled');
        ensureVentureSimulation();

    } else {
        vcBtn.disabled = true;
        vcBtn.parentElement.classList.add('disabled');
    }
}

function calculateInterest() {
    if (totalBorrowed <= 0) return 0;
    const daysSinceLastInterest = (currentDate - lastInterestDate) / (1000 * 60 * 60 * 24);
    const dailyRate = ANNUAL_INTEREST_RATE / 365.25;
    return totalBorrowed * dailyRate * daysSinceLastInterest;
}

function chargeInterest() {
    const interest = calculateInterest();
    if (interest > 0) {
        cash -= interest;
        lastInterestDate = new Date(currentDate);
    }
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function convertVentureCompanyToPublic(event) {
    if (!sim || !ventureSim || !event) return;
    const ipoDate = new Date(currentDate);
    let ventureCompany = null;
    if (event.companyRef) {
        ventureCompany = event.companyRef;
        if (typeof ventureSim.extractCompany === 'function') {
            ventureSim.extractCompany(event.companyId);
        }
    } else if (typeof ventureSim.extractCompany === 'function') {
        ventureCompany = ventureSim.extractCompany(event.companyId);
    }
    if (!ventureCompany && typeof ventureSim.getCompanyById === 'function') {
        ventureCompany = ventureSim.getCompanyById(event.companyId);
    }
    if (!ventureCompany) return;

    if (typeof sim.adoptVentureCompany === 'function') {
        sim.adoptVentureCompany(ventureCompany, ipoDate);
    }

    const unitsOwned = event.playerEquity || 0;
    if (unitsOwned > 0) {
        const targetName = ventureCompany.name;
        const existing = portfolio.find(h => h.companyName === targetName);
        if (existing) {
            existing.unitsOwned += unitsOwned;
        } else {
            portfolio.push({ companyName: targetName, unitsOwned: unitsOwned });
        }
        renderPortfolio();
    }
}

function removeVentureSpinoutFromMarket(name) {
    if (!name || !Array.isArray(companies)) return;
    let removed = false;
    for (let i = companies.length - 1; i >= 0; i--) {
        const entry = companies[i];
        if (entry && entry.fromVenture && entry.name === name) {
            companies.splice(i, 1);
            removed = true;
        }
    }
    if (removed && sim && Array.isArray(sim.companies) && sim.companies !== companies) {
        for (let i = sim.companies.length - 1; i >= 0; i--) {
            const entry = sim.companies[i];
            if (entry && entry.fromVenture && entry.name === name) {
                sim.companies.splice(i, 1);
            }
        }
    }
}

function handleVentureEvents(events) {
    if (!events || events.length === 0) return;
    let needsRefresh = false;
    events.forEach(event => {
        if (event.type === 'venture_ipo') {
            convertVentureCompanyToPublic(event);
            needsRefresh = true;
        } else if (event.type === 'venture_failed') {
            if (event.refund && event.refund > 0) {
                cash += event.refund;
            }
            removeVentureSpinoutFromMarket(event.name);
            needsRefresh = true;
        } else if (event.type === 'venture_round_failed') {
            if (event.refund && event.refund > 0) {
                cash += event.refund;
            }
            needsRefresh = true;
        }
    });

    if (needsRefresh) {
        if (typeof refreshVentureCompaniesList === 'function' && document.body.classList.contains('vc-active')) {
            refreshVentureCompaniesList();
        }
        if (typeof refreshVentureDetailView === 'function' && document.body.classList.contains('vc-detail-active')) {
            refreshVentureDetailView();
        }
        updateNetWorth();
        updateDisplay();
        renderPortfolio();
        if (netWorthChart) { netWorthChart.update(); }
    }
}

function getMaxBorrowing() {
    const debt = isServerAuthoritative && serverPlayer ? serverPlayer.debt : totalBorrowed;
    const netWorthVal = isServerAuthoritative && serverPlayer ? serverPlayer.netWorth : netWorth;
    return Math.max(0, netWorthVal * 5 - debt);
}

function borrow(amount) {
    amount = parseUserAmount(amount);
    if (isNaN(amount) || amount <= 0) { alert("Please enter a valid amount to borrow."); return; }
    if (ws && ws.readyState === WebSocket.OPEN) {
        sendCommand({ type: 'borrow', amount });
        return;
    }
    const maxBorrowing = getMaxBorrowing();
    if (amount > maxBorrowing) { alert(`You can only borrow up to ${currencyFormatter.format(maxBorrowing)}.`); return; }
    totalBorrowed += amount;
    cash += amount;
    lastInterestDate = new Date(currentDate); // Reset interest timer on borrow
    updateNetWorth(); updateDisplay(); updateBankingDisplay(); bankingAmountInput.value = '';
}

function repay(amount) {
    amount = parseUserAmount(amount);
    if (isNaN(amount) || amount <= 0) { alert("Please enter a valid amount to repay."); return; }
    if (ws && ws.readyState === WebSocket.OPEN) {
        sendCommand({ type: 'repay', amount });
        return;
    }
    if (amount > totalBorrowed) { alert(`You only owe ${currencyFormatter.format(totalBorrowed)}.`); return; }
    if (amount > cash) { alert("You don't have enough cash to repay this amount."); return; }
    totalBorrowed -= amount;
    cash -= amount;
    lastInterestDate = new Date(currentDate); // Reset interest timer on repay
    updateNetWorth(); updateDisplay(); updateBankingDisplay(); bankingAmountInput.value = '';
}

function updateBankingDisplay() {
    const maxBorrowing = getMaxBorrowing();
    const displayCash = isServerAuthoritative && serverPlayer ? serverPlayer.cash : cash;
    const displayDebt = isServerAuthoritative && serverPlayer ? serverPlayer.debt : totalBorrowed;
    bankingCashDisplay.textContent = currencyFormatter.format(displayCash);
    bankingCashDisplay.className = `stat-value ${displayCash >= 0 ? 'positive' : 'negative'}`;
    let totalAssets = displayCash;
    portfolio.forEach(holding => {
        const company = companies.find(c => c.name === holding.companyName);
        if (company) { totalAssets += company.marketCap * holding.unitsOwned; }
    });
    const privateAssets = ventureSim ? ventureSim.getPlayerHoldingsValue() : 0;
    const pendingCommitments = ventureSim ? ventureSim.getPendingCommitments() : 0;
    totalAssets += privateAssets + pendingCommitments;
    if (isServerAuthoritative && serverPlayer) {
        totalAssets = serverPlayer.netWorth + serverPlayer.debt;
    }
    bankingNetWorthDisplay.textContent = currencyFormatter.format(totalAssets);
    bankingNetWorthDisplay.className = `stat-value positive`;
    currentDebtDisplay.textContent = currencyFormatter.format(displayDebt);
    currentDebtDisplay.className = `stat-value ${displayDebt > 0 ? 'negative' : 'positive'}`;
    maxBorrowDisplay.textContent = currencyFormatter.format(maxBorrowing);
}

function showBankingModal() { updateBankingDisplay(); bankingModal.classList.add('active'); }
function hideBankingModal() { bankingModal.classList.remove('active'); bankingAmountInput.value = ''; }

function endGame(reason) {
    pauseGame();
    let message = "";
    if (reason === "bankrupt") { message = "GAME OVER! You went bankrupt!"; }
    else if (reason === "timeline_end") { message = `Game Over! You reached ${GAME_END_YEAR}.`; }
    alert(`${message}\nFinal Net Worth: ${currencyFormatter.format(netWorth)}`);
    if (confirm("Play again?")) { location.reload(); }
}

function gameLoop() {
    if (isServerAuthoritative) return;
    if (!isGameReady) return;

    if (currentDate.getFullYear() >= GAME_END_YEAR) { endGame("timeline_end"); return; }
    currentDate.setDate(currentDate.getDate() + sim.dtDays);

    const companiesBefore = sim.companies.length;
    sim.tick(currentDate);
    const companiesAfter = sim.companies.length;

    const ventureEvents = ventureSim ? ventureSim.tick(currentDate) : [];
    if (ventureEvents.length > 0) {
        handleVentureEvents(ventureEvents);
    }
    const stagesChanged = ventureSim ? ventureSim.consumeStageUpdates() : false;
    if (stagesChanged) {
        if (typeof refreshVentureCompaniesList === 'function' && document.body.classList.contains('vc-active')) {
            refreshVentureCompaniesList();
        }
        if (typeof refreshVentureDetailView === 'function' && document.body.classList.contains('vc-detail-active')) {
            refreshVentureDetailView();
        }
        renderPortfolio();
    } else if (typeof refreshVentureDetailView === 'function' && document.body.classList.contains('vc-detail-active')) {
        refreshVentureDetailView();
    }

    // --- Dividend payout to player (quarterly events) ---
    const dividendEventsMap = new Map();
    companies.forEach(company => {
        if (!company || typeof company.drainDividendEvents !== 'function') return;
        const events = company.drainDividendEvents();
        if (events && events.length) {
            dividendEventsMap.set(company.name, events);
        }
    });

    if (dividendEventsMap.size > 0 && portfolio.length > 0) {
        portfolio.forEach(holding => {
            const events = dividendEventsMap.get(holding.companyName);
            if (!events || !events.length) return;
            events.forEach(evt => {
                const playerShare = holding.unitsOwned * evt.amount;
                if (playerShare <= 0) return;
                if (dripEnabled) {
                    const company = companies.find(c => c.name === holding.companyName);
                    if (!company || company.marketCap <= 0) return;
                    const units = playerShare / company.marketCap;
                    holding.unitsOwned += units;
                } else {
                    cash += playerShare;
                }
            });
        });
    }
    // --- End dividend payout ---

    // If a new company IPO'd, re-render the entire grid
    if (companiesAfter > companiesBefore) {
        companies = sim.companies; // Update the global list
        renderCompanies(true); // Force a full re-render when new companies list changes
    } else {
        renderCompanies(); // Otherwise, re-render (throttled) to keep ordering accurate
    }

    if (activeCompanyDetail && (activeCompanyDetail.newAnnualData || activeCompanyDetail.newQuarterlyData)) {
        renderCompanyFinancialHistory(activeCompanyDetail);
        activeCompanyDetail.newAnnualData = false;
        activeCompanyDetail.newQuarterlyData = false;
    }

    chargeInterest();
    updateNetWorth();
    updateDisplay();
    renderPortfolio();
    netWorthChart.update();
    if (companyDetailChart) companyDetailChart.update();

    if (activeCompanyDetail) {
        updateInvestmentPanelStats(activeCompanyDetail);

        if (activeCompanyDetail.hasPipelineUpdate) {
            updatePipelineDisplay(activeCompanyDetail);
            activeCompanyDetail.hasPipelineUpdate = false;
        }
    }
}

function buy(companyName, amount) {
    amount = parseUserAmount(amount);
    if (isNaN(amount) || amount <= 0) { alert("Invalid amount."); return; }
    const company = companies.find(c => c.name === companyName);
    if (!company) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
        sendCommand({ type: 'buy', companyId: company.id, amount });
        return;
    }
    if (amount > cash) { alert("Insufficient cash for this purchase."); return; }
    if (company.marketCap < 0.0001) { alert("This company's valuation is too low to purchase right now."); return; }
    cash -= amount;
    const unitsToBuy = amount / company.marketCap;
    let holding = portfolio.find(h => h.companyName === companyName);
    if (holding) { holding.unitsOwned += unitsToBuy; }
    else { portfolio.push({ companyName: companyName, unitsOwned: unitsToBuy }); }
    updateNetWorth(); updateDisplay(); renderPortfolio(); updateInvestmentPanel(company);
}

function sell(companyName, amount) {
    amount = parseFloat(amount);
    if (isNaN(amount) || amount <= 0) { alert("Invalid amount."); return; }
    const company = companies.find(c => c.name === companyName);
    const holding = portfolio.find(h => h.companyName === companyName);
    if (!company || !holding) { alert("You don't own this stock."); return; }
    if (ws && ws.readyState === WebSocket.OPEN) {
        sendCommand({ type: 'sell', companyId: company.id, amount });
        return;
    }
    const currentValue = company.marketCap * holding.unitsOwned;
    if (amount > currentValue) { alert("You cannot sell more than you own."); return; }
    cash += amount;
    const unitsToSell = (amount / currentValue) * holding.unitsOwned;
    holding.unitsOwned -= unitsToSell;
    if (holding.unitsOwned < 1e-9) {
        portfolio = portfolio.filter(h => h.companyName !== companyName);
    }
    updateNetWorth(); updateDisplay(); renderPortfolio(); updateInvestmentPanel(company);
}

function leadVentureRound(companyId) {
    ensureVentureSimulation();
    if (!ventureSim) {
        return { success: false, reason: 'Venture market unavailable.' };
    }
    const detail = ventureSim.getCompanyDetail(companyId);
    if (!detail) {
        return { success: false, reason: 'Company not found.' };
    }
    if (!detail.round) {
        return { success: false, reason: 'No active fundraising round.' };
    }
    const requiredAmount = detail.round.raiseAmount;
    if (requiredAmount > cash) {
        return { success: false, reason: "Insufficient cash to lead this round." };
    }

    const result = ventureSim.leadRound(companyId);
    if (!result.success) {
        return result;
    }

    cash -= requiredAmount;
    updateNetWorth();
    updateDisplay();
    if (netWorthChart) { netWorthChart.update(); }
    renderPortfolio();

    if (typeof refreshVentureCompaniesList === 'function' && document.body.classList.contains('vc-active')) {
        refreshVentureCompaniesList();
    }
    if (typeof refreshVentureDetailView === 'function' && document.body.classList.contains('vc-detail-active')) {
        refreshVentureDetailView();
    }

    return {
        success: true,
        invested: requiredAmount,
        stageLabel: result.stageLabel,
        equityOffered: result.equityOffered
    };
}

function getCompanyTooltipHandler(context) {
    // Tooltip Element
    let tooltipEl = document.getElementById('chartjs-tooltip-company');

    // Create element on first render
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'chartjs-tooltip-company';
        tooltipEl.style.opacity = 1;
        tooltipEl.style.pointerEvents = 'none';
        tooltipEl.style.position = 'absolute';
        tooltipEl.style.transform = 'translate(-50%, 0)';
        tooltipEl.style.transition = 'all .1s ease';
        tooltipEl.style.backgroundColor = '#ffffff';
        tooltipEl.style.borderRadius = '6px';
        tooltipEl.style.color = '#1e293b';
        tooltipEl.style.padding = '8px';
        tooltipEl.style.fontFamily = 'Inter, sans-serif';
        tooltipEl.style.fontSize = '14px';
        tooltipEl.style.whiteSpace = 'nowrap';
        tooltipEl.style.zIndex = '100';
        tooltipEl.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
        document.body.appendChild(tooltipEl);
    }

    // Hide if no tooltip
    const tooltipModel = context.tooltip;
    if (tooltipModel.opacity === 0) {
        tooltipEl.style.opacity = 0;
        return;
    }

    // Set Text
    if (tooltipModel.body) {
        const date = new Date(context.chart.data.datasets[0].data[tooltipModel.dataPoints[0].dataIndex].x);
        const dateStr = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        const rawValue = tooltipModel.dataPoints[0].raw.y;
        const valueStr = formatLargeNumber(rawValue);

        const innerHtml = `
            <div style="margin-bottom: 4px; color: #1e293b; display: flex; align-items: center; gap: 4px;">
                <span style="font-weight: 600;">Date:</span>
                <span>${dateStr}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
                <span style="color: #1e293b; font-weight: 600;">Market Cap:</span>
                <span style="color: #3b82f6;">${valueStr}</span>
            </div>
        `;

        tooltipEl.innerHTML = innerHtml;
    }

    const position = context.chart.canvas.getBoundingClientRect();
    const bodyFont = Chart.defaults.font;

    // Display, position, and set styles for font
    tooltipEl.style.opacity = 1;
    tooltipEl.style.position = 'absolute';
    tooltipEl.style.left = position.left + window.pageXOffset + tooltipModel.caretX + 'px';
    tooltipEl.style.top = position.top + window.pageYOffset + tooltipModel.caretY + 'px';
    tooltipEl.style.font = bodyFont.string;
    tooltipEl.style.padding = tooltipModel.padding + 'px ' + tooltipModel.padding + 'px';
    tooltipEl.style.pointerEvents = 'none';
}

function destroyFinancialYoyChart() {
    if (financialYoyChart) {
        financialYoyChart.destroy();
        financialYoyChart = null;
    }
}

function renderCompanyFinancialHistory(company) {
    const container = document.getElementById('financialHistoryContainer');
    if (!container || !company) return;
    company.newAnnualData = false;
    company.newQuarterlyData = false;

    // Ensure structure exists
    let chartWrapper = container.querySelector('.financial-yoy-chart');
    let tableWrapper = container.querySelector('.financial-table-wrapper');

    if (!chartWrapper) {
        container.innerHTML = ''; // Clear any old content if structure is missing

        // Header is now part of controls, so we don't add it separately here

        chartWrapper = document.createElement('div');
        chartWrapper.className = 'financial-yoy-chart';
        chartWrapper.style.height = '200px';
        chartWrapper.style.marginBottom = '20px';
        const canvas = document.createElement('canvas');
        canvas.id = 'financialYoyChart';
        chartWrapper.appendChild(canvas);
        container.appendChild(chartWrapper);
    }

    if (!tableWrapper) {
        tableWrapper = document.createElement('div');
        tableWrapper.className = 'financial-table-wrapper';
        container.appendChild(tableWrapper);
    }

    // Ensure controls exist
    let controlsWrapper = container.querySelector('.chart-controls');
    if (!controlsWrapper) {
        controlsWrapper = document.createElement('div');
        controlsWrapper.className = 'chart-controls';
        controlsWrapper.style.display = 'flex';
        controlsWrapper.style.justifyContent = 'space-between'; // Changed to space-between
        controlsWrapper.style.alignItems = 'center'; // Align items vertically
        controlsWrapper.style.marginBottom = '5px';

        // Add Title
        const title = document.createElement('h3');
        title.textContent = 'Financial Data';
        title.style.margin = '0';
        title.style.color = '#333';
        controlsWrapper.appendChild(title);

        // Button Container
        const btnContainer = document.createElement('div');
        btnContainer.style.display = 'flex';
        btnContainer.style.gap = '5px';

        const ranges = [
            { label: '5Y', value: 20 },
            { label: '10Y', value: 40 },
            { label: '20Y', value: 80 },
            { label: 'Max', value: 0 }
        ];

        ranges.forEach(range => {
            const btn = document.createElement('button');
            btn.textContent = range.label;
            btn.className = 'chart-range-btn';
            btn.dataset.value = range.value;
            btn.style.padding = '2px 8px';
            btn.style.fontSize = '12px';
            btn.style.cursor = 'pointer';
            btn.style.border = '1px solid #ccc';
            btn.style.borderRadius = '4px';
            btn.style.backgroundColor = currentChartRange === range.value ? '#e0e0e0' : '#fff';

            btn.onclick = () => {
                currentChartRange = range.value;
                // Update active state
                controlsWrapper.querySelectorAll('.chart-range-btn').forEach(b => {
                    b.style.backgroundColor = parseInt(b.dataset.value) === currentChartRange ? '#e0e0e0' : '#fff';
                });
                renderCompanyFinancialHistory(company);
            };
            btnContainer.appendChild(btn);
        });

        controlsWrapper.appendChild(btnContainer);

        // Insert before chart wrapper
        container.insertBefore(controlsWrapper, chartWrapper);
    } else {
        // Update active state just in case
        controlsWrapper.querySelectorAll('.chart-range-btn').forEach(b => {
            b.style.backgroundColor = parseInt(b.dataset.value) === currentChartRange ? '#e0e0e0' : '#fff';
        });
    }

    const yoySeries = typeof company.getYoySeries === 'function'
        ? company.getYoySeries(currentChartRange)
        : [];

    if (yoySeries.length === 0) {
        if (financialYoyChart) {
            financialYoyChart.destroy();
            financialYoyChart = null;
        }
        // Removed "Waiting for financial data..." text as requested
        chartWrapper.innerHTML = '';
    } else {
        // Ensure canvas exists if we came from empty state
        let canvas = chartWrapper.querySelector('canvas');
        if (!canvas) {
            chartWrapper.innerHTML = '';
            canvas = document.createElement('canvas');
            canvas.id = 'financialYoyChart';
            chartWrapper.appendChild(canvas);
        }

        const labels = yoySeries.map(item => {
            if (item.label) return item.label;
            if (typeof item.quarter === 'number') return `${item.year} Q${item.quarter}`;
            return item.year;
        });
        const revenueData = yoySeries.map(item => item.revenue);
        const profitData = yoySeries.map(item => item.profit);
        const profitColors = profitData.map(value => value >= 0 ? '#6de38a' : '#ff5b5b');

        // Pad with empty data if few points to prevent "beeg spacing"
        const minPoints = 20;
        if (labels.length < minPoints) {
            const missing = minPoints - labels.length;
            for (let i = 0; i < missing; i++) {
                labels.push('');
                revenueData.push(null);
                profitData.push(null);
                profitColors.push(null);
            }
        }

        if (financialYoyChart) {
            financialYoyChart.data.labels = labels;
            financialYoyChart.data.datasets[0].data = revenueData;
            financialYoyChart.data.datasets[1].data = profitData;
            financialYoyChart.data.datasets[1].backgroundColor = profitColors;

            // Ensure options are updated for interaction mode
            financialYoyChart.options.interaction = {
                mode: 'index',
                intersect: false,
            };
            financialYoyChart.update();
        } else {
            financialYoyChart = new Chart(canvas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Revenue (Trailing 12 Months)',
                            data: revenueData,
                            backgroundColor: '#635bff',
                            borderRadius: 4,
                            categoryPercentage: 0.8,
                            barPercentage: 0.9,
                            grouped: false,
                            order: 1,
                            maxBarThickness: 50
                        },
                        {
                            label: 'Profit (Trailing 12 Months)',
                            data: profitData,
                            backgroundColor: profitColors,
                            borderRadius: 4,
                            categoryPercentage: 0.8,
                            barPercentage: 0.9,
                            grouped: false,
                            order: 0,
                            maxBarThickness: 50
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 0 },
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    scales: {
                        x: {
                            grid: { display: false }
                        },
                        y: {
                            grid: { color: 'rgba(148, 163, 184, 0.25)' },
                            ticks: {
                                callback: value => formatLargeNumber(value)
                            }
                        }
                    },
                    plugins: {
                        legend: { display: true, position: 'top', reverse: true },
                        tooltip: {
                            filter: (tooltipItem) => {
                                const val = tooltipItem.parsed.y;
                                return val !== null && val !== undefined && !isNaN(val);
                            },
                            callbacks: {
                                label: context => {
                                    const val = context.parsed.y ?? context.parsed;
                                    if (val === null || val === undefined || isNaN(val)) return null;
                                    const label = context.dataset.label.replace(' (Trailing 12 Months)', '');
                                    return `${label}: ${formatLargeNumber(val, 2)}`;
                                }
                            },
                            itemSort: (a, b) => a.datasetIndex - b.datasetIndex
                        }
                    }
                }
            });
        }
    }

    const tableHtml = typeof company.getFinancialTableHTML === 'function'
        ? company.getFinancialTableHTML()
        : '<div class="financial-placeholder">Financial details unavailable.</div>';
    tableWrapper.innerHTML = tableHtml;
}

function updateInvestmentPanelStats(company) {
    const displayCash = isServerAuthoritative && serverPlayer ? serverPlayer.cash : cash;
    playerCashDisplay.textContent = currencyFormatter.format(displayCash);
    const holding = portfolio.find(h => h.companyName === company.name);
    let stakeValue = 0;
    if (holding) { stakeValue = company.marketCap * holding.unitsOwned; }
    playerStakeDisplay.textContent = currencyFormatter.format(stakeValue);
}

function updateInvestmentPanel(company) {
    updateInvestmentPanelStats(company);
    const disabled = !!company.bankrupt;
    [buyBtn, sellBtn, buyMaxBtn, sellMaxBtn].forEach(btn => {
        if (btn) btn.disabled = disabled;
    });
    if (investmentAmountInput) {
        investmentAmountInput.disabled = disabled;
        if (!disabled) investmentAmountInput.value = '';
    }
}

function showCompanyDetail(company) {
    activeCompanyDetail = company;
    bodyEl.classList.add('detail-active');
    document.getElementById('detailCompanyName').textContent = company.name;
    document.getElementById('detailCompanySector').textContent = company.bankrupt ? 'Status: Bankrupt' : company.sector;
    updateInvestmentPanel(company);
    const ctx = document.getElementById('companyDetailChart').getContext('2d');
    if (companyDetailChart) { companyDetailChart.destroy(); }
    const history = Array.isArray(company.history)
        ? [...company.history].filter(p => p && Number.isFinite(p.y) && typeof p.x !== 'undefined').sort((a, b) => (a.x || 0) - (b.x || 0))
        : [];
    companyDetailChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Market Cap',
                data: history,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverBackgroundColor: '#3b82f6',
                pointHoverBorderWidth: 0,
                pointHoverRadius: 6,
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: false,
                    external: getCompanyTooltipHandler,
                    mode: 'index',
                    intersect: false,
                }
            },
            scales: {
                x: { type: 'time', time: { unit: 'year' } },
                y: { ticks: { callback: value => formatLargeNumber(value) } }
            }
        }
    });
    document.getElementById('financialHistoryContainer').innerHTML = '';
    renderCompanyFinancialHistory(company);
    updatePipelineDisplay(company); // Draw pipeline on view
}

function hideCompanyDetail() {
    activeCompanyDetail = null;
    bodyEl.classList.remove('detail-active');
    if (companyDetailChart) { companyDetailChart.destroy(); companyDetailChart = null; }
    destroyFinancialYoyChart();
}

function pauseGame() {
    if (isPaused) return;
    isPaused = true;
    clearInterval(gameInterval);
}

function resumeGame() {
    if (!isPaused) return;
    isPaused = false;
    wasAutoPaused = false;
    const targetSpeed = currentSpeed > 0 ? currentSpeed : 1;
    setGameSpeed(targetSpeed);
}

function setGameSpeed(speed) {
    const clampedSpeed = Math.max(0, speed);
    const wasPaused = isPaused;
    currentSpeed = clampedSpeed;
    if (isServerAuthoritative) {
        if (gameInterval) {
            clearInterval(gameInterval);
            gameInterval = null;
        }
        isPaused = clampedSpeed <= 0;
        updateSpeedThumbLabel();
        return;
    }
    if (clampedSpeed <= 0) {
        clearInterval(gameInterval);
        isPaused = true;
    } else {
        clearInterval(gameInterval);
        gameInterval = setInterval(gameLoop, 400 / clampedSpeed);
        isPaused = false;
    }
    if (speedSlider) {
        const idx = SPEED_STEPS.findIndex(step => step === clampedSpeed);
        speedSlider.value = idx >= 0 ? idx : 2;
    }
    updateSpeedThumbLabel();
}

// --- Event Listeners ---
companiesGrid.addEventListener('click', (event) => {
    const companyBox = event.target.closest('.company-box');
    if (!companyBox) return;
    const companyName = companyBox.dataset.companyName;
    const company = companies.find(c => c.name === companyName);
    if (company) showCompanyDetail(company);
});
backBtn.addEventListener('click', hideCompanyDetail);
buyBtn.addEventListener('click', () => { if (activeCompanyDetail) buy(activeCompanyDetail.name, investmentAmountInput.value); });
sellBtn.addEventListener('click', () => { if (activeCompanyDetail) sell(activeCompanyDetail.name, investmentAmountInput.value); });

// Buy Max: buy as much as possible with available cash
buyMaxBtn.addEventListener('click', () => {
    if (activeCompanyDetail) {
        const company = activeCompanyDetail;
        if (company.marketCap > 0.0001) {
            const availableCash = (isServerAuthoritative && serverPlayer) ? serverPlayer.cash : cash;
            buy(company.name, availableCash);
        } else {
            alert("This company's valuation is too low to purchase right now.");
        }
    }
});
// Sell Max: sell all holdings in this company
sellMaxBtn.addEventListener('click', () => {
    if (activeCompanyDetail) {
        const company = activeCompanyDetail;
        const holding = portfolio.find(h => h.companyName === company.name);
        if (holding && holding.unitsOwned > 0) {
            const currentValue = company.marketCap * holding.unitsOwned;
            sell(company.name, currentValue);
        } else {
            alert("You don't own any shares of this company.");
        }
    }
});

if (speedSlider) {
    speedSlider.addEventListener('input', (event) => {
        const idx = Number(event.target.value) || 0;
        const clampedIdx = Math.max(0, Math.min(SPEED_STEPS.length - 1, idx));
        const nextSpeed = SPEED_STEPS[clampedIdx] ?? 1;
        setGameSpeed(nextSpeed);
    });
    if (typeof speedSlider.value === 'string') {
        const initialIdx = SPEED_STEPS.indexOf(currentSpeed);
        speedSlider.value = `${initialIdx >= 0 ? initialIdx : 2}`;
    }
    updateSpeedThumbLabel();
}

function updateSpeedThumbLabel() {
    if (!speedSlider || !speedThumbLabel) return;
    const idx = SPEED_STEPS.indexOf(currentSpeed);
    const sliderMin = Number(speedSlider.min) || 0;
    const sliderMax = Number(speedSlider.max) || Math.max(SPEED_STEPS.length - 1, 1);
    const val = idx >= 0 ? idx : 1;
    const ratio = (val - sliderMin) / Math.max(1, sliderMax - sliderMin);
    const trackWidth = speedSlider.clientWidth || 0;
  const thumbWidth = 16; // approximate thumb width
  const pos = ratio * Math.max(0, trackWidth - thumbWidth) + thumbWidth / 2;
  speedThumbLabel.style.left = `${pos}px`;
  speedThumbLabel.textContent = currentSpeed <= 0 ? 'Paused' : `${currentSpeed}x Speed`;
}

window.addEventListener('resize', () => {
    updateSpeedThumbLabel();
});



portfolioList.addEventListener('click', (event) => {
    const portfolioItem = event.target.closest('.portfolio-item');
    if (!portfolioItem) return;
    const type = portfolioItem.dataset.portfolioType || 'public';
    if (type === 'public') {
        const companyName = portfolioItem.querySelector('.company-name').textContent;
        const company = companies.find(c => c.name === companyName);
        if (company) showCompanyDetail(company);
    } else if (type === 'private') {
        const ventureId = portfolioItem.dataset.ventureId;
        if (ventureId && typeof showVentureCompanyDetail === 'function') {
            showVentureCompanyDetail(ventureId);
        }
    }
});

const maxBorrowBtn = document.getElementById('maxBorrowBtn');
const maxRepayBtn = document.getElementById('maxRepayBtn');

bankBtn.addEventListener('click', showBankingModal);
closeBankingBtn.addEventListener('click', hideBankingModal);
bankingModal.addEventListener('click', (event) => {
    if (event.target === bankingModal) hideBankingModal();
});
borrowBtn.addEventListener('click', () => borrow(bankingAmountInput.value));
repayBtn.addEventListener('click', () => repay(bankingAmountInput.value));

// Max Borrow Logic
maxBorrowBtn.addEventListener('click', () => {
    const max = getMaxBorrowing();
    if (max > 0) {
        borrow(max);
    } else {
        alert("You cannot borrow any more funds right now.");
    }
});

// Max Repay Logic
maxRepayBtn.addEventListener('click', () => {
    const debt = isServerAuthoritative && serverPlayer ? serverPlayer.debt : totalBorrowed;
    const availableCash = isServerAuthoritative && serverPlayer ? serverPlayer.cash : cash;
    const amount = Math.min(debt, availableCash);
    if (amount > 0) {
        repay(amount);
    } else {
        alert("You have no debt to repay or no cash available.");
    }
});

bankingAmountInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter' && event.target === bankingAmountInput) {
        const amount = bankingAmountInput.value;
        if (amount) borrow(amount);
    }
});

vcBtn.addEventListener('click', () => {
    bodyEl.classList.add('vc-active');
    ensureVentureSimulation();
    const summaries = typeof getVentureCompanySummaries === 'function' ? getVentureCompanySummaries() : ventureCompanies;
    renderVentureCompanies(
        summaries,
        formatLargeNumber,
        formatLargeNumber
    );
});

backToMainBtn.addEventListener('click', () => {
    if (typeof hideVentureCompanyDetail === 'function') {
        hideVentureCompanyDetail();
    }
    bodyEl.classList.remove('vc-active');
    bodyEl.classList.remove('vc-detail-active');
});

multiplayerBtn.addEventListener('click', showMultiplayerModal);
closeMultiplayerBtn.addEventListener('click', hideMultiplayerModal);
multiplayerModal.addEventListener('click', (event) => {
    if (event.target === multiplayerModal) hideMultiplayerModal();
});
connectMultiplayerBtn.addEventListener('click', () => {
    const backend = mpBackendInput ? mpBackendInput.value.trim() : '';
    const sessionId = mpSessionInput ? mpSessionInput.value.trim() : 'default';
    if (!backend) {
        alert('Please enter a backend URL.');
        return;
    }
    activeBackendUrl = backend;
    activeSessionId = sessionId || 'default';
    localStorage.setItem(BACKEND_URL_KEY, activeBackendUrl);
    localStorage.setItem(SESSION_ID_KEY, activeSessionId);
    hideMultiplayerModal();
    connectWebSocket();
});

window.leadVentureRound = leadVentureRound;
window.getVentureCompanyDetail = (companyId) => ventureSim ? ventureSim.getCompanyDetail(companyId) : null;
window.getVentureCompanySummaries = () => ventureSim ? ventureSim.getCompanySummaries() : [];
window.ensureVentureSimulation = ensureVentureSimulation;

setMillionaireBtn.addEventListener('click', () => {
    cash = 1000000;
    updateNetWorth();
    updateDisplay();
});

setBillionaireBtn.addEventListener('click', () => {
    cash = 1000000000;
    updateNetWorth();
    updateDisplay();
});

setTrillionaireBtn.addEventListener('click', () => {
    cash = 1000000000000;
    updateNetWorth();
    updateDisplay();
});

function showMultiplayerModal() {
    if (!multiplayerModal) return;
    multiplayerModal.classList.add('active');
    if (mpBackendInput) {
        mpBackendInput.value = activeBackendUrl || window.WOJAK_BACKEND_URL || localStorage.getItem(BACKEND_URL_KEY) || '';
    }
    if (mpSessionInput) {
        mpSessionInput.value = activeSessionId || localStorage.getItem(SESSION_ID_KEY) || 'default';
    }
}

function hideMultiplayerModal() {
    if (!multiplayerModal) return;
    multiplayerModal.classList.remove('active');
}

// --- Initialization ---
async function init() {
    const sortCompaniesSelect = document.getElementById('sortCompanies');
    const filterCompaniesSelect = document.getElementById('filterCompanies');

    if (sortCompaniesSelect) {
        sortCompaniesSelect.value = currentSort;
    }

    initMatchContext();
    activeBackendUrl = localStorage.getItem(BACKEND_URL_KEY) || window.WOJAK_BACKEND_URL || null;
    activeSessionId = localStorage.getItem(SESSION_ID_KEY) || 'default';
    if (activeBackendUrl) {
        connectWebSocket();
    }
    if (!isServerAuthoritative) {
        sim = await loadCompaniesData();
        if (!sim) { return; }
    }

    if (sim && sim.companies) {
        companies = sim.companies;
    }

    const getNetWorthTooltipHandler = (context) => {
        // Tooltip Element
        let tooltipEl = document.getElementById('chartjs-tooltip');

        // Create element on first render
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.id = 'chartjs-tooltip';
            tooltipEl.style.opacity = 1;
            tooltipEl.style.pointerEvents = 'none';
            tooltipEl.style.position = 'absolute';
            tooltipEl.style.transform = 'translate(-50%, 0)';
            tooltipEl.style.transition = 'all .1s ease';
            tooltipEl.style.backgroundColor = '#ffffff';
            tooltipEl.style.borderRadius = '6px';
            tooltipEl.style.color = '#1e293b';
            tooltipEl.style.padding = '8px';
            tooltipEl.style.fontFamily = 'Inter, sans-serif';
            tooltipEl.style.fontSize = '14px';
            tooltipEl.style.whiteSpace = 'nowrap';
            tooltipEl.style.zIndex = '100';
            tooltipEl.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
            document.body.appendChild(tooltipEl);
        }

        // Hide if no tooltip
        const tooltipModel = context.tooltip;
        if (tooltipModel.opacity === 0) {
            tooltipEl.style.opacity = 0;
            return;
        }

        // Set Text
        if (tooltipModel.body && tooltipModel.dataPoints && tooltipModel.dataPoints.length > 0) {
            const dp = tooltipModel.dataPoints[0];
            const ds = context.chart.data.datasets?.[dp.datasetIndex];
            const point = ds && Array.isArray(ds.data) ? ds.data[dp.dataIndex] : null;
            if (!point || typeof point.x === 'undefined') {
                tooltipEl.style.opacity = 0;
                return;
            }
            const date = new Date(point.x);
            const dateStr = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            const rawValue = dp.raw?.y ?? dp.parsed?.y ?? dp.raw ?? dp.parsed;
            const valueStr = currencyFormatter.format(rawValue);

            const innerHtml = `
                <div style="margin-bottom: 4px; color: #1e293b; display: flex; align-items: center; gap: 4px;">
                    <span style="font-weight: 600;">Date:</span>
                    <span>${dateStr}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 4px;">
                    <span style="color: #1e293b; font-weight: 600;">Net Worth:</span>
                    <span style="color: #00c742;">${valueStr}</span>
                </div>
            `;

            tooltipEl.innerHTML = innerHtml;
        }

        const position = context.chart.canvas.getBoundingClientRect();

        // Display, position, and set styles for font
        tooltipEl.style.opacity = 1;
        tooltipEl.style.left = position.left + window.pageXOffset + tooltipModel.caretX + 'px';
        tooltipEl.style.top = position.top + window.pageYOffset + tooltipModel.caretY + 'px';
    };

    netWorthChart = new Chart(document.getElementById('netWorthChart').getContext('2d'), {
        type: 'line',
        data: {
            datasets: [{
                label: 'Net Worth',
                data: netWorthHistory,
                borderColor: '#00c742',
                backgroundColor: 'rgba(0, 199, 66, 0.1)',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverBackgroundColor: '#00c742',
                pointHoverBorderWidth: 0,
                pointHoverRadius: 6,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: false,
                    external: getNetWorthTooltipHandler
                }
            },
            scales: {
                x: { type: 'time', time: { unit: 'year' } },
                y: { ticks: { callback: value => formatLargeNumber(value) } }
            }
        }
    });
    if (isServerAuthoritative) {
        refreshNetWorthChartDatasets();
    }

    renderCompanies(true); // Initial full render
    renderPortfolio();
    updateDisplay();

    isGameReady = true;
    setGameSpeed(currentSpeed);
    initVC();

    // Event Listeners for sort and filter dropdowns
    sortCompaniesSelect.addEventListener('change', (event) => {
        currentSort = event.target.value;
        renderCompanies(true); // Re-render with new sort order
    });

    filterCompaniesSelect.addEventListener('change', (event) => {
        currentFilter = event.target.value;
        renderCompanies(true); // Re-render with new filter
    });

}

document.addEventListener('visibilitychange', () => {
    if (document.hidden && !isPaused) {
        wasAutoPaused = true;
        pauseGame();
    }
    if (!document.hidden && wasAutoPaused) {
        resumeGame();
    }
});

init();
if (dripToggle) {
    dripToggle.checked = dripEnabled;
    dripToggle.addEventListener('change', () => {
        dripEnabled = dripToggle.checked;
        if (ws && ws.readyState === WebSocket.OPEN && isServerAuthoritative) {
            sendCommand({ type: 'set_drip', enabled: dripEnabled });
        }
        try {
            localStorage.setItem(DRIP_STORAGE_KEY, dripEnabled);
        } catch (err) {
            console.warn('Unable to store DRIP setting:', err);
        }
    });
}
