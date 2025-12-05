// --- DOM Elements ---
const bodyEl = document.body;
const netWorthDisplay = document.getElementById('netWorthDisplay');
const currentDateDisplay = document.getElementById('currentDateDisplay');
const companiesGrid = document.getElementById('companiesGrid');

const speedSlider = document.getElementById('speedSlider');
const speedSliderWrap = document.querySelector('.speed-slider-wrap');
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
const leadAvatarName = document.getElementById('leadAvatarName');
const partyAvatars = document.getElementById('partyAvatars');
const faviconLink = document.getElementById('faviconLink');
const macroEventsDisplay = document.getElementById('macroEventsDisplay');
const buyMaxBtn = document.getElementById('buyMaxBtn');
const sellMaxBtn = document.getElementById('sellMaxBtn');
const vcBtn = document.getElementById('vcBtn');
const vcBadge = document.getElementById('vcBadge');
const vcView = document.getElementById('vc-view');
const backToMainBtn = document.getElementById('back-to-main-btn');
const dripToggle = document.getElementById('dripToggle');
const multiplayerBtn = document.getElementById('multiplayerBtn');
const multiplayerBtnContainer = document.getElementById('multiplayerBtnContainer');
const multiplayerStatusDisplay = document.getElementById('multiplayerStatusDisplay');
const mpSessionIdDisplay = document.getElementById('mpSessionIdDisplay');
const multiplayerModal = document.getElementById('multiplayerModal');
const closeMultiplayerBtn = document.getElementById('closeMultiplayerBtn');
const mpNameInput = document.getElementById('mpNameInput');
const createPartyBtn = document.getElementById('createPartyBtn');
const joinPartyBtn = document.getElementById('joinPartyBtn');
const confirmJoinPartyBtn = document.getElementById('confirmJoinPartyBtn');
const mpJoinCodeInput = document.getElementById('mpJoinCodeInput');
const mpJoinCodeLabel = document.getElementById('mpJoinCodeLabel');
const mpPartyCodeDisplay = document.getElementById('mpPartyCodeDisplay');
const copyPartyCodeBtn = document.getElementById('copyPartyCodeBtn');
const startPartyBtn = document.getElementById('startPartyBtn');
const mpHostColdStartHint = document.getElementById('mpHostColdStartHint');
// const multiplayerIdleState = document.getElementById('multiplayerIdleState'); // Removed from HTML
const multiplayerJoinState = document.getElementById('multiplayerJoinState');
const multiplayerCreateState = document.getElementById('multiplayerCreateState');
const mpPlayersListHost = document.getElementById('mpPlayersListHost');
const mpPlayersListJoin = document.getElementById('mpPlayersListJoin');
const mpNameError = document.getElementById('mpNameError');
const mpWaitingForHost = document.getElementById('mpWaitingForHost');
const NAME_PLACEHOLDERS = ['TheGrug850', 'Bloomer4000', 'TheRealWojak', 'WiseZoomer24'];
const MAX_NAME_LENGTH = 30;
const characterOverlay = document.getElementById('characterSelectOverlay');
const characterOptionButtons = document.querySelectorAll('.character-option');
const characterCancelBtn = document.getElementById('characterCancelBtn');
const playerLeaderboardEl = document.getElementById('playerLeaderboard');
const connectedPlayersEl = document.getElementById('connectedPlayers');
const connectedPlayersSessionEl = document.getElementById('connectedPlayersSession');
const mpJoinError = document.getElementById('mpJoinError');
const detailCompanyMission = document.getElementById('detailCompanyMission');
const detailCompanyFounders = document.getElementById('detailCompanyFounders');
const detailCompanyLocation = document.getElementById('detailCompanyLocation');
const detailCompanyLocationBadge = document.getElementById('detailCompanyLocationBadge');
const bankruptcyPopup = document.getElementById('bankruptcyPopup');
const bankruptcyPlayAgainBtn = document.getElementById('bankruptcyPlayAgainBtn');
const bankruptcyCloseBtn = document.getElementById('bankruptcyCloseBtn');
const bankruptcyPopupMultiplayer = document.getElementById('bankruptcyPopupMultiplayer');
const bankruptcyOkayBtn = document.getElementById('bankruptcyOkayBtn');
const bankruptcyCloseBtnMultiplayer = document.getElementById('bankruptcyCloseBtnMultiplayer');
const timelineEndPopup = document.getElementById('timelineEndPopup');
const timelineEndTitle = document.getElementById('timelineEndTitle');
const timelineEndWojak = document.getElementById('timelineEndWojak');
const timelineEndAmount = document.getElementById('timelineEndAmount');
const timelineEndPlayAgainBtn = document.getElementById('timelineEndPlayAgainBtn');
const timelineEndCloseBtn = document.getElementById('timelineEndCloseBtn');
const multiplayerEndPopup = document.getElementById('multiplayerEndPopup');
const multiplayerEndLeaderboard = document.getElementById('multiplayerEndLeaderboard');
const multiplayerEndCloseBtn = document.getElementById('multiplayerEndCloseBtn');
const multiplayerEndOkayBtn = document.getElementById('multiplayerEndOkayBtn');
const multiplayerEndTitle = document.getElementById('multiplayerEndTitle');
const multiplayerEndSubtitle = document.getElementById('multiplayerEndSubtitle');
const multiplayerEndHeading = document.getElementById('multiplayerEndHeading');
let storedPlayerName = null;
let selectedCharacter = null;

// Quick heads-up for small screens; the experience isn't optimized for mobile yet.
if (typeof window !== 'undefined' && window.innerWidth <= 768) {
    setTimeout(() => {
        alert("Sorry, Wojak Sim is not optimized for mobile yet :(");
    }, 1000);
}

const DEFAULT_WOJAK_SRC = 'wojaks/wojak.png';
const MALDING_WOJAK_SRC = 'wojaks/malding-wojak.png';
const HAPPY_WOJAK_SRC = 'wojaks/happywojak.png';
const GAME_START_YEAR = 1985;
const GAME_START_DATE = new Date(Date.UTC(GAME_START_YEAR, 0, 1));
const GLOBAL_BASE_INTEREST_RATE = 0.07; // shared baseline; can be adjusted by macro events later

function trackEvent(eventName, props = {}) {
    if (window.posthog) {
        window.posthog.capture(eventName, props);
    }
}

function resetDecadeTracking() {
    emittedDecadeKeys.clear();
}

const DEFAULT_TOAST_DURATION = 4500;
function showToast(message, options = {}) {
    const { tone = 'info', duration = DEFAULT_TOAST_DURATION } = options;
    const msg = typeof message === 'string' ? message : String(message || '');
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toastEl = document.createElement('div');
    toastEl.className = `toast toast-${tone}`;
    toastEl.textContent = msg;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => {
        toastEl.classList.add('hide');
        setTimeout(() => toastEl.remove(), 150);
    });

    toastEl.appendChild(closeBtn);
    container.appendChild(toastEl);
    requestAnimationFrame(() => toastEl.classList.add('show'));

    const ttl = Number.isFinite(duration) ? duration : DEFAULT_TOAST_DURATION;
    if (ttl > 0) {
        setTimeout(() => {
            toastEl.classList.add('hide');
            setTimeout(() => toastEl.remove(), 200);
        }, ttl);
    }
    window.showToast = showToast;
    return toastEl;
}
window.showToast = showToast;

// --- History Navigation Helpers ---
const VIEW_MARKET = 'market';
const VIEW_COMPANY = 'company';
const VIEW_VC = 'vc';
const VIEW_VC_DETAIL = 'vc-detail';
let suppressHistoryPush = false;
window.__suppressHistoryPush = false;

function getCurrentUrlForState() {
    if (typeof window === 'undefined') return '';
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function statesEqual(a = {}, b = {}) {
    return (a.view || '') === (b.view || '')
        && (a.companyId || '') === (b.companyId || '')
        && (a.ventureId || '') === (b.ventureId || '');
}

function pushViewState(view, payload = {}, options = {}) {
    if (typeof history === 'undefined' || typeof history.pushState !== 'function') return;
    if (suppressHistoryPush || window.__suppressHistoryPush) return;
    const next = { view, ...payload };
    const replace = options.replace === true;
    const current = history.state || {};
    if (!replace && statesEqual(current, next)) return;
    const url = getCurrentUrlForState();
    if (replace || !history.state) {
        history.replaceState(next, '', url);
    } else {
        history.pushState(next, '', url);
    }
}
window.pushViewState = pushViewState;

function applyHistoryState(state = { view: VIEW_MARKET }) {
    suppressHistoryPush = true;
    window.__suppressHistoryPush = true;
    const view = state?.view || VIEW_MARKET;
    if (view === VIEW_COMPANY) {
        const id = state.companyId;
        const company = companies.find(c => (c.id && c.id === id) || c.name === id);
        if (company) {
            showCompanyDetail(company, { skipHistory: true });
        } else {
            hideCompanyDetail(true);
        }
        bodyEl.classList.remove('vc-active');
        bodyEl.classList.remove('vc-detail-active');
    } else if (view === VIEW_VC_DETAIL) {
        if (typeof openVentureTab === 'function') openVentureTab({ skipHistory: true });
        if (typeof showVentureCompanyDetail === 'function' && state.ventureId) {
            showVentureCompanyDetail(state.ventureId, { skipHistory: true });
        }
    } else if (view === VIEW_VC) {
        if (typeof openVentureTab === 'function') openVentureTab({ skipHistory: true });
        if (typeof hideVentureCompanyDetail === 'function') hideVentureCompanyDetail({ skipHistory: true });
    } else {
        hideCompanyDetail(true);
        bodyEl.classList.remove('vc-active');
        bodyEl.classList.remove('vc-detail-active');
        if (typeof hideVentureCompanyDetail === 'function') hideVentureCompanyDetail({ skipHistory: true });
    }
    suppressHistoryPush = false;
    window.__suppressHistoryPush = false;
}

function initHistoryNavigation() {
    if (typeof history === 'undefined' || typeof history.replaceState !== 'function') return;
    const initialState = history.state && history.state.view ? history.state : { view: VIEW_MARKET };
    suppressHistoryPush = true;
    window.__suppressHistoryPush = true;
    history.replaceState(initialState, '', getCurrentUrlForState());
    suppressHistoryPush = false;
    window.__suppressHistoryPush = false;
}

window.addEventListener('popstate', (event) => {
    applyHistoryState(event.state || { view: VIEW_MARKET });
});

// --- Keyboard Navigation ---
let lastPointerTarget = null;
const TYPING_TAGS = ['INPUT', 'TEXTAREA', 'SELECT', 'OPTION'];

function isTypingContext(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (el.isContentEditable) return true;
    const tag = (el.tagName || '').toUpperCase();
    return TYPING_TAGS.includes(tag);
}

function getKeyboardClickTarget() {
    const active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement) return active;
    if (lastPointerTarget && lastPointerTarget !== document.body && lastPointerTarget !== document.documentElement) return lastPointerTarget;
    return null;
}

document.addEventListener('pointermove', (event) => {
    const target = event?.target;
    if (target && target instanceof Element) {
        lastPointerTarget = target;
    }
}, true);

document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    const target = event.target;
    if (isTypingContext(target)) return;

    if (event.code === 'Space') {
        const clickTarget = getKeyboardClickTarget();
        if (clickTarget) {
            event.preventDefault();
            clickTarget.click();
        }
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const navFn = event.key === 'ArrowLeft' ? history.back : history.forward;
        if (typeof navFn === 'function') {
            event.preventDefault();
            navFn.call(history);
        }
    }
});

function maybeTrackDecadeNetWorth(dateLike, players = null) {
    const year = dateLike instanceof Date ? dateLike.getUTCFullYear() : new Date(dateLike).getUTCFullYear();
    if (!Number.isFinite(year)) return;
    const decadeYear = Math.floor(year / 10) * 10;
    if (decadeYear < 2000) return; // start logging from 2000 onward
    const matchId = activeSessionId || (isServerAuthoritative ? 'multiplayer' : 'singleplayer_local');
    const key = `${matchId}_${decadeYear}`;
    if (emittedDecadeKeys.has(key)) return;
    if (isServerAuthoritative) {
        const isHostClient = isPartyHostClient || (clientPlayerId && currentHostId && clientPlayerId === currentHostId);
        if (!isHostClient) return; // avoid duplicate events from every participant
    }
    let playerSnapshots = [];
    if (isServerAuthoritative && Array.isArray(players)) {
        playerSnapshots = players.map(p => {
            const netWorthVal = typeof p.netWorth === 'number' ? p.netWorth : (typeof p.net_worth === 'number' ? p.net_worth : null);
            return {
                player_id: p?.id || null,
                player_name: p?.id || null,
                net_worth: netWorthVal
            };
        }).filter(p => p.player_id && Number.isFinite(p.net_worth));
    } else {
        const soloNetWorth = netWorth;
        playerSnapshots = [{
            player_id: clientPlayerId || 'local_player',
            player_name: clientPlayerId || 'local_player',
            net_worth: soloNetWorth
        }];
    }
    if (!playerSnapshots.length) return;
    trackEvent('decade_net_worth', {
        decade_year: decadeYear,
        mode: isServerAuthoritative ? 'multiplayer' : 'singleplayer',
        match_id: matchId,
        players: playerSnapshots
    });
    emittedDecadeKeys.add(key);
}

// --- Helper utilities ---
const PresetGenerators = window.PresetGenerators || {};
const {
    generatePublicHardTechPresetCompanies,
    generateHypergrowthPresetCompanies,
    generatePrivateHardTechCompanies,
    generateClassicCompanies,
    DEFAULT_VC_ROUNDS,
    HARDTECH_VC_ROUNDS
} = PresetGenerators;

if (!generatePublicHardTechPresetCompanies || !generateHypergrowthPresetCompanies || !generatePrivateHardTechCompanies || !generateClassicCompanies) {
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

const ventureModule = window.VentureEngineModule || {};
const { VentureCompany, VentureSimulation } = ventureModule;

const multiplayerModule = window.MultiplayerModule || null;
if (!multiplayerModule) {
    throw new Error('Multiplayer module failed to load. Ensure multiplayer.js is included before main.js.');
}
const {
    ensureConnectionBanner,
    setConnectionStatus,
    setBannerButtonsVisible,
    requestResync,
    disconnectMultiplayer,
    killRemoteSession,
    connectWebSocket,
    handleServerMessage,
    normalizeHttpUrl,
    wakeBackend,
    sanitizePlayerName,
    isNameTaken,
    setNameErrorVisible,
    makePlayerIdFromName,
    ensurePlayerIdentity,
    requirePlayerName,
    setMultiplayerState,
    showCharacterOverlay,
    hideCharacterOverlay,
    sendStartGameIfReady,
    renderLobbyPlayers,
    startLobbyRefresh,
    stopLobbyRefresh,
    resetMultiplayerModal,
    applyBackendAndSession,
    attemptJoinParty,
    handleCreateParty,
    handleCopyPartyCode,
    handleStartParty,
    updateCharacterLocksFromServer,
    updatePlayerColors,
    resetCharacterToDefault,
    getPlayerAvatarSrc,
    renderPartyAvatars,
    renderLeadAvatarName,
    promptCharacterIfPending,
    setLocalCharacterSelection,
    mergeLocalCharacter,
    setRosterFromServer
} = multiplayerModule;

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

const CHARACTER_SPRITES = {
    wojak: 'wojaks/wojak.png',
    grug: 'wojaks/grug.png',
    zoomer: 'wojaks/zoomer.png',
    bloomer: 'wojaks/bloomer.png'
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
let currentDate = new Date(GAME_START_DATE);
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
let currentSort = 'sector';
let currentFilter = 'all';
const DRIP_STORAGE_KEY = 'wojak_drip_enabled';
let dripEnabled = false;
const SESSION_ID_KEY = 'wojak_session_id';
const BACKEND_URL_KEY = 'wojak_backend_url';
const SELECTED_CHARACTER_KEY = 'wojak_selected_character';
const isLocal =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

const DEFAULT_WS_ORIGIN = isLocal
    ? 'ws://localhost:4000'
    : 'wss://wojak-backend.graysand-55f0f3f9.eastus2.azurecontainerapps.io';

const DEFAULT_BACKEND_URL = DEFAULT_WS_ORIGIN.replace(/^ws/, 'http');
const CLIENT_QUARTER_HISTORY_CAP = 160; // 40 years of quarters
const CLIENT_FINANCIAL_HISTORY_CAP = 40; // 40 annual entries
let lastNameTaken = false;
let wsGeneration = 0;
let latestServerPlayers = [];
let lastRosterSnapshot = [];

let wojakManager = null;
let handlingBankruptcy = false;
let gameEnded = false;
if (wojakImage) {
    wojakManager = wojakFactory.createWojakManager({
        imageElement: wojakImage,
        defaultSrc: DEFAULT_WOJAK_SRC,
        maldingSrc: MALDING_WOJAK_SRC,
        happySrc: HAPPY_WOJAK_SRC,
        getNetWorth: () => netWorth
    });
}
try {
    const stored = localStorage.getItem(DRIP_STORAGE_KEY);
    if (stored === 'true') dripEnabled = true;
    if (stored === 'false') dripEnabled = false;
    storedPlayerName = localStorage.getItem('wojak_player_name') || null;
    const storedChar = localStorage.getItem(SELECTED_CHARACTER_KEY);
    if (storedChar) selectedCharacter = storedChar;
    if (selectedCharacter) {
        applySelectedCharacter({ character: selectedCharacter });
    }
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

// Happy wojak tracking - records net worth snapshots to detect 5x gains
// Each entry: { netWorth, gameTime } where gameTime is currentDate.getTime()
let happyNetWorthHistory = [];
const HAPPY_GROWTH_MULTIPLIER = 5; // 5x increase required
const HAPPY_WINDOW_YEARS = 3.5; // Within 3.5 game years
const HAPPY_WINDOW_MS = HAPPY_WINDOW_YEARS * 365 * 24 * 60 * 60 * 1000;


// --- Banking State ---
let totalBorrowed = 0;
let lastInterestDate = new Date(currentDate);
const ANNUAL_INTEREST_RATE = GLOBAL_BASE_INTEREST_RATE;

// --- Global Game Constants ---
const GAME_END_YEAR = 2050;

let sim = null;
let companies = [];
let ventureSim = null;
let ventureCompanies = [];

// Per-match context (seed + rng + refs) to keep public/venture in sync.
let matchSeed = null;
let matchRng = null;
let matchRngFn = null;
let ws;
let wsHeartbeat = null;
let serverPlayer = null;
let clientPlayerId = null;
let serverTicks = new Set();
let lastTickId = 0;
let isServerAuthoritative = false;

// Fallback MacroEnv for multiplayer hydration if sim isn't ready
let fallbackMacroEnv = null;
function getMacroEnv() {
    if (sim && sim.macroEnv) return sim.macroEnv;
    if (fallbackMacroEnv) return fallbackMacroEnv;
    // Create a dummy one if needed
    if (window.SimShared && window.SimShared.MacroEnvironment && window.MacroEventModule) {
        const dummyManager = new window.MacroEventModule.MacroEventManager([], 1990);
        fallbackMacroEnv = new window.SimShared.MacroEnvironment(new Set(), dummyManager);
        return fallbackMacroEnv;
    }
    return null;
}

let activeSessionId = null;
let activeBackendUrl = null;
let manualDisconnect = false;
let multiplayerState = 'idle';
let lastGeneratedPartyCode = '';
let startGameRequested = false;
let startGameSent = false;
let isPartyHostClient = false;
let currentHostId = null;
let hasJoinedPartyAsGuest = false;
let lastKnownHostLabel = '';
let matchStarted = false;
let cachedPlayerName = '';
let lobbyRefreshTimer = null;
let pendingPartyAction = null;
let shouldPromptCharacterAfterConnect = false;
const playerNetWorthSeries = new Map();
const playerColorMap = new Map();
const CHARACTER_COLORS = {
    wojak: '#00c742',
    zoomer: '#635bff',
    grug: '#ff8200',
    bloomer: '#33a0ff'
};
const BASE_PLAYER_COLORS = ['#22c55e', '#3b82f6', '#f97316', '#a855f7'];
const EXTRA_PLAYER_COLORS = ['#ef4444', '#ec4899', '#000000', '#facc15']; // red, pink, black, yellow
let killSessionBtn = null;
let resyncButtonEl = null;
let disconnectButtonEl = null;
const emittedDecadeKeys = new Set();
const bankruptNotifiedIds = new Set();
const macroEventNotifiedIds = new Set();
const seenVentureIds = new Set();
let unseenVentureCount = 0;
const ENABLE_LOCAL_BANKRUPTCY_TEST = false;
const BANKRUPTCY_TEST_DELAY_MS = 12000;
// 5 years in game time: at 1x speed, each tick is ~500ms covering 4 game days
// 5 years = 5 * 365 = 1825 days = ~456 ticks = ~228 seconds at 1x speed
const HOLDING_PURGE_DELAY_MS = 5 * 365 * 500 / 4; // ~228 seconds (about 4 min real-time for 5 game-years at 1x)
const BANKRUPT_CLEANUP_BASE_MS = HOLDING_PURGE_DELAY_MS; // Same delay for market visibility
let bankruptcyTestTimer = null;
const holdingsPurgeTimers = new Map();
const bankruptCleanupTimers = new Map();
const delistedBankruptIds = new Set();

function resetClientStateForMultiplayer() {
    pauseGame();
    isPaused = true;
    isGameReady = false;
    handlingBankruptcy = false;
    gameEnded = false;
    isMillionaire = false;
    isBillionaire = false;
    isTrillionaire = false;
    currentDate = new Date(GAME_START_DATE);
    cash = 0;
    totalBorrowed = 0;
    netWorth = 0;
    netWorthAth = 0;
    lastDrawdownTriggerAth = 0;
    happyNetWorthHistory = [];
    portfolio = [];
    companies = [];
    sim = null;
    ventureSim = null;
    ventureCompanies = [];
    fallbackMacroEnv = null;
    matchSeed = null;
    matchRng = null;
    matchRngFn = null;
    activeCompanyDetail = null;
    latestServerPlayers = [];
    lastRosterSnapshot = [];
    resetDecadeTracking();
    if (playerNetWorthSeries && typeof playerNetWorthSeries.clear === 'function') {
        playerNetWorthSeries.clear();
    }
    netWorthHistory.length = 0;
    netWorthHistory.push({ x: currentDate.getTime(), y: netWorth });
    hideCompanyDetail(true);
    renderPortfolio();
    renderCompanies(true);
    updateDisplay();
    if (netWorthChart && netWorthChart.data && netWorthChart.data.datasets && netWorthChart.data.datasets[0]) {
        netWorthChart.data.datasets[0].data = netWorthHistory;
        netWorthChart.update('none');
    }
    if (timelineEndPopup) timelineEndPopup.classList.remove('show');
    if (bankruptcyPopup) bankruptcyPopup.classList.remove('show');
    if (bankruptcyPopupMultiplayer) bankruptcyPopupMultiplayer.classList.remove('show');
    // Re-enable speed slider for new game
    if (speedSlider) {
        speedSlider.disabled = false;
    }
}

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

function hydrateFromSnapshot(snapshot) {
    if (!snapshot || !snapshot.sim) return;
    if (snapshot.seed && snapshot.seed !== matchSeed) {
        matchSeed = snapshot.seed;
        if (SeededRandom) {
            matchRng = new SeededRandom(matchSeed);
            matchRngFn = () => matchRng.random();
        } else {
            matchRngFn = Math.random;
        }
    }
    currentHostId = snapshot.hostId || currentHostId;
    if (isServerAuthoritative) {
        netWorthHistory.length = 0;
        serverTicks = new Set();
        latestServerPlayers = mergeLocalCharacter(snapshot.players || []);
        updatePlayerColors(latestServerPlayers);
        playerNetWorthSeries.clear();
        renderPlayerLeaderboard(latestServerPlayers);
        if (snapshot.started) {
            startGameRequested = false;
            startGameSent = false;
            matchStarted = true;
            if (startPartyBtn) {
                startPartyBtn.disabled = true;
                startPartyBtn.textContent = 'Started';
            }
        }
    }
    // Hydrate Companies
    if (Array.isArray(snapshot.sim.companies)) {
        companies = snapshot.sim.companies.map(cData => {
            // Determine type and instantiate
            let instance;
            if (cData.fromVenture) {
                // It's a venture company (or graduated one)
                // We need to check if it's still in venture simulation or public
                // For simplicity, if it's in the main companies list, treat as Public Company (or PhaseCompany)
                // But wait, the snapshot structure might differ.
                // Standard public companies:
                instance = new CompanyModule.Company({ id: cData.id, static: { name: cData.name, sector: cData.sector }, base_business: { revenue_process: { initial_revenue_usd: { min: 0, max: 0 } }, margin_curve: {}, multiple_curve: {} } }, getMacroEnv());
            } else {
                instance = new CompanyModule.Company({ id: cData.id, static: { name: cData.name, sector: cData.sector }, base_business: { revenue_process: { initial_revenue_usd: { min: 0, max: 0 } }, margin_curve: {}, multiple_curve: {} } }, getMacroEnv());
            }
            instance.syncFromSnapshot(cData);
            return instance;
        });
    }

    // Hydrate Venture Simulation
    if (snapshot.venture && snapshot.venture.companies) {
        const vcModule = window.VentureEngineModule || {};
        const VCompanyCtor = vcModule.VentureCompany;
        if (typeof VentureSimulation !== 'undefined' && typeof VCompanyCtor === 'function') {
            const startDate = snapshot.lastTick ? new Date(snapshot.lastTick) : new Date(GAME_START_DATE);
            const ventureOpts = matchRngFn ? { rng: matchRngFn, seed: matchSeed } : {};
            ventureSim = new VentureSimulation([], startDate, ventureOpts);

            if (Array.isArray(snapshot.venture.companies)) {
                ventureSim.companies = snapshot.venture.companies.map(vData => {
                    const cfg = {
                        id: vData.id,
                        name: vData.name,
                        sector: vData.sector,
                        description: vData.description,
                        valuation_usd: vData.valuation,
                        funding_round: vData.funding_round || vData.stageLabel || 'seed'
                    };
                    const vc = new VCompanyCtor(cfg, startDate, matchRngFn || Math.random);
                    vc.syncFromSnapshot(vData);
                    return vc;
                });
            }
        } else {
            // Fallback: keep plain objects so UI can at least list them
            ventureSim = { companies: snapshot.venture.companies };
        }
    }

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
    if (snapshot.venture && snapshot.venture.companies) {
        ventureCompanies = snapshot.venture.companies;
        // Re-initialize ventureSim with server data
        if (typeof VentureSimulation !== 'undefined') {
            const ventureOpts = matchRngFn ? { rng: matchRngFn, seed: matchSeed } : {};
            ventureSim = new VentureSimulation(ventureCompanies, currentDate, ventureOpts);

            // CRITICAL FIX: Restore state from snapshot
            // The constructor resets companies to initial state. We must overwrite with snapshot data.
            if (ventureSim.companies && Array.isArray(ventureSim.companies)) {
                ventureSim.companies.forEach(comp => {
                    const snap = ventureCompanies.find(c => c.id === comp.id);
                    if (snap) {
                        Object.assign(comp, snap);
                        // Fix mapping: Server sends 'valuation', internal prop is 'currentValuation'
                        if (typeof snap.valuation === 'number') {
                            comp.currentValuation = snap.valuation;
                        }
                        // Restore Date objects
                        if (comp.startDate && !(comp.startDate instanceof Date)) {
                            comp.startDate = new Date(comp.startDate);
                        }
                        if (comp.currentDate && !(comp.currentDate instanceof Date)) {
                            comp.currentDate = new Date(comp.currentDate);
                        }
                        if (comp.failedAt && !(comp.failedAt instanceof Date)) {
                            comp.failedAt = new Date(comp.failedAt);
                        }
                        if (comp.targetListingDate && !(comp.targetListingDate instanceof Date)) {
                            comp.targetListingDate = new Date(comp.targetListingDate);
                        }
                        // Ensure history is restored if available
                        if (Array.isArray(snap.history)) {
                            comp.history = snap.history.map(pt => {
                                if (!pt) return pt;
                                let x = pt.x;
                                if (typeof x === 'string') {
                                    if (!isNaN(Number(x))) x = Number(x);
                                    else x = new Date(x).getTime();
                                }
                                return { ...pt, x, y: Number(pt.y) };
                            });
                        }
                        if (snap.financialHistory) comp.financialHistory = snap.financialHistory.slice();
                        if (snap.quarterHistory) comp.quarterHistory = snap.quarterHistory.slice();
                    }
                });
            }

            window.ventureSim = ventureSim;
        }
    }

    updateVentureBadge();

    // Refresh active detail view if open
    if (activeCompanyDetail) {
        const updated = companies.find(c => c.id === activeCompanyDetail.id || c.name === activeCompanyDetail.name);
        if (updated) {
            showCompanyDetail(updated, { skipHistory: true });
        } else {
            hideCompanyDetail(true);
        }
    }
}

function mergeFinancialData(existing, update) {
    let changed = false;
    let quarterChanged = false;
    let annualChanged = false;
    if (update.quarterHistory && Array.isArray(update.quarterHistory)) {
        if (!existing.quarterHistory) existing.quarterHistory = [];
        update.quarterHistory.forEach(item => {
            const idx = existing.quarterHistory.findIndex(q => q.year === item.year && q.quarter === item.quarter);
            if (idx >= 0) {
                const prev = existing.quarterHistory[idx];
                const altered = prev.revenue !== item.revenue || prev.profit !== item.profit;
                existing.quarterHistory[idx] = item;
                if (altered) {
                    changed = true;
                    quarterChanged = true;
                }
            } else {
                existing.quarterHistory.push(item);
                changed = true;
                quarterChanged = true;
            }
        });
        existing.quarterHistory.sort((a, b) => (a.year - b.year) || (a.quarter - b.quarter));
        if (existing.quarterHistory.length > CLIENT_QUARTER_HISTORY_CAP) {
            existing.quarterHistory = existing.quarterHistory.slice(existing.quarterHistory.length - CLIENT_QUARTER_HISTORY_CAP);
        }
    }
    if (update.financialHistory && Array.isArray(update.financialHistory)) {
        if (!existing.financialHistory) existing.financialHistory = [];
        update.financialHistory.forEach(item => {
            const idx = existing.financialHistory.findIndex(f => f.year === item.year);
            if (idx >= 0) {
                const prev = existing.financialHistory[idx];
                const altered = prev.revenue !== item.revenue || prev.profit !== item.profit || prev.cash !== item.cash || prev.debt !== item.debt;
                existing.financialHistory[idx] = item;
                if (altered) {
                    changed = true;
                    annualChanged = true;
                }
            } else {
                existing.financialHistory.push(item);
                changed = true;
                annualChanged = true;
            }
        });
        existing.financialHistory.sort((a, b) => a.year - b.year);
        if (existing.financialHistory.length > CLIENT_FINANCIAL_HISTORY_CAP) {
            existing.financialHistory = existing.financialHistory.slice(existing.financialHistory.length - CLIENT_FINANCIAL_HISTORY_CAP);
        }
    }
    if (quarterChanged) existing.newQuarterlyData = true;
    if (annualChanged) existing.newAnnualData = true;
    return changed;
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
    if (Array.isArray(tick.ventureEvents) && tick.ventureEvents.length > 0) {
        handleVentureEvents(tick.ventureEvents);
    }
    let activeFinancialChanged = false;
    tick.companies.forEach(update => {
        if (delistedBankruptIds.has(update.id) && update.bankrupt) {
            return; // keep delisted bankrupts out of the client list
        }
        let existing = companies.find(c => c.id === update.id);
        if (existing) {
            const prevHistory = Array.isArray(existing.history) ? existing.history.slice() : [];
            const prevQuarterHistory = Array.isArray(existing.quarterHistory) ? existing.quarterHistory.slice() : [];
            const prevFinancialHistory = Array.isArray(existing.financialHistory) ? existing.financialHistory.slice() : [];
            existing.syncFromSnapshot(update);
            // Always append the latest market cap to history for live charts
            if (!Array.isArray(existing.history)) existing.history = [];
            // Merge prior history we had locally so the chart doesn't collapse to a single point (server sends short tails)
            if (prevHistory.length) {
                const merged = [...prevHistory, ...existing.history]
                    .filter(p => p && typeof p.x !== 'undefined' && Number.isFinite(p.y))
                    .reduce((acc, p) => {
                        const key = typeof p.x === 'number' ? p.x : new Date(p.x).getTime();
                        acc.map.set(key, { x: key, y: p.y });
                        return acc;
                    }, { map: new Map() });
                const mergedArr = Array.from(merged.map.values()).sort((a, b) => (a.x || 0) - (b.x || 0));
                // Keep a reasonable tail to avoid unbounded growth
                const cap = 400;
                existing.history = mergedArr.length > cap ? mergedArr.slice(mergedArr.length - cap) : mergedArr;
            }
            const last = existing.history[existing.history.length - 1];
            if (!last || last.x < tickTs) {
                existing.history.push({ x: tickTs, y: update.marketCap });
            } else {
                last.y = update.marketCap;
            }
            const mergedFinancial = mergeFinancialData(existing, {
                quarterHistory: prevQuarterHistory,
                financialHistory: prevFinancialHistory
            });
            // Fallback display cap if missing
            if (!Number.isFinite(existing.displayCap) || existing.displayCap <= 0) {
                existing.displayCap = Number(update.marketCap) || 0;
            }
            if (
                (existing.newAnnualData || existing.newQuarterlyData || mergedFinancial) &&
                activeCompanyDetail &&
                (activeCompanyDetail.id === existing.id || activeCompanyDetail.name === existing.name)
            ) {
                activeFinancialChanged = true;
            }
        } else {
            // New company arrived from the server; instantiate properly
            const ipoDate = update.ipoDate ? new Date(update.ipoDate) : null;
            const startYear = ipoDate && !Number.isNaN(ipoDate.getTime()) ? ipoDate.getFullYear() : 1990;
            const newComp = new CompanyModule.Company(
                { id: update.id, static: { name: update.name, sector: update.sector }, base_business: { revenue_process: { initial_revenue_usd: { min: 0, max: 0 } }, margin_curve: {}, multiple_curve: {} } },
                getMacroEnv(),
                startYear,
                ipoDate
            );
            newComp.syncFromSnapshot(update);
            if (!Array.isArray(newComp.history)) newComp.history = [];
            newComp.history.push({ x: tickTs, y: update.marketCap || 0 });
            if (!Number.isFinite(newComp.displayCap) || newComp.displayCap <= 0) {
                newComp.displayCap = Number(update.marketCap) || 0;
            }
            companies.push(newComp);
        }
    });

    if (Array.isArray(tick.players) && tick.players.length) {
        const me = tick.players.find(p => (serverPlayer && p.id === serverPlayer.id) || (clientPlayerId && p.id === clientPlayerId)) || tick.players[0];
        if (me) updatePlayerFromServer(me);
        latestServerPlayers = mergeLocalCharacter(tick.players);
        updatePlayerColors(latestServerPlayers);
        renderPlayerLeaderboard(latestServerPlayers);
        updateCharacterLocksFromServer(latestServerPlayers);
        if (isServerAuthoritative) {
            updateNetWorthSeriesFromPlayers(tickTs, tick.players);
        }
    }
    if (tick.lastTick) {
        maybeTrackDecadeNetWorth(new Date(tick.lastTick), tick.players || []);
    }
    if (Array.isArray(tick.players)) {
        setRosterFromServer(tick.players);
    }
    updateNetWorth();
    notifyBankruptcies(companies);
    updateBankingDisplay();
    renderCompanies();
    updateDisplay();
    if (isServerAuthoritative) {
        refreshNetWorthChartDatasets();
    } else if (netWorthChart) {
        netWorthChart.update();
    }

    // Fix: Update active company detail chart + financials live
    if (activeCompanyDetail) {
        const updated = companies.find(c => c.id === activeCompanyDetail.id || c.name === activeCompanyDetail.name);
        if (updated) {
            // Update reference but don't full re-render to avoid flickering inputs
            activeCompanyDetail = updated;
            updateInvestmentPanelStats(updated);

            // Update chart data
            if (companyDetailChart && Array.isArray(updated.history)) {
                const history = [...updated.history].filter(p => p && Number.isFinite(p.y) && typeof p.x !== 'undefined').sort((a, b) => (a.x || 0) - (b.x || 0));
                companyDetailChart.data.datasets[0].data = history;
                companyDetailChart.update('none'); // 'none' mode for performance
            }
            if (activeFinancialChanged) {
                renderCompanyFinancialHistory(updated);
                updated.newAnnualData = false;
                updated.newQuarterlyData = false;
            }
        }
    } else {
        if (companyDetailChart) companyDetailChart.update();
    }

    // Handle Venture Updates
    if (tick.venture && tick.venture.companies) {
        // Merge venture updates
        tick.venture.companies.forEach(vUpdate => {
            // Update the config array (for re-init if needed)
            const existingConfig = ventureCompanies.find(v => v.id === vUpdate.id);
            if (existingConfig) {
                Object.assign(existingConfig, vUpdate);
            } else {
                ventureCompanies.push(vUpdate);
            }

            // Update the live simulation instance if it exists
            if (ventureSim) {
                const instance = ventureSim.getCompanyById(vUpdate.id);
                if (instance) {
                    if (typeof instance.syncFromSnapshot === 'function') {
                        instance.syncFromSnapshot(vUpdate);
                    } else {
                        Object.assign(instance, vUpdate);
                        if (typeof vUpdate.valuation === 'number') {
                            instance.currentValuation = vUpdate.valuation;
                        }
                    }

                    // Manually update history for the chart
                    if (tick.lastTick) {
                        const tickTs = new Date(tick.lastTick).getTime();
                        if (!instance.history) instance.history = [];
                        const lastHist = instance.history[instance.history.length - 1];
                        if (!lastHist || lastHist.x < tickTs) {
                            instance.history.push({ x: tickTs, y: instance.currentValuation });
                        }
                    }
                }
            }
        });

        // Drop ventures that have exited/failed on the server
        const incomingIds = new Set(tick.venture.companies.map(v => v.id));
        ventureCompanies = ventureCompanies.filter(v => incomingIds.has(v.id));
        if (ventureSim && Array.isArray(ventureSim.companies)) {
            ventureSim.companies = ventureSim.companies.filter(c => incomingIds.has(c.id));
        }

        // Update ventureSim global time
        if (ventureSim && tick.lastTick) {
            ventureSim.lastTick = new Date(tick.lastTick);
        }

        // Refresh VC UI if active
        if (document.body.classList.contains('vc-active') && typeof refreshVentureCompaniesList === 'function') {
            refreshVentureCompaniesList();
        }
        if (document.body.classList.contains('vc-detail-active') && typeof refreshVentureDetailView === 'function') {
            refreshVentureDetailView();
        }
        if (!document.body.classList.contains('vc-active')) {
            updateVentureBadge();
        }
    }
}

function applyTicks(ticks) {
    if (!Array.isArray(ticks)) return;
    ticks.forEach(applyTick);
}

function updatePlayerFromServer(playerSummary) {
    serverPlayer = playerSummary;
    if (serverPlayer && !serverPlayer.character && selectedCharacter) {
        serverPlayer.character = selectedCharacter;
    }
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
    applySelectedCharacter(serverPlayer);
    syncPortfolioFromServer();
    if (latestServerPlayers) {
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

function maybeScheduleBankruptcyTest() {
    if (!ENABLE_LOCAL_BANKRUPTCY_TEST || isServerAuthoritative) return;
    if (!Array.isArray(companies) || companies.length === 0) return;
    if (bankruptcyTestTimer) clearTimeout(bankruptcyTestTimer);

    const liveCompanies = companies.filter(c => c && !c.bankrupt);
    if (!liveCompanies.length) return;

    const rng = matchRngFn || Math.random;
    const target = liveCompanies[Math.floor(rng() * liveCompanies.length)];
    const targetName = (target && target.name) ? target.name : 'TestCo';
    showToast(`Testing: ${targetName} will go bankrupt soon. Buy shares to observe.`, { tone: 'warn', duration: 6000 });

    bankruptcyTestTimer = setTimeout(() => {
        if (!target || typeof target.markBankrupt !== 'function' || target.bankrupt) return;
        const now = sim && sim.lastTick ? new Date(sim.lastTick) : new Date();
        try {
            target.markBankrupt(now);
        } catch (err) {
            console.warn('Failed to mark test bankruptcy', err);
            return;
        }
        updateNetWorth();
        renderPortfolio();
        renderCompanies();
        updateDisplay();
        if (netWorthChart) netWorthChart.update();
        showToast(`${targetName} went bankrupt for testing.`, { tone: 'warn', duration: 6000 });
    }, BANKRUPTCY_TEST_DELAY_MS);
}

function scheduleLocalBankruptHoldingPurge(company) {
    if (isServerAuthoritative || !company || !company.name) return;
    const inPortfolio = portfolio.some(h => h && h.companyName === company.name && h.unitsOwned > 0);
    if (!inPortfolio) return;
    if (holdingsPurgeTimers.has(company.name)) return;
    const timer = setTimeout(() => {
        holdingsPurgeTimers.delete(company.name);
        const before = portfolio.length;
        portfolio = portfolio.filter(h => h.companyName !== company.name);
        if (before !== portfolio.length) {
            updateNetWorth();
            renderPortfolio();
            updateDisplay();
            if (netWorthChart) netWorthChart.update();
        }
    }, HOLDING_PURGE_DELAY_MS);
    holdingsPurgeTimers.set(company.name, timer);
}

function markBankruptCompaniesForCleanup(companiesList = []) {
    const speedFactor = Math.max(0.25, currentSpeed || 1);
    const ttlMs = BANKRUPT_CLEANUP_BASE_MS / speedFactor;
    const now = Date.now();
    companiesList.forEach(company => {
        if (!company || !company.id) return;
        if (bankruptCleanupTimers.has(company.id)) return;
        bankruptCleanupTimers.set(company.id, now + ttlMs);
    });
    // Periodically prune bankrupt companies after TTL
    if (!markBankruptCompaniesForCleanup._interval) {
        markBankruptCompaniesForCleanup._interval = setInterval(() => {
            const cutoff = Date.now();
            const pendingRemoval = [];
            bankruptCleanupTimers.forEach((expireTs, companyId) => {
                if (expireTs <= cutoff) {
                    pendingRemoval.push(companyId);
                }
            });
            if (pendingRemoval.length === 0) return;
            pendingRemoval.forEach(companyId => {
                bankruptCleanupTimers.delete(companyId);
                delistedBankruptIds.add(companyId);
                if (Array.isArray(companies)) {
                    for (let i = companies.length - 1; i >= 0; i--) {
                        if (companies[i] && (companies[i].id === companyId)) {
                            companies.splice(i, 1);
                        }
                    }
                }
                if (sim && Array.isArray(sim.companies) && sim.companies !== companies) {
                    for (let i = sim.companies.length - 1; i >= 0; i--) {
                        if (sim.companies[i] && (sim.companies[i].id === companyId)) {
                            sim.companies.splice(i, 1);
                        }
                    }
                }
            });
            renderCompanies(true);
            renderPortfolio();
            updateDisplay();
        }, 5000);
    }
}

function ensureVentureSimulation(force = false) {
    if ((force || !ventureSim) && typeof VentureSimulation !== 'undefined' && ventureCompanies.length > 0) {
        const ventureOpts = matchRngFn ? { rng: matchRngFn, seed: matchSeed } : {};
        ventureSim = new VentureSimulation(ventureCompanies, currentDate, ventureOpts);
        window.ventureSim = ventureSim;
    }
}

function getVentureListingIds() {
    const source = typeof getVentureCompanySummaries === 'function'
        ? getVentureCompanySummaries()
        : (Array.isArray(ventureCompanies) ? ventureCompanies : []);
    return source
        .map(entry => entry && (entry.id || entry.name))
        .filter(Boolean);
}

function setVentureBadgeCount(count = 0) {
    unseenVentureCount = Math.max(0, Number.isFinite(count) ? count : 0);
    if (!vcBadge) return;
    if (vcBtn && vcBtn.disabled) {
        vcBadge.textContent = '';
        vcBadge.classList.remove('show');
        return;
    }
    if (unseenVentureCount > 0) {
        vcBadge.textContent = unseenVentureCount > 99 ? '99+' : String(unseenVentureCount);
        vcBadge.classList.add('show');
    } else {
        vcBadge.textContent = '';
        vcBadge.classList.remove('show');
    }
}

function markVentureListingsSeen() {
    getVentureListingIds().forEach(id => seenVentureIds.add(id));
    setVentureBadgeCount(0);
}

function updateVentureBadge() {
    const unseen = getVentureListingIds().filter(id => !seenVentureIds.has(id));
    setVentureBadgeCount(unseen.length);
}

function resetVentureBadgeState() {
    seenVentureIds.clear();
    setVentureBadgeCount(0);
}

async function loadCompaniesData() {
    try {
        initMatchContext();
        resetVentureBadgeState();
        const macroEventsResponse = await fetch('data/macroEvents.json');
        if (!macroEventsResponse.ok) { throw new Error(`HTTP error! status: ${macroEventsResponse.status} for macroEvents.json`); }

        ventureCompanies = [];
        const macroEvents = await macroEventsResponse.json();
        let filteredCompanies = [];
        const presetOptions = matchRngFn ? { rng: matchRngFn } : {};
        const presetClassicCompanies = await generateClassicCompanies(presetOptions);
        if (Array.isArray(presetClassicCompanies)) {
            filteredCompanies.push(...presetClassicCompanies);
        }
        const presetHardTechCompanies = await generatePublicHardTechPresetCompanies(null, presetOptions);
        if (Array.isArray(presetHardTechCompanies)) {
            filteredCompanies.push(...presetHardTechCompanies);
        }
        const presetVentureCompanies = await generateHypergrowthPresetCompanies(presetOptions);
        if (Array.isArray(presetVentureCompanies)) {
            ventureCompanies.push(...presetVentureCompanies);
        }
        const hardTechCompanies = await generatePrivateHardTechCompanies(null, presetOptions);
        if (Array.isArray(hardTechCompanies)) {
            ventureCompanies.push(...hardTechCompanies);
        }
        ensureVentureSimulation(true);
        updateVentureBadge();
        const simOptions = matchRngFn
            ? { macroEvents, seed: matchSeed, rng: matchRngFn, startYear: GAME_START_YEAR }
            : { macroEvents, startYear: GAME_START_YEAR };
        return new Simulation(filteredCompanies, simOptions);
    } catch (error) {
        console.error("Could not load data:", error);
        showToast("Failed to load game data. Please ensure JSON files are in the same directory and a local server is running.", { tone: 'error', duration: 6000 });
        return null;
    }
}

// --- Chart Objects ---
let netWorthChart, companyDetailChart, financialYoyChart;
let currentChartRange = 80; // Default to 20Y (80 quarters)
const BASE_SPEED_STEPS = [0, 0.5, 1, 1.5, 2, 2.5, 3];
const DEBUG_SPEED_STEPS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 10, 12, 16];
let SPEED_STEPS = BASE_SPEED_STEPS.slice();

// --- Formatting ---
const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
function formatLargeNumber(num, precision = 2) {
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    if (absNum >= 1e15) return `${sign}$${(absNum / 1e15).toFixed(precision)}Q`;
    if (absNum >= 1e12) return `${sign}$${(absNum / 1e12).toFixed(precision)}T`;
    if (absNum >= 1e9) return `${sign}$${(absNum / 1e9).toFixed(precision)}B`;
    if (absNum >= 1e6) return `${sign}$${(absNum / 1e6).toFixed(precision)}M`;
    if (absNum >= 1e3) return `${sign}$${(absNum / 1e3).toFixed(1)}K`;
    return currencyFormatter.format(num);
}
function formatDate(date) { return date.toISOString().split('T')[0]; }

// --- Debug mode (gated to localhost + singleplayer) ---
const isLocalhost = typeof window !== 'undefined'
    ? ['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.hostname.endsWith('.local')
    : false;
let debugMode = false;
function setDebugMode(enabled, reason = 'manual') {
    if (isServerAuthoritative) return;
    if (!isLocalhost) return;
    debugMode = !!enabled;
    window.__WOJAK_DEBUG_MODE__ = debugMode;
    const debugControls = document.getElementById('debugControls');
    if (debugControls) debugControls.style.display = debugMode ? 'flex' : 'none';
    SPEED_STEPS = debugMode ? DEBUG_SPEED_STEPS.slice() : BASE_SPEED_STEPS.slice();
    // Clamp speed in non-debug
    const maxSpeed = Math.max(...SPEED_STEPS);
    if (!debugMode && currentSpeed > maxSpeed) {
        setGameSpeed(maxSpeed);
    } else {
        updateSpeedThumbLabel();
    }
    syncSpeedSliderBounds();
    if (debugMode) console.info(`[Debug] Enabled (${reason})`);
}
window.enableDebugMode = () => setDebugMode(true, 'console');
window.disableDebugMode = () => setDebugMode(false, 'console');
const debugParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('debug') : null;
if (debugParam === '1' && !isServerAuthoritative) {
    setDebugMode(true, 'query');
}

// --- Synthetic Equal-Weight Index (testing-only) ---
function updateDisplay() {
    let publicAssets = 0;
    portfolio.forEach(holding => {
        const company = companies.find(c => c.name === holding.companyName);
        if (company) {
            const value = company.marketCap * holding.unitsOwned;
            publicAssets += value;
        }
    });
    const activePlayerId = (serverPlayer && serverPlayer.id) || clientPlayerId || 'local_player';
    const privateAssets = (isServerAuthoritative && serverPlayer && typeof serverPlayer.ventureEquity === 'number')
        ? serverPlayer.ventureEquity
        : (ventureSim ? ventureSim.getPlayerHoldingsValue(activePlayerId) : 0);
    const pendingCommitments = (isServerAuthoritative && serverPlayer && typeof serverPlayer.ventureCommitmentsValue === 'number')
        ? serverPlayer.ventureCommitmentsValue
        : (ventureSim ? ventureSim.getPendingCommitments(activePlayerId) : 0);
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
    const displayCommitments = (isServerAuthoritative && serverPlayer && typeof serverPlayer.ventureCommitmentsValue === 'number')
        ? serverPlayer.ventureCommitmentsValue
        : pendingCommitments;

    // Compute net worth locally to ensure pending commitments are reflected immediately
    const computedNetWorth = displayCash + equityValue + displayCommitments - displayDebt;

    netWorthDisplay.textContent = currencyFormatter.format(isServerAuthoritative ? computedNetWorth : displayNetWorth);
    if (isServerAuthoritative && serverPlayer && playerColorMap.has(serverPlayer.id)) {
        netWorthDisplay.style.color = playerColorMap.get(serverPlayer.id);
    } else {
        const colorBasis = isServerAuthoritative ? computedNetWorth : displayNetWorth;
        netWorthDisplay.style.color = colorBasis >= 0 ? '#00c742' : '#dc3545';
    }
    currentDateDisplay.textContent = formatDate(currentDate);

    // Update the single display line
    subFinancialDisplay.textContent = `Equities: ${currencyFormatter.format(equityValue)} | Cash: ${currencyFormatter.format(displayCash)} | Liabilities: ${currencyFormatter.format(displayDebt)}`;

    const singleplayerBankrupt = !isServerAuthoritative && netWorth <= 0;
    const multiplayerBankrupt = isServerAuthoritative && netWorth < 0;
    if (!handlingBankruptcy && (singleplayerBankrupt || multiplayerBankrupt)) {
        handlingBankruptcy = true;
        endGame("bankrupt");
        return;
    }
    // In singleplayer, bankruptcy is final - don't allow recovery
    // Only multiplayer can recover (server manages that state)
    if (handlingBankruptcy && isServerAuthoritative) {
        const resolved = netWorth >= 0 && displayDebt <= 0 && serverPlayer && !serverPlayer.bankrupt;
        if (resolved) {
            handlingBankruptcy = false;
        }
    }
    updateMacroEventsDisplay();
}

function isWojakCharacterSelected() {
    const key = (serverPlayer && serverPlayer.character)
        ? serverPlayer.character
        : selectedCharacter;
    return (key || '').toLowerCase() === 'wojak';
}

function applySelectedCharacter(player) {
    if (!player) return;
    const key = (player.character || '').toLowerCase();
    const sprite = CHARACTER_SPRITES[key];
    if (!sprite || !wojakImage) return;
    wojakImage.src = sprite;
    if (wojakManager && typeof wojakManager.setBaseImage === 'function') {
        wojakManager.setBaseImage(sprite, true);
    }
}

function pickColorById(id, palette) {
    if (!Array.isArray(palette) || palette.length === 0) return '#cccccc';
    const str = String(id || '');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0; // keep 32-bit
    }
    const idx = Math.abs(hash) % palette.length;
    return palette[idx];
}

function getPlayerColor(id) {
    if (!id) return BASE_PLAYER_COLORS[0];
    const palette = [...BASE_PLAYER_COLORS, ...EXTRA_PLAYER_COLORS];
    return playerColorMap.get(id) || pickColorById(id, palette);
}

function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (ch) => {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return map[ch] || ch;
    });
}

function renderMultiplayerEndSummary(players = [], finalYear = null) {
    if (!multiplayerEndPopup || !multiplayerEndLeaderboard) return;
    multiplayerEndLeaderboard.innerHTML = '';
    const endYearLabel = finalYear || GAME_END_YEAR;
    if (multiplayerEndTitle) {
        multiplayerEndTitle.textContent = `You've reached ${endYearLabel}!`;
    }
    if (multiplayerEndSubtitle) {
        multiplayerEndSubtitle.textContent = 'Thanks for playing!';
    }
    if (multiplayerEndHeading) {
        multiplayerEndHeading.textContent = 'Ending Net Worths:';
    }
    const sorted = [...players].filter(Boolean).sort((a, b) => {
        const aNet = Number.isFinite(a?.netWorth) ? a.netWorth : Number(a?.net_worth) || 0;
        const bNet = Number.isFinite(b?.netWorth) ? b.netWorth : Number(b?.net_worth) || 0;
        return bNet - aNet;
    });
    if (!sorted.length) {
        const emptyRow = document.createElement('div');
        emptyRow.className = 'mp-end-row';
        emptyRow.textContent = 'No player data.';
        multiplayerEndLeaderboard.appendChild(emptyRow);
    } else {
        sorted.forEach((p, idx) => {
            const row = document.createElement('div');
            row.className = 'mp-end-row';

            const rank = document.createElement('span');
            rank.className = 'mp-end-rank';
            rank.textContent = `${idx + 1}.`;

            const avatar = document.createElement('img');
            avatar.className = 'mp-end-avatar';
            const avatarSrc = typeof getPlayerAvatarSrc === 'function'
                ? getPlayerAvatarSrc(p?.id || p?.name)
                : (CHARACTER_SPRITES[(p?.character || '').toLowerCase()] || DEFAULT_WOJAK_SRC);
            avatar.src = avatarSrc;
            avatar.alt = p?.character || 'avatar';

            const name = document.createElement('span');
            name.className = 'mp-end-name';
            name.textContent = `${p?.id || p?.name || 'Player'}:`;

            const nwVal = Number.isFinite(p?.netWorth) ? p.netWorth : Number(p?.net_worth) || 0;
            const networth = document.createElement('span');
            networth.className = 'mp-end-networth';
            networth.textContent = currencyFormatter.format(nwVal);
            const color = getPlayerColor(p?.id || p?.name);
            if (color) networth.style.color = color;

            row.appendChild(rank);
            row.appendChild(avatar);
            row.appendChild(name);
            row.appendChild(networth);
            multiplayerEndLeaderboard.appendChild(row);
        });
    }
    multiplayerEndPopup.classList.add('show');
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
    const activePlayerId = (serverPlayer && serverPlayer.id) || clientPlayerId || 'local_player';
    renderPortfolioUI({
        portfolio,
        companies,
        ventureSim,
        portfolioList,
        emptyPortfolioMsg,
        currencyFormatter,
        serverPlayer,
        isServerAuthoritative,
        playerId: activePlayerId
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
            const fallbackPalette = [...BASE_PLAYER_COLORS, ...EXTRA_PLAYER_COLORS];
            const color = playerColorMap.get(id) || pickColorById(id, fallbackPalette);
            datasets.push({
                label: id,
                data: sorted,
                borderColor: color,
                backgroundColor: 'transparent',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: color,
                pointHoverBorderWidth: 0,
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
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#00c742',
                pointHoverBorderWidth: 0,
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
    if (!playerLeaderboardEl || !connectedPlayersEl) {
        renderLobbyPlayers(players);
        return;
    }
    if (!isServerAuthoritative || !Array.isArray(players) || players.length === 0) {
        connectedPlayersEl.style.display = 'none';
        playerLeaderboardEl.innerHTML = '';
        renderLobbyPlayers(players);
        return;
    }
    const sorted = [...players].sort((a, b) => (b.netWorth || 0) - (a.netWorth || 0));
    const rows = sorted.map(p => {
        const net = currencyFormatter.format(p.netWorth || 0);
        const cashStr = currencyFormatter.format(p.cash || 0);
        const palette = [...BASE_PLAYER_COLORS, ...EXTRA_PLAYER_COLORS];
        const color = playerColorMap.get(p.id) || pickColorById(p.id, palette);
        return `
          <div class="portfolio-item" data-portfolio-type="public" data-portfolio-key="player-${p.id}">
              <div class="company-name" style="color:${color}">${p.id}</div>
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
    renderLobbyPlayers(players);
    if (mpNameInput && mpNameInput.value) {
        if (isNameTaken(mpNameInput.value)) {
            mpNameInput.classList.add('input-error');
            setNameErrorVisible(true);
        } else {
            setNameErrorVisible(false);
        }
    }
}

function updateMacroEventsDisplay() {
    if (!macroEventsDisplay) return;
    const events = (sim && typeof sim.getActiveMacroEvents === 'function') ? sim.getActiveMacroEvents() : [];
    macroEventsDisplay.style.display = 'none'; // hide legacy pill bar
    macroEventsDisplay.innerHTML = '';
    macroEventsDisplay.classList.remove('active');
    if (!events || events.length === 0) return;
    events.forEach(evt => {
        if (!evt || !evt.id) return;
        const progress = Number.isFinite(evt.progress) ? evt.progress : 1;
        if (progress < 0.3) return;
        if (macroEventNotifiedIds.has(evt.id)) return;
        macroEventNotifiedIds.add(evt.id);
        const label = evt.label || 'Macro event';
        const desc = evt.description || '';
        const message = desc ? `${label}: ${desc}` : label;
        const tone = evt.isPositive ? 'macro-good' : (evt.isNegative ? 'macro-bad' : 'macro');
        showToast(message, { tone, duration: 10000 });
    });
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
    const activePlayerId = (serverPlayer && serverPlayer.id) || clientPlayerId || 'local_player';
    if (serverPlayer && isServerAuthoritative) {
        const publicValue = portfolio.reduce((sum, holding) => {
            const company = companies.find(c => c.name === holding.companyName);
            return sum + (company ? company.marketCap * holding.unitsOwned : 0);
        }, 0);
        const privateValue = typeof serverPlayer.ventureEquity === 'number' ? serverPlayer.ventureEquity : (ventureSim ? ventureSim.getPlayerHoldingsValue(activePlayerId) : 0);
        const pendingCommitments = typeof serverPlayer.ventureCommitmentsValue === 'number' ? serverPlayer.ventureCommitmentsValue : (ventureSim ? ventureSim.getPendingCommitments(activePlayerId) : 0);
        const displayCash = typeof serverPlayer.cash === 'number' ? serverPlayer.cash : cash;
        const displayDebt = typeof serverPlayer.debt === 'number' ? serverPlayer.debt : totalBorrowed;
        netWorth = displayCash + publicValue + privateValue + pendingCommitments - displayDebt;
    } else {
        let totalHoldingsValue = portfolio.reduce((sum, holding) => {
            const company = companies.find(c => c.name === holding.companyName);
            return sum + (company ? company.marketCap * holding.unitsOwned : 0);
        }, 0);
        const ventureHoldingsValue = ventureSim ? ventureSim.getPlayerHoldingsValue(activePlayerId) : 0;
        const pendingCommitments = ventureSim ? ventureSim.getPendingCommitments(activePlayerId) : 0;
        netWorth = cash + totalHoldingsValue + ventureHoldingsValue + pendingCommitments - totalBorrowed;
    }
    netWorthHistory.push({ x: currentDate.getTime(), y: netWorth });
    if (netWorthHistory.length > 2000) netWorthHistory.shift();

    if (netWorth > netWorthAth) {
        netWorthAth = netWorth;
        lastDrawdownTriggerAth = 0;
    }
    const drawdown = netWorthAth > 0 ? (netWorthAth - netWorth) / netWorthAth : 0;
    const isWojakAvatar = isWojakCharacterSelected();
    const isSuitedWojak = isWojakAvatar && (isMillionaire || isBillionaire || isTrillionaire);
    const maldingEnabled = isWojakAvatar && !isSuitedWojak && !isServerAuthoritative; // Temporarily disable in multiplayer
    if (!maldingEnabled && wojakManager) {
        wojakManager.endMalding(true);
    }
    if (maldingEnabled && drawdown >= 0.5 && netWorthAth > 0 && lastDrawdownTriggerAth !== netWorthAth) {
        lastDrawdownTriggerAth = netWorthAth;
        if (wojakManager) {
            wojakManager.triggerMalding(netWorthAth, drawdown);
        }
    }
    if (maldingEnabled && wojakManager) {
        wojakManager.handleRecovery(netWorth);
    }

    // Happy wojak logic - same conditions as malding (base wojak, singleplayer only)
    if (maldingEnabled && wojakManager && !wojakManager.state.isMalding) {
        const currentGameTime = currentDate.getTime();
        // Record current net worth snapshot
        happyNetWorthHistory.push({ netWorth, gameTime: currentGameTime });
        // Prune old snapshots outside the window
        const cutoffTime = currentGameTime - HAPPY_WINDOW_MS;
        happyNetWorthHistory = happyNetWorthHistory.filter(entry => entry.gameTime >= cutoffTime);
        // Check if current net worth is 5x any past snapshot within the window
        const lowestInWindow = happyNetWorthHistory.reduce((min, entry) =>
            entry.netWorth < min ? entry.netWorth : min, happyNetWorthHistory[0]?.netWorth || netWorth);
        if (lowestInWindow > 0 && netWorth >= lowestInWindow * HAPPY_GROWTH_MULTIPLIER) {
            wojakManager.triggerHappy(netWorth);
            // Clear history so we don't re-trigger immediately
            happyNetWorthHistory = [{ netWorth, gameTime: currentGameTime }];
        }
    }

    if (netWorth >= 1000000 && !isMillionaire) {
        isMillionaire = true;
        if (isWojakAvatar && wojakManager) {
            wojakManager.setBaseImage('wojaks/suit-wojak.png', true);
        }
        jsConfetti.addConfetti({ emojis: ['💰', '💵'], confettiNumber: 150, emojiSize: 30, });
    }
    if (netWorth >= 1000000000 && !isBillionaire) {
        isBillionaire = true;
        if (isWojakAvatar && wojakManager) {
            wojakManager.setBaseImage('wojaks/red-suit-wojak.png', true);
        }
        jsConfetti.addConfetti({ emojis: ['💎', '📀'], confettiNumber: 40, emojiSize: 40, });
    }
    if (netWorth >= 1000000000000 && !isTrillionaire) {
        isTrillionaire = true;
        if (isWojakAvatar && wojakManager) {
            wojakManager.setBaseImage('wojaks/purple-suit-wojak.png', true);
        }
        jsConfetti.addConfetti({ emojis: ['🌌', '🥇', '🔮'], confettiNumber: 100, emojiSize: 30, });
        setTimeout(() => { jsConfetti.addConfetti({ emojis: ['🌌', '🥇', '🔮'], confettiNumber: 100, emojiSize: 30, }); }, 1000);
        setTimeout(() => { jsConfetti.addConfetti({ emojis: ['🌌', '🥇', '🔮'], confettiNumber: 100, emojiSize: 30, }); }, 2000);
    }

    if (netWorth >= 1000000 || isMillionaire) {
        vcBtn.disabled = false;
        vcBtn.parentElement.classList.remove('disabled');
        ensureVentureSimulation();
        updateVentureBadge();
    } else {
        vcBtn.disabled = true;
        vcBtn.parentElement.classList.add('disabled');
        setVentureBadgeCount(0);
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
        const payFromCash = Math.min(cash, interest);
        cash -= payFromCash;
        const unpaid = interest - payFromCash;
        if (unpaid > 0) {
            totalBorrowed += unpaid; // capitalize unpaid interest into debt
        }
        lastInterestDate = new Date(currentDate);
    }
}

function clearBankingInputAndRefresh() {
    if (bankingAmountInput) {
        bankingAmountInput.value = '';
    }
    updateBankingDisplay();
}

function notifyBankruptcies(companiesList = []) {
    companiesList.forEach(company => {
        if (!company || !company.id || !company.bankrupt) return;
        if (bankruptNotifiedIds.has(company.id)) return;
        bankruptNotifiedIds.add(company.id);
        const name = company.name || 'A company';
        showToast(`${name} declared bankruptcy.`, { tone: 'warn', duration: 5000 });
    });
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function convertVentureCompanyToPublic(event) {
    if (!sim || !ventureSim || !event) return;
    const ipoDate = new Date(currentDate);
    const viewedVentureId = (typeof window.getCurrentVentureCompanyId === 'function')
        ? window.getCurrentVentureCompanyId()
        : null;

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

    // Keep local reference in sync with sim companies (especially before next tick)
    if (sim && Array.isArray(sim.companies)) {
        companies = sim.companies;
    }

    const wasViewingThisVenture = !!viewedVentureId && (
        viewedVentureId === event.companyId ||
        viewedVentureId === (ventureCompany && ventureCompany.id) ||
        viewedVentureId === (ventureCompany && ventureCompany.name)
    );

    const publicCompany = Array.isArray(companies)
        ? companies.find(c => c && (c.id === ventureCompany.id || c.name === ventureCompany.name))
        : null;

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

    // Teleport from VC detail to public listing if the player was viewing this company
    if (wasViewingThisVenture && publicCompany) {
        if (typeof hideVentureCompanyDetail === 'function') {
            hideVentureCompanyDetail({ skipHistory: true });
        }
        showCompanyDetail(publicCompany);
        showToast(`${publicCompany.name} just IPO'd — jumping to the public listing.`, { tone: 'info', duration: 5000 });
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
    const activePlayerId = (serverPlayer && serverPlayer.id) || clientPlayerId || 'local_player';
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
        } else if (event.type === 'venture_round_closed') {
            // Ensure local/server player mirrors the granted equity and clears pending commit
            if (event.playerId && event.playerId === activePlayerId) {
                if (serverPlayer) {
                    if (!serverPlayer.ventureHoldings) serverPlayer.ventureHoldings = {};
                    if (event.playerEquity && event.playerEquity > 0) {
                        serverPlayer.ventureHoldings[event.companyId] = event.playerEquity;
                    }
                    if (serverPlayer.ventureCommitments) {
                        delete serverPlayer.ventureCommitments[event.companyId];
                    }
                }
                needsRefresh = true;
            }
            // Always refresh UI on close so stakes show up even if local sim missed the map
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
    if (isNaN(amount) || amount <= 0) { showToast("Please enter a valid amount to borrow.", { tone: 'warn' }); return; }
    if (ws && ws.readyState === WebSocket.OPEN) {
        sendCommand({ type: 'borrow', amount });
        clearBankingInputAndRefresh();
        return;
    }
    const maxBorrowing = getMaxBorrowing();
    if (amount > maxBorrowing) { showToast(`You can only borrow up to ${currencyFormatter.format(maxBorrowing)}.`, { tone: 'warn' }); return; }
    totalBorrowed += amount;
    cash += amount;
    lastInterestDate = new Date(currentDate); // Reset interest timer on borrow
    updateNetWorth(); updateDisplay(); clearBankingInputAndRefresh();
}

function repay(amount) {
    amount = parseUserAmount(amount);
    if (isNaN(amount) || amount <= 0) { showToast("Please enter a valid amount to repay.", { tone: 'warn' }); return; }
    if (ws && ws.readyState === WebSocket.OPEN) {
        sendCommand({ type: 'repay', amount });
        clearBankingInputAndRefresh();
        return;
    }
    if (amount > totalBorrowed) { showToast(`You only owe ${currencyFormatter.format(totalBorrowed)}.`, { tone: 'warn' }); return; }
    if (amount > cash) { showToast("You don't have enough cash to repay this amount.", { tone: 'warn' }); return; }
    totalBorrowed -= amount;
    cash -= amount;
    lastInterestDate = new Date(currentDate); // Reset interest timer on repay
    updateNetWorth(); updateDisplay(); clearBankingInputAndRefresh();
}

function updateBankingDisplay() {
    const maxBorrowing = getMaxBorrowing();
    const displayCash = isServerAuthoritative && serverPlayer ? serverPlayer.cash : cash;
    const displayDebt = isServerAuthoritative && serverPlayer ? serverPlayer.debt : totalBorrowed;
    const activePlayerId = (serverPlayer && serverPlayer.id) || clientPlayerId || 'local_player';
    bankingCashDisplay.textContent = currencyFormatter.format(displayCash);
    bankingCashDisplay.className = `stat-value ${displayCash >= 0 ? 'positive' : 'negative'}`;
    let totalAssets = displayCash;
    portfolio.forEach(holding => {
        const company = companies.find(c => c.name === holding.companyName);
        if (company) { totalAssets += company.marketCap * holding.unitsOwned; }
    });
    const privateAssets = (isServerAuthoritative && serverPlayer && typeof serverPlayer.ventureEquity === 'number')
        ? serverPlayer.ventureEquity
        : (ventureSim ? ventureSim.getPlayerHoldingsValue(activePlayerId) : 0);
    const pendingCommitments = (isServerAuthoritative && serverPlayer && typeof serverPlayer.ventureCommitmentsValue === 'number')
        ? serverPlayer.ventureCommitmentsValue
        : (ventureSim ? ventureSim.getPendingCommitments(activePlayerId) : 0);
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

function liquidatePlayerAssets() {
    handlingBankruptcy = true;
    if (isServerAuthoritative) {
        sendCommand({ type: 'liquidate_assets' });
        // Optimistically clear local state so the UI reflects the reset immediately
        if (!serverPlayer) {
            serverPlayer = { id: clientPlayerId || 'player', holdings: {}, ventureHoldings: {}, ventureCommitments: {}, ventureCashInvested: {} };
        }
        serverPlayer.cash = 0;
        serverPlayer.debt = 0;
        serverPlayer.holdings = {};
        serverPlayer.ventureHoldings = {};
        serverPlayer.ventureCommitments = {};
        serverPlayer.ventureCashInvested = {};
        serverPlayer.netWorth = 0;
        serverPlayer.bankrupt = false;
    }
    // Fallback and local UI: wipe positions and debt, set balances to zero
    cash = 0;
    totalBorrowed = 0;
    portfolio = [];
    if (ventureSim && typeof ventureSim.resetPlayerHoldings === 'function') {
        ventureSim.resetPlayerHoldings();
    }
    updateNetWorth();
    updateDisplay();
    renderPortfolio();
}

function endGame(reason) {
    if (reason === "bankrupt") {
        handlingBankruptcy = true;
    }

    // Permanently end game state for singleplayer bankruptcy or timeline end
    if (!isServerAuthoritative || reason === "timeline_end") {
        gameEnded = true;
    }

    pauseGame();
    // Disable the speed slider to prevent restarting after game over
    if (speedSlider) {
        speedSlider.disabled = true;
    }
    let message = "";
    if (reason === "bankrupt") { message = "GAME OVER! You went bankrupt!"; }
    else if (reason === "timeline_end") { message = `Game Over! You reached ${GAME_END_YEAR}.`; }
    const finalNetWorth = (isServerAuthoritative && serverPlayer && typeof serverPlayer.netWorth === 'number')
        ? serverPlayer.netWorth
        : netWorth;
    const matchId = activeSessionId || (isServerAuthoritative ? 'multiplayer' : 'singleplayer_local');
    const endYear = currentDate instanceof Date ? currentDate.getFullYear() : null;
    const role = isServerAuthoritative
        ? ((isPartyHostClient || (clientPlayerId && currentHostId && clientPlayerId === currentHostId)) ? 'host' : 'guest')
        : 'solo';
    trackEvent('match_ended', {
        final_net_worth: finalNetWorth,
        reason: reason,
        mode: isServerAuthoritative ? 'multiplayer' : 'singleplayer',
        match_id: matchId,
        player_id: clientPlayerId || null,
        role,
        end_year: Number.isFinite(endYear) ? endYear : null
    });

    if (reason === "bankrupt") {
        // Show appropriate bankruptcy popup based on mode
        if (isServerAuthoritative) {
            liquidatePlayerAssets();
            // Multiplayer bankruptcy
            if (bankruptcyPopupMultiplayer) {
                bankruptcyPopupMultiplayer.classList.add('show');
            }
        } else {
            // Singleplayer bankruptcy
            if (bankruptcyPopup) {
                bankruptcyPopup.classList.add('show');
            }
        }
    } else if (reason === "timeline_end") {
        // Show timeline end popup
        if (timelineEndTitle) {
            timelineEndTitle.textContent = `You've reached ${GAME_END_YEAR}!`;
        }
        if (timelineEndWojak && wojakImage) {
            timelineEndWojak.src = wojakImage.src;
        }
        if (timelineEndAmount) {
            timelineEndAmount.textContent = currencyFormatter.format(finalNetWorth);
        }
        if (timelineEndPopup) {
            timelineEndPopup.classList.add('show');
        }
    }
}

function gameLoop() {
    if (gameEnded) return;
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
    if (document.body.classList.contains('vc-active')) {
        markVentureListingsSeen();
    } else {
        updateVentureBadge();
    }

    const bankruptNow = [];
    (sim?.companies || []).forEach(company => {
        if (company && company.bankrupt) {
            bankruptNow.push(company);
            if (!isServerAuthoritative) {
                scheduleLocalBankruptHoldingPurge(company);
            }
        }
    });
    if (bankruptNow.length) {
        markBankruptCompaniesForCleanup(bankruptNow);
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
    maybeTrackDecadeNetWorth(currentDate);
    updateDisplay();
    updateBankingDisplay();
    notifyBankruptcies(companies);
    renderPortfolio();
    netWorthChart.update();

    if (activeCompanyDetail && companyDetailChart) {
        // Update chart data for single-player live view
        if (Array.isArray(activeCompanyDetail.history)) {
            const history = [...activeCompanyDetail.history].filter(p => p && Number.isFinite(p.y) && typeof p.x !== 'undefined').sort((a, b) => (a.x || 0) - (b.x || 0));
            // Only update if we have valid history, or if we really want to clear it (e.g. new company)
            // But to prevent disappearing charts, we skip update if history is empty but we have existing data
            if (history.length > 0 || !companyDetailChart.data.datasets[0].data.length) {
                companyDetailChart.data.datasets[0].data = history;
                companyDetailChart.update('none');
            }
        } else {
            companyDetailChart.update();
        }
    } else if (companyDetailChart) {
        companyDetailChart.update();
    }

    if (activeCompanyDetail) {
        updateInvestmentPanelStats(activeCompanyDetail);

        // Always update pipeline to show live progress
        updatePipelineDisplay(activeCompanyDetail);
        activeCompanyDetail.hasPipelineUpdate = false;
    }
}

function buy(companyName, amount, opts = {}) {
    const { skipEmptyWarning = false } = opts || {};
    amount = parseUserAmount(amount);
    if (isNaN(amount) || amount <= 0) {
        if (!skipEmptyWarning) {
            showToast("Enter an amount to buy.", { tone: 'warn' });
        }
        return;
    }
    const company = companies.find(c => c.name === companyName);
    if (!company) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
        sendCommand({ type: 'buy', companyId: company.id, amount });
        return;
    }
    if (amount > cash) { return; }
    if (company.marketCap < 0.0001) { return; }
    cash -= amount;
    const unitsToBuy = amount / company.marketCap;
    let holding = portfolio.find(h => h.companyName === companyName);
    if (holding) { holding.unitsOwned += unitsToBuy; }
    else { portfolio.push({ companyName: companyName, unitsOwned: unitsToBuy }); }
    updateNetWorth(); updateDisplay(); renderPortfolio(); updateInvestmentPanel(company);
}

function sell(companyName, amount, opts = {}) {
    const { skipEmptyWarning = false } = opts || {};
    amount = parseFloat(amount);
    if (isNaN(amount) || amount <= 0) {
        if (!skipEmptyWarning) {
            showToast("Enter an amount to sell.", { tone: 'warn' });
        }
        return;
    }
    const company = companies.find(c => c.name === companyName);
    const holding = portfolio.find(h => h.companyName === companyName);
    if (!company || !holding) { return; }
    if (ws && ws.readyState === WebSocket.OPEN) {
        sendCommand({ type: 'sell', companyId: company.id, amount });
        return;
    }
    const currentValue = company.marketCap * holding.unitsOwned;
    if (amount > currentValue) { return; }
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
    if (ws && ws.readyState === WebSocket.OPEN && isServerAuthoritative) {
        sendCommand({ type: 'vc_lead', companyId });
        return { success: true, remote: true };
    }
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

    const investorId = clientPlayerId || 'local_player';
    const result = ventureSim.leadRound(companyId, investorId);
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
        const arrow = document.createElement('div');
        arrow.className = 'chartjs-tooltip-arrow';
        arrow.style.position = 'absolute';
        arrow.style.top = '-6px';
        arrow.style.left = '50%';
        arrow.style.transform = 'translateX(-50%)';
        arrow.style.width = '0';
        arrow.style.height = '0';
        arrow.style.borderLeft = '6px solid transparent';
        arrow.style.borderRight = '6px solid transparent';
        arrow.style.borderBottom = '6px solid #ffffff';
        const content = document.createElement('div');
        content.className = 'chartjs-tooltip-content';
        tooltipEl.appendChild(arrow);
        tooltipEl.appendChild(content);
        tooltipEl._content = content;
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

        const content = tooltipEl.querySelector('.chartjs-tooltip-content') || tooltipEl._content || tooltipEl;
        content.innerHTML = innerHtml;
    }

    const position = context.chart.canvas.getBoundingClientRect();
    const bodyFont = Chart.defaults.font;

    // Display, position, and set styles for font
    tooltipEl.style.opacity = 1;
    tooltipEl.style.position = 'absolute';
    const verticalOffset = 10;
    tooltipEl.style.left = position.left + window.pageXOffset + tooltipModel.caretX + 'px';
    tooltipEl.style.top = position.top + window.pageYOffset + tooltipModel.caretY + verticalOffset + 'px';
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
            { label: '25Y', value: 100 }
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

    const yoySeries = getCompanyYoySeries(company, currentChartRange);

    if (yoySeries.length === 0) {
        // Keep the last rendered chart if we have one; otherwise show a lightweight placeholder.
        if (!financialYoyChart) {
            chartWrapper.innerHTML = '<div class="chart-placeholder" style="padding:12px;color:#475569;">Waiting for financial data…</div>';
        }
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
        const desiredChartType = 'bar';

        if (financialYoyChart && financialYoyChart.config.type !== desiredChartType) {
            financialYoyChart.destroy();
            financialYoyChart = null;
        }

        const toProfitColor = (value) => {
            if (value === null || value === undefined || Number.isNaN(value)) return 'rgba(0,0,0,0)';
            return value >= 0 ? '#6de38a' : '#ff5b5b';
        };
        const profitColors = profitData.map(toProfitColor);
        const barCategoryPct = 0.8;
        const barPct = 0.9;
        const barRadius = 4;

        // Pad with empty data if few points to prevent "beeg spacing" (bar modes only)
        const minPoints = 20;
        if (labels.length < minPoints) {
            const missing = minPoints - labels.length;
            for (let i = 0; i < missing; i++) {
                labels.push('');
                revenueData.push(null);
                profitData.push(null);
                profitColors.push('rgba(0,0,0,0)');
            }
        }

        const revenueDataset = {
            label: 'Revenue (Trailing 12 Months)',
            data: revenueData,
            backgroundColor: '#635bff',
            borderRadius: barRadius,
            categoryPercentage: barCategoryPct,
            barPercentage: barPct,
            grouped: false,
            order: 1,
            maxBarThickness: 50
        };

        const profitDataset = {
            label: 'Profit (Trailing 12 Months)',
            data: profitData,
            backgroundColor: profitColors,
            borderRadius: barRadius,
            categoryPercentage: barCategoryPct,
            barPercentage: barPct,
            grouped: false,
            order: 0,
            maxBarThickness: 50
        };

        if (financialYoyChart) {
            financialYoyChart.data.labels = labels;
            financialYoyChart.data.datasets = [revenueDataset, profitDataset];

            // Ensure options are updated for interaction mode
            financialYoyChart.options.interaction = {
                mode: 'index',
                intersect: false,
            };
            financialYoyChart.update();
        } else {
            financialYoyChart = new Chart(canvas.getContext('2d'), {
                type: desiredChartType,
                data: {
                    labels,
                    datasets: [revenueDataset, profitDataset]
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
        : getCompanyFinancialTableHTML(company);
    tableWrapper.innerHTML = tableHtml;




    // Helper functions for financial data (Client-side implementation)
    function getCompanyYoySeries(company, limit = 8) {
        if (!Array.isArray(company.quarterHistory) || company.quarterHistory.length === 0) return [];
        const QUARTER_DAYS = 365 / 4; // ~91 days
        const ordered = company.quarterHistory.slice().sort((a, b) => {
            if (a.year === b.year) return a.quarter - b.quarter;
            return a.year - b.year;
        });

        const series = [];
        for (let i = 0; i < ordered.length; i++) {
            let revenue = 0;
            let profit = 0;
            const start = Math.max(0, i - 3);
            let count = 0;
            for (let j = start; j <= i; j++) {
                const q = ordered[j];
                // Scale partial quarters to full-quarter equivalents for display
                const days = q.days || QUARTER_DAYS;
                const scale = days < QUARTER_DAYS ? (QUARTER_DAYS / days) : 1;
                revenue += q.revenue * scale;
                profit += q.profit * scale;
                count++;
            }

            if (count > 0 && count < 4) {
                const multiplier = 4 / count;
                revenue *= multiplier;
                profit *= multiplier;
            }

            const curr = ordered[i];
            series.push({
                year: curr.year,
                quarter: curr.quarter,
                label: `${curr.year} Q${curr.quarter}`,
                revenue,
                profit
            });
        }

        if (limit > 0 && series.length > limit) {
            return series.slice(series.length - limit);
        }
        return series;
    }

}

function getCompanyFinancialTableHTML(company) {
    const data = company.financialHistory ? company.financialHistory.slice().reverse() : [];
    if (!data || data.length === 0) return '<p>No annual data available yet</p>';

    const fmtMoney = (v) => {
        const absV = Math.abs(v);
        let formatted;
        if (absV >= 1e12) formatted = `$${(absV / 1e12).toFixed(1)}T`;
        else if (absV >= 1e9) formatted = `$${(absV / 1e9).toFixed(1)}B`;
        else if (absV >= 1e6) formatted = `$${(absV / 1e6).toFixed(1)}M`;
        else if (absV >= 1e3) formatted = `$${(absV / 1e3).toFixed(1)}K`;
        else formatted = `$${absV.toFixed(0)}`;
        return v < 0 ? `-${formatted}` : formatted;
    };
    const fmtRat = (v) => (v === 0 || !isFinite(v)) ? 'N/A' : `${v.toFixed(1)}x`;
    const fmtYield = (dividend, marketCap) => {
        if (!marketCap || marketCap <= 0) return 'N/A';
        const yieldPct = 100 * dividend / marketCap;
        return `${yieldPct.toFixed(2)}%`;
    };

    const includeDividend = company.showDividendColumn !== false; // Default to true if undefined
    let html = `<div class="financial-table"><table><thead><tr><th>Year</th><th>Revenue</th><th>Profit</th><th>Cash</th><th>Debt</th>`;
    if (includeDividend) html += `<th>Dividend Yield</th>`;
    html += `<th>P/S</th><th>P/E</th></tr></thead><tbody>`;
    data.forEach(r => {
        html += `<tr><td>${r.year}</td><td>${fmtMoney(r.revenue)}</td><td>${fmtMoney(r.profit)}</td><td>${fmtMoney(r.cash || 0)}</td><td>${fmtMoney(r.debt || 0)}</td>`;
        if (includeDividend) {
            html += `<td>${fmtYield(r.dividend || 0, r.marketCap)}</td>`;
        }
        html += `<td>${fmtRat(r.ps)}</td><td>${fmtRat(r.pe)}</td></tr>`;
    });
    html += `</tbody></table></div>`;
    return html;
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

function renderCompanyMeta(company) {
    const founders = Array.isArray(company?.founders)
        ? company.founders
        : (Array.isArray(company?.static?.founders) ? company.static.founders : []);
    const mission = (company?.mission || company?.static?.mission || company?.description || '').trim();
    const foundingLocation = (company?.foundingLocation || company?.founding_location || company?.static?.founding_location || '').trim();
    const founderNames = founders.map(f => f && f.name).filter(Boolean);

    if (detailCompanyMission) {
        detailCompanyMission.textContent = mission;
        detailCompanyMission.style.display = mission ? 'block' : 'none';
    }
    if (detailCompanyFounders) {
        if (founderNames.length > 0) {
            let html = '<div class="detail-founders-label">Founders:</div>';
            founderNames.forEach(name => {
                html += `<div class="detail-founder-name">${name}</div>`;
            });
            detailCompanyFounders.innerHTML = html;
            detailCompanyFounders.style.display = 'flex';
        } else {
            detailCompanyFounders.innerHTML = '';
            detailCompanyFounders.style.display = 'none';
        }
    }
    if (detailCompanyLocation) {
        detailCompanyLocation.textContent = foundingLocation ? `Founded in ${foundingLocation}` : '';
        detailCompanyLocation.style.display = foundingLocation ? 'inline-flex' : 'none';
    }
    if (detailCompanyLocationBadge) {
        detailCompanyLocationBadge.textContent = foundingLocation || '';
        detailCompanyLocationBadge.style.display = foundingLocation ? 'inline-flex' : 'none';
    }
    const metaContainer = detailCompanyMission ? detailCompanyMission.parentElement : null;
    if (metaContainer) {
        const hasMeta = !!(mission || founderNames.length > 0 || foundingLocation);
        metaContainer.style.display = hasMeta ? 'block' : 'none';
    }
}

function showCompanyDetail(company, options = {}) {
    const { skipHistory = false } = options;
    activeCompanyDetail = company;
    bodyEl.classList.remove('vc-active');
    bodyEl.classList.remove('vc-detail-active');
    bodyEl.classList.add('detail-active');
    document.getElementById('detailCompanyName').textContent = company.name;
    document.getElementById('detailCompanySector').textContent = company.bankrupt ? 'Status: Bankrupt' : company.sector;
    renderCompanyMeta(company);
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
            transitions: {
                active: {
                    animation: { duration: 0 }
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

    if (!skipHistory && typeof pushViewState === 'function') {
        const companyId = company.id || company.name;
        pushViewState(VIEW_COMPANY, { companyId });
    }
}

function hideCompanyDetail(skipHistory = false) {
    activeCompanyDetail = null;
    bodyEl.classList.remove('detail-active');
    if (companyDetailChart) { companyDetailChart.destroy(); companyDetailChart = null; }
    destroyFinancialYoyChart();
    if (!skipHistory && typeof pushViewState === 'function') {
        pushViewState(VIEW_MARKET, {});
    }
}

function pauseGame() {
    if (isPaused) return;
    isPaused = true;
    clearInterval(gameInterval);
}

function resumeGame() {
    if (gameEnded) return;
    if (!isPaused) return;
    isPaused = false;
    wasAutoPaused = false;
    const targetSpeed = currentSpeed > 0 ? currentSpeed : 1;
    setGameSpeed(targetSpeed);
}

function setGameSpeed(speed) {
    // Prevent resuming if game ended
    if (gameEnded && speed > 0) return;
    const maxSpeed = Math.max(...SPEED_STEPS);
    const clampedSpeed = Math.max(0, Math.min(speed, maxSpeed));
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

function openVentureTab(options = {}) {
    const { skipHistory = false } = options;
    bodyEl.classList.add('vc-active');
    bodyEl.classList.remove('detail-active');
    hideCompanyDetail(true);
    ensureVentureSimulation();
    const summaries = typeof getVentureCompanySummaries === 'function' ? getVentureCompanySummaries() : ventureCompanies;
    renderVentureCompanies(
        summaries,
        formatLargeNumber,
        formatLargeNumber
    );
    markVentureListingsSeen();
    if (!skipHistory && typeof pushViewState === 'function') {
        pushViewState(VIEW_VC, {});
    }
}

function closeVentureTab(options = {}) {
    const { skipHistory = false } = options;
    if (typeof hideVentureCompanyDetail === 'function') {
        hideVentureCompanyDetail({ skipHistory: true });
    }
    bodyEl.classList.remove('vc-active');
    bodyEl.classList.remove('vc-detail-active');
    if (!skipHistory && typeof pushViewState === 'function') {
        pushViewState(VIEW_MARKET, {});
    }
}

function resolveCompanyFromBox(companyBox) {
    if (!companyBox) return null;
    const decode = (value = '') => {
        try { return decodeURIComponent(value); } catch (err) { return value || ''; }
    };
    const dataId = decode(companyBox.dataset.companyId || '');
    const companyName = decode(companyBox.dataset.companyName || '');
    const queueIdx = companyBox.dataset.companyQueue || '';
    let company = null;
    if (dataId) {
        company = companies.find(c => (c.id && c.id === dataId) || c.name === dataId);
    }
    if (!company && queueIdx) {
        company = companies.find(c => String(c.__queueIndex || '') === queueIdx);
    }
    if (!company && companyName) {
        company = companies.find(c => c.name === companyName);
    }
    if (!company) {
        const nameEl = companyBox.querySelector('.company-name');
        const fallbackName = nameEl ? nameEl.textContent : '';
        if (fallbackName) {
            company = companies.find(c => c.name === fallbackName);
        }
    }
    return company || null;
}

function openCompanyFromBox(companyBox) {
    const company = resolveCompanyFromBox(companyBox);
    if (company) {
        showCompanyDetail(company);
        return true;
    }
    return false;
}

let suppressNextCompanyClick = false;
let suppressCompanyClickUntil = 0;

// --- Event Listeners ---
// Handle company selection on pointerdown so tick-driven rerenders don't drop the click.
companiesGrid.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const companyBox = event.target.closest('.company-box');
    if (!companyBox) return;
    if (openCompanyFromBox(companyBox)) {
        suppressNextCompanyClick = true;
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        suppressCompanyClickUntil = now + 750;
    }
});

companiesGrid.addEventListener('click', (event) => {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (suppressNextCompanyClick && now > suppressCompanyClickUntil) {
        suppressNextCompanyClick = false;
        suppressCompanyClickUntil = 0;
    }
    if (suppressNextCompanyClick && now <= suppressCompanyClickUntil) {
        suppressNextCompanyClick = false;
        suppressCompanyClickUntil = 0;
        return;
    }
    const companyBox = event.target.closest('.company-box');
    if (!companyBox) return;
    openCompanyFromBox(companyBox);
});
backBtn.addEventListener('click', hideCompanyDetail);
buyBtn.addEventListener('click', () => { if (activeCompanyDetail) buy(activeCompanyDetail.name, investmentAmountInput.value); });
sellBtn.addEventListener('click', () => { if (activeCompanyDetail) sell(activeCompanyDetail.name, investmentAmountInput.value); });

// Bankruptcy popup (Singleplayer)
if (bankruptcyPlayAgainBtn) {
    bankruptcyPlayAgainBtn.addEventListener('click', () => {
        location.reload();
    });
}
if (bankruptcyCloseBtn) {
    bankruptcyCloseBtn.addEventListener('click', () => {
        if (bankruptcyPopup) {
            bankruptcyPopup.classList.remove('show');
        }
    });
}

// Bankruptcy popup (Multiplayer)
if (bankruptcyOkayBtn) {
    bankruptcyOkayBtn.addEventListener('click', () => {
        liquidatePlayerAssets();
        if (bankruptcyPopupMultiplayer) {
            bankruptcyPopupMultiplayer.classList.remove('show');
        }
    });
}
if (bankruptcyCloseBtnMultiplayer) {
    bankruptcyCloseBtnMultiplayer.addEventListener('click', () => {
        if (bankruptcyPopupMultiplayer) {
            bankruptcyPopupMultiplayer.classList.remove('show');
        }
    });
}

// Timeline End popup
if (timelineEndPlayAgainBtn) {
    timelineEndPlayAgainBtn.addEventListener('click', () => {
        location.reload();
    });
}
if (timelineEndCloseBtn) {
    timelineEndCloseBtn.addEventListener('click', () => {
        if (timelineEndPopup) {
            timelineEndPopup.classList.remove('show');
        }
    });
}

// Multiplayer End popup
if (multiplayerEndOkayBtn) {
    multiplayerEndOkayBtn.addEventListener('click', () => {
        location.reload();
    });
}
if (multiplayerEndCloseBtn) {
    multiplayerEndCloseBtn.addEventListener('click', () => {
        location.reload();
    });
}

// Buy Max: buy as much as possible with available cash
buyMaxBtn.addEventListener('click', () => {
    if (activeCompanyDetail) {
        const company = activeCompanyDetail;
        if (company.marketCap > 0.0001) {
            const availableCash = (isServerAuthoritative && serverPlayer) ? serverPlayer.cash : cash;
            buy(company.name, availableCash, { skipEmptyWarning: true });
        } else {
            // Silent ignore: too low valuation
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
            sell(company.name, currentValue, { skipEmptyWarning: true });
        } else {
            // Silent ignore: nothing to sell
        }
    }
});

function syncSpeedSliderBounds() {
    if (!speedSlider) return;
    const maxIdx = Math.max(SPEED_STEPS.length - 1, 0);
    speedSlider.max = String(maxIdx);
    const idx = SPEED_STEPS.indexOf(currentSpeed);
    const val = `${idx >= 0 ? idx : Math.min(maxIdx, SPEED_STEPS.length - 1)}`;
    speedSlider.value = val;
}

if (speedSlider) {
    syncSpeedSliderBounds();
    speedSlider.addEventListener('input', (event) => {
        const idx = Number(event.target.value) || 0;
        const clampedIdx = Math.max(0, Math.min(SPEED_STEPS.length - 1, idx));
        const nextSpeed = SPEED_STEPS[clampedIdx] ?? 1;
        setGameSpeed(nextSpeed);
    });

    // Detail View Controls
    const playPauseBtnDetail = document.getElementById('playPauseBtnDetail');
    if (playPauseBtnDetail) {
        playPauseBtnDetail.addEventListener('click', () => {
            if (currentSpeed > 0) {
                setGameSpeed(0);
            } else {
                setGameSpeed(1);
            }
        });
    }

    // VC Detail View Controls
    const playPauseBtnVcDetail = document.getElementById('playPauseBtnVcDetail');
    if (playPauseBtnVcDetail) {
        playPauseBtnVcDetail.addEventListener('click', () => {
            if (currentSpeed > 0) {
                setGameSpeed(0);
            } else {
                setGameSpeed(1);
            }
        });
    }

    const playPauseBtn = document.getElementById('playPauseBtn');
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', () => {
            if (currentSpeed > 0) {
                setGameSpeed(0);
            } else {
                setGameSpeed(1);
            }
        });
    }

    if (typeof speedSlider.value === 'string') {
        const initialIdx = SPEED_STEPS.indexOf(currentSpeed);
        const val = `${initialIdx >= 0 ? initialIdx : Math.min(3, SPEED_STEPS.length - 1)}`;
        speedSlider.value = val;
    }
    updateSpeedThumbLabel();
}

function updateSpeedThumbLabel() {
    const idx = SPEED_STEPS.indexOf(currentSpeed);
    const val = idx >= 0 ? idx : 1;

    // Helper to update a specific set of controls
    const updateControls = (slider, label, pauseIcon, playIcon, btn) => {
        if (slider && label) {
            slider.value = val; // Sync slider value

            const sliderMin = Number(slider.min) || 0;
            const sliderMax = Number(slider.max) || Math.max(SPEED_STEPS.length - 1, 1);
            const ratio = (val - sliderMin) / Math.max(1, sliderMax - sliderMin);
            const trackWidth = slider.clientWidth || 0;
            const thumbWidth = 16;
            const pos = ratio * Math.max(0, trackWidth - thumbWidth) + thumbWidth / 2;

            label.style.left = `${pos}px`;
            label.textContent = currentSpeed <= 0 ? 'Paused' : `${currentSpeed}x Speed`;
        }

        if (pauseIcon && playIcon && btn) {
            if (currentSpeed <= 0) {
                pauseIcon.style.display = 'none';
                playIcon.style.display = 'block';
                btn.title = "Play";
            } else {
                pauseIcon.style.display = 'block';
                playIcon.style.display = 'none';
                btn.title = "Pause";
            }
        }
    };

    // Main Controls
    updateControls(
        speedSlider,
        speedThumbLabel,
        document.getElementById('pauseIcon'),
        document.getElementById('playIcon'),
        document.getElementById('playPauseBtn')
    );

    // Detail View Controls (No slider/label)
    updateControls(
        null,
        null,
        document.getElementById('pauseIconDetail'),
        document.getElementById('playIconDetail'),
        document.getElementById('playPauseBtnDetail')
    );

    // VC Detail View Controls (No slider/label)
    updateControls(
        null,
        null,
        document.getElementById('pauseIconVcDetail'),
        document.getElementById('playIconVcDetail'),
        document.getElementById('playPauseBtnVcDetail')
    );
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
        showToast("You cannot borrow any more funds right now.", { tone: 'warn' });
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
        showToast("You have no debt to repay or no cash available.", { tone: 'warn' });
    }
});

bankingAmountInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter' && event.target === bankingAmountInput) {
        const amount = bankingAmountInput.value;
        if (amount) borrow(amount);
    }
});

vcBtn.addEventListener('click', () => {
    openVentureTab();
});

backToMainBtn.addEventListener('click', () => {
    if (typeof hideVentureCompanyDetail === 'function') {
        hideVentureCompanyDetail({ skipHistory: true });
    }
    closeVentureTab();
});

if (multiplayerBtn) multiplayerBtn.addEventListener('click', showMultiplayerModal);
if (closeMultiplayerBtn) closeMultiplayerBtn.addEventListener('click', hideMultiplayerModal);
if (multiplayerModal) {
    multiplayerModal.addEventListener('click', (event) => {
        if (event.target === multiplayerModal) hideMultiplayerModal();
    });
}
const ventureModal = document.getElementById('vc-view');
if (ventureModal) {
    ventureModal.addEventListener('click', (event) => {
        if (event.target === ventureModal) {
            closeVentureTab({ skipHistory: true });
        }
    });
}
const PARTY_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generatePartyCode() {
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += PARTY_CODE_CHARS.charAt(Math.floor(Math.random() * PARTY_CODE_CHARS.length));
    }
    return code;
}

function isValidPartyCode(code) {
    if (!code || typeof code !== 'string') return false;
    return /^[A-HJKMNPQRSTUVWXYZ2-9]{6}$/.test(code.trim().toUpperCase());
}

if (joinPartyBtn) {
    joinPartyBtn.addEventListener('click', () => {
        setMultiplayerState('join');
    });
}
if (confirmJoinPartyBtn) {
    confirmJoinPartyBtn.addEventListener('click', attemptJoinParty);
}
if (mpJoinCodeInput) {
    mpJoinCodeInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') attemptJoinParty();
    });
    mpJoinCodeInput.addEventListener('input', () => {
        if (mpJoinError) mpJoinError.classList.remove('visible');
    });
}
if (characterOptionButtons && characterOptionButtons.length) {
    characterOptionButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            selectedCharacter = btn.dataset.character || null;
            characterOptionButtons.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            hideCharacterOverlay();
            const action = pendingPartyAction;
            pendingPartyAction = null;
            if (typeof action === 'function') {
                action(selectedCharacter);
            }
            setLocalCharacterSelection(selectedCharacter);
        });
    });
}
if (characterCancelBtn) {
    characterCancelBtn.addEventListener('click', () => {
        if (characterCancelBtn.classList.contains('character-back-locked')) return;
        hideCharacterOverlay();
        pendingPartyAction = null;
    });
}
if (mpNameInput) {
    mpNameInput.addEventListener('input', () => {
        const value = (mpNameInput.value || '').trim();
        if (value && isNameTaken(value)) {
            mpNameInput.classList.add('input-error');
            setNameErrorVisible(true, 'Name taken');
        } else {
            mpNameInput.classList.remove('input-error');
            setNameErrorVisible(false);
        }
    });
    try { mpNameInput.setAttribute('maxlength', String(MAX_NAME_LENGTH)); } catch (err) { /* ignore */ }
}
if (createPartyBtn) {
    createPartyBtn.addEventListener('click', handleCreateParty);
}
if (copyPartyCodeBtn) {
    copyPartyCodeBtn.addEventListener('click', handleCopyPartyCode);
}
if (startPartyBtn) {
    startPartyBtn.addEventListener('click', handleStartParty);
}

window.leadVentureRound = leadVentureRound;
window.getVentureCompanyDetail = (companyId) => ventureSim ? ventureSim.getCompanyDetail(companyId) : null;
window.getVentureCompanySummaries = () => ventureSim ? ventureSim.getCompanySummaries() : [];
window.ensureVentureSimulation = ensureVentureSimulation;
window.markVentureListingsSeen = markVentureListingsSeen;
window.updateVentureBadge = updateVentureBadge;

setMillionaireBtn.addEventListener('click', () => {
    if (isServerAuthoritative) {
        sendCommand({ type: 'debug_set_cash', amount: 1000000 });
        return;
    }
    cash = 1000000;
    updateNetWorth();
    updateDisplay();
});

setBillionaireBtn.addEventListener('click', () => {
    if (isServerAuthoritative) {
        sendCommand({ type: 'debug_set_cash', amount: 1000000000 });
        return;
    }
    cash = 1000000000;
    updateNetWorth();
    updateDisplay();
});

setTrillionaireBtn.addEventListener('click', () => {
    if (isServerAuthoritative) {
        sendCommand({ type: 'debug_set_cash', amount: 1000000000000 });
        return;
    }
    cash = 1000000000000;
    updateNetWorth();
    updateDisplay();
});

function showMultiplayerModal() {
    if (!multiplayerModal) return;
    hideCharacterOverlay();
    resetMultiplayerModal();
    multiplayerModal.classList.add('active');
    startLobbyRefresh();
}

function hideMultiplayerModal() {
    if (!multiplayerModal) return;
    stopLobbyRefresh();
    multiplayerModal.classList.remove('active');
    hideCharacterOverlay();
}

// --- Initialization ---
async function init() {
    const sortCompaniesSelect = document.getElementById('sortCompanies');
    const filterCompaniesSelect = document.getElementById('filterCompanies');

    if (sortCompaniesSelect) {
        sortCompaniesSelect.value = currentSort;
        if (!Array.from(sortCompaniesSelect.options).some(opt => opt.value === currentSort)) {
            currentSort = 'ipoQueue';
            sortCompaniesSelect.value = currentSort;
        }
    }

    initHistoryNavigation();

    initMatchContext();
    resetDecadeTracking();
    activeBackendUrl = null;
    activeSessionId = isServerAuthoritative ? null : 'singleplayer_local';
    ensureConnectionBanner();
    setBannerButtonsVisible(false);
    setConnectionStatus('Offline', 'warn');
    if (!isServerAuthoritative) {
        sim = await loadCompaniesData();
        if (!sim) { return; }
        trackEvent('match_started', {
            mode: 'singleplayer',
            match_id: 'singleplayer_local',
            player_id: clientPlayerId || null
        });
    }

    // Apply avatar: default Wojak for local, saved selection for multiplayer.
    if (!isServerAuthoritative) {
        resetCharacterToDefault();
    } else if (selectedCharacter) {
        applySelectedCharacter({ character: selectedCharacter });
        if (ws && ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ type: 'set_character', character: selectedCharacter })); } catch (err) { /* ignore */ }
        }
    }

    if (sim && sim.companies) {
        companies = sim.companies;
    }
    if (!isServerAuthoritative) {
        maybeScheduleBankruptcyTest();
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
            const arrow = document.createElement('div');
            arrow.className = 'chartjs-tooltip-arrow';
            arrow.style.position = 'absolute';
            arrow.style.top = '-6px';
            arrow.style.left = '50%';
            arrow.style.transform = 'translateX(-50%)';
            arrow.style.width = '0';
            arrow.style.height = '0';
            arrow.style.borderLeft = '6px solid transparent';
            arrow.style.borderRight = '6px solid transparent';
            arrow.style.borderBottom = '6px solid #ffffff';
            const content = document.createElement('div');
            content.className = 'chartjs-tooltip-content';
            tooltipEl.appendChild(arrow);
            tooltipEl.appendChild(content);
            tooltipEl._content = content;
            document.body.appendChild(tooltipEl);
        }

        // Hide if no tooltip
        const tooltipModel = context.tooltip;
        if (tooltipModel.opacity === 0) {
            tooltipEl.style.opacity = 0;
            return;
        }

        // Set Text (show all players at the hover index)
        if (tooltipModel.body && tooltipModel.dataPoints && tooltipModel.dataPoints.length > 0) {
            const dataPoints = tooltipModel.dataPoints;
            const firstPoint = dataPoints[0];
            const ds = context.chart.data.datasets?.[firstPoint.datasetIndex];
            const point = ds && Array.isArray(ds.data) ? ds.data[firstPoint.dataIndex] : null;
            if (!point || typeof point.x === 'undefined') {
                tooltipEl.style.opacity = 0;
                return;
            }
            const date = new Date(point.x);
            const dateStr = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

            const rows = dataPoints.map(dp => {
                const dsRef = context.chart.data.datasets?.[dp.datasetIndex];
                const rawValue = dp.raw?.y ?? dp.parsed?.y ?? dp.raw ?? dp.parsed;
                const valueStr = currencyFormatter.format(rawValue);
                const color = Array.isArray(dsRef?.borderColor)
                    ? (dsRef.borderColor[0] || '#0f172a')
                    : (dsRef?.borderColor || '#0f172a');
                const label = dsRef?.label || 'Player';
                const avatarSrc = isServerAuthoritative ? getPlayerAvatarSrc(label) : null;
                const marker = !isServerAuthoritative ? '' : (avatarSrc
                    ? `<img src="${avatarSrc}" alt="${label}" style="width:18px; height:18px; border-radius:50%; object-fit:cover; display:inline-block;" />`
                    : `<span style="width:10px; height:10px; border-radius:50%; background:${color}; display:inline-block;"></span>`);
                const rowParts = marker ? [marker] : [];
                rowParts.push(
                    `<span style="flex:1; font-weight:600;">${label}:</span>`,
                    `<span style="font-weight:700; color:${color};">${valueStr}</span>`
                );
                return `<div style="display:flex; align-items:center; gap:8px; color:#0f172a; margin-top:4px;">${rowParts.join('')}</div>`;
            }).join('');

            const innerHtml = `
                <div style="margin-bottom: 4px; color: #1e293b; display: flex; align-items: center; gap: 4px;">
                    <span style="font-weight: 600;">Date:</span>
                    <span>${dateStr}</span>
                </div>
                ${rows}
            `;

            const content = tooltipEl.querySelector('.chartjs-tooltip-content') || tooltipEl._content || tooltipEl;
            content.innerHTML = innerHtml;
        }

        const position = context.chart.canvas.getBoundingClientRect();

        // Display, position, and set styles for font
        tooltipEl.style.opacity = 1;
        const verticalOffset = 10; // push tooltip slightly below the hover point
        tooltipEl.style.left = position.left + window.pageXOffset + tooltipModel.caretX + 'px';
        tooltipEl.style.top = position.top + window.pageYOffset + tooltipModel.caretY + verticalOffset + 'px';
    };

    if (netWorthChart && typeof netWorthChart.destroy === 'function') {
        netWorthChart.destroy();
    }
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
            transitions: {
                active: {
                    animation: { duration: 0 }
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

// init() is invoked by src/ui/bootstrap.js after DOM is ready.
