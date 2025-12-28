const fs = require('fs'); // Monte Carlo runner
const path = require('path');
const vm = require('vm');

// Avoid noisy crashes when piping output (e.g. `node scripts/monte_carlo.js | head`).
process.stdout.on('error', (err) => {
    if (err && err.code === 'EPIPE') process.exit(0);
});

// --- 1. Mock Browser/Global Environment ---

// Custom console to filter noise
const silencePatterns = [
    '[PMF LOSS TRIGGERED]',
    'SimShared and CompanyModule must load before' // startup noise
];

const mockConsole = {
    ...console,
    log: (...args) => {
        const str = args.map(a => String(a)).join(' ');
        if (silencePatterns.some(p => str.includes(p))) return;
        console.log(...args);
    },
    error: console.error,
    warn: console.warn
};

const mockGlobal = {
    console: mockConsole,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    Math: Math,
    Date: Date,
    Array: Array,
    Object: Object,
    Number: Number,
    String: String,
    Boolean: Boolean,
    Error: Error,
    JSON: JSON,
    parseInt: parseInt,
    parseFloat: parseFloat,
    isNaN: isNaN,
    isFinite: isFinite,
    Map: Map,
    Set: Set,
    WeakMap: WeakMap,
    WeakSet: WeakSet,
    Promise: Promise,
    Symbol: Symbol,
    RegExp: RegExp,
    window: {},
    document: {
        createElement: () => ({
            getContext: () => ({ /* fake canvas context */ }),
        })
    },
    require: function (moduleName) {
        if (moduleName === 'fs') return fs;
        if (moduleName === 'path') return path;
        throw new Error(`Module ${moduleName} not implemented in mock require`);
    }
};
mockGlobal.globalThis = mockGlobal;
mockGlobal.window = mockGlobal;
mockGlobal.self = mockGlobal;

const context = vm.createContext(mockGlobal);

function loadFile(filePath) {
    // We are in tests/ so we need to go up one level
    const fullPath = path.resolve(__dirname, '..', filePath);
    const code = fs.readFileSync(fullPath, 'utf8');
    vm.runInContext(code, context, { filename: filePath });
}

// --- 2. Load Modules ---

console.log('Loading modules...');
try {
    loadFile('src/sim/simShared.js');
    loadFile('src/sim/macroEvents.js');
    loadFile('src/sim/publicCompanies.js');
    loadFile('src/sim/ventureStrategies.js');
    loadFile('src/sim/ventureEngineCore.js');
    loadFile('src/sim/simEngine.js');
    loadFile('src/presets/presets.js');
} catch (e) {
    console.error("Error loading modules:", e);
    process.exit(1);
}

const CompanyModule = mockGlobal.CompanyModule;
const VentureEngineModule = mockGlobal.VentureEngineModule;
const PresetGenerators = mockGlobal.PresetGenerators;
const VentureCompany = mockGlobal.CompanyModule?.VentureCompany || mockGlobal.VentureEngineModule?.VentureCompany || mockGlobal.VentureCompany;
const Simulation = mockGlobal.Simulation;
const SimShared = mockGlobal.SimShared || {};
const { SeededRandom, withRandomSource } = SimShared;

if (!VentureCompany) {
    console.error("Could not find VentureCompany.");
    process.exit(1);
}
if (!Simulation) {
    console.error("Could not find Simulation.");
    process.exit(1);
}
if (!SeededRandom || !withRandomSource) {
    console.error("SimShared RNG utilities not available.");
    process.exit(1);
}

// --- 3. Simulation Configuration ---
const SIM_DAYS_PER_YEAR = 365;
const YEARS = [5, 10, 15, 20];
const ITERATIONS = 100;
const INVESTMENT_AMOUNT = 100_000;


// --- 4. Logic ---

async function runAll() {
    console.log(`Starting Simulation: ${ITERATIONS} runs per preset, tracking $${INVESTMENT_AMOUNT.toLocaleString()} investment.`);

    // Generator definitions: 
    // requiresCountArg means the function signature is (count, options) instead of (options).
    const generators = [
        { name: 'Hypergrowth', fn: 'generateHypergrowthPresetCompanies', dataPath: 'data/presets/hypergrowth.json', requiresCountArg: false },
        { name: 'HardTech (Binary)', fn: 'generateBinaryHardTechCompanies', dataPath: 'data/presets/hard_tech.json', requiresCountArg: true },
        { name: 'HardTech (Public Biotech)', fn: 'generatePublicHardTechPresetCompanies', dataPath: 'data/presets/hard_tech.json', requiresCountArg: true },
    ];

    const results = {};

    for (const gen of generators) {
        if (!PresetGenerators[gen.fn]) {
            console.log(`Skipping ${gen.name} - generator not found.`);
            continue;
        }

        console.log(`\nGathering configs for ${gen.name}...`);

        let configs = [];
        const opts = { forceNode: true, baseDir: process.cwd() };

        if (gen.requiresCountArg) {
            configs = await PresetGenerators[gen.fn](null, opts);
        } else {
            configs = await PresetGenerators[gen.fn](opts);
        }

        if (!configs || configs.length === 0) {
            console.log("No configs returned.");
            continue;
        }

        console.log(`Found ${configs.length} distinct templates in ${gen.name}. Running ${ITERATIONS} sims for each...`);

        for (const config of configs) {
            const label = config.name || config.id;

            const outcomes = {
                5: [], 10: [], 15: [], 20: []
            };

            for (let i = 0; i < ITERATIONS; i++) {
                const outcome = runSingleSimulation(config, INVESTMENT_AMOUNT, i);
                if (outcome) {
                    YEARS.forEach(y => {
                        outcomes[y].push(outcome[y] || 0);
                    });
                }
            }

            const stats = {};
            YEARS.forEach(y => {
                const values = outcomes[y].sort((a, b) => a - b);

                // Helper for percentiles
                const getPercentile = (p) => {
                    if (values.length === 0) return 0;
                    const idx = Math.floor((values.length - 1) * (p / 100));
                    return values[Math.max(0, Math.min(values.length - 1, idx))];
                };

                const sum = values.reduce((a, b) => a + b, 0);
                const avg = values.length > 0 ? sum / values.length : 0;

                stats[y] = {
                    avg,
                    p10: getPercentile(10),
                    p25: getPercentile(25),
                    p50: getPercentile(50),
                    p75: getPercentile(75),
                    p90: getPercentile(90)
                };
            });

            if (!results[gen.name]) results[gen.name] = [];
            results[gen.name].push({ name: label, stats });
        }
    }

    printResults(results);
}


function makeSeed(config, iterationIndex = 0) {
    const label = (config && (config.id || config.name)) || 'config';
    const str = `${label}:${iterationIndex}`;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function isPublicCompanyConfig(config) {
    return !!(config && config.static && typeof config.static === 'object' && config.base_business);
}

function runSingleSimulation(config, investmentAmount, iterationIndex = 0) {
    const seed = makeSeed(config, iterationIndex);
    const prng = new SeededRandom(seed);
    const rngFn = () => prng.random();

    return withRandomSource(rngFn, () => {
        if (isPublicCompanyConfig(config)) {
            return runSinglePublicCompanySimulation(config, investmentAmount, seed, rngFn);
        }
        return runSingleVentureSimulation(config, investmentAmount, seed, rngFn);
    });
}

function runSinglePublicCompanySimulation(config, investmentAmount, seed, rngFn) {
    const startYear = 2024;
    const cfgCopy = JSON.parse(JSON.stringify(config));

    const simOptions = {
        startYear,
        dt: 14,
        macroEvents: [],
        seed,
        rng: rngFn
    };
    // Force IPO at startYear so the investment horizon is consistent.
    cfgCopy.static = cfgCopy.static || {};
    cfgCopy.static.ipo_instantly = true;
    cfgCopy.static.ipo_window = { from: startYear, to: startYear };

    const sim = new Simulation([cfgCopy], simOptions);
    const company = sim.companies && sim.companies[0];
    if (!company || !(company.marketCap > 0)) {
        return { 5: 0, 10: 0, 15: 0, 20: 0 };
    }

    const investedUnits = investmentAmount / company.marketCap;
    const maxYears = 20;
    const tickDays = 14;
    let currentDays = 0;
    const results = {};

    for (let year = 1; year <= maxYears; year++) {
        const daysInYear = 365;
        let daysSimulated = 0;
        while (daysSimulated < daysInYear) {
            const dt = Math.min(tickDays, daysInYear - daysSimulated);
            const currentDate = new Date(startYear, 0, 1);
            currentDate.setDate(currentDate.getDate() + currentDays);
            sim.tick(currentDate);
            currentDays += dt;
            daysSimulated += dt;
        }

        if (YEARS.includes(year)) {
            const cap = Number(company.marketCap) || 0;
            const val = cap * investedUnits;
            results[year] = val;
        }
    }

    return results;
}

function runSingleVentureSimulation(config, investmentAmount, seed, rngFn) {
    const startYear = 2024;
    const cfgCopy = JSON.parse(JSON.stringify(config));

    // Public-market simulation (used once a venture IPOs)
    const simOptions = {
        startYear,
        dt: 14,
        macroEvents: [],
        seed,
        rng: rngFn
    };
    const sim = new Simulation([], simOptions);

    const co = new VentureCompany(cfgCopy, new Date(`${startYear}-01-01`), rngFn);

    // Invest at seed (always-seed behavior preserved)
    if (!co.currentRound) {
        return { 5: 0, 10: 0, 15: 0, 20: 0 };
    }

    const round = co.currentRound;
    const preMoney = round.preMoney || 1_000_000;
    const raiseAmount = round.raiseAmount || 500_000;
    const postMoney = preMoney + raiseAmount;
    const targetEquity = investmentAmount / postMoney;

    // commitInvestment expects equity fraction
    const commitres = co.commitInvestment(targetEquity, 'p1');
    if (!commitres || !commitres.success) {
        return { 5: 0, 10: 0, 15: 0, 20: 0 };
    }

    const actualInvested = commitres.amount;

    // Loop
    const maxYears = 20;
    const tickDays = 14;
    let currentDays = 0;
    let adoptedToPublic = false;

    const results = {};

    for (let year = 1; year <= maxYears; year++) {
        const isDead = co.status === 'failed' || co.bankrupt;
        if (isDead) {
            if (YEARS.includes(year)) results[year] = 0;
            continue; // still need to fill other years
        }

        const daysInYear = 365;
        let daysSimulated = 0;

        while (daysSimulated < daysInYear) {
            const dt = Math.min(tickDays, daysInYear - daysSimulated);
            const currentDate = new Date(startYear, 0, 1);
            currentDate.setDate(currentDate.getDate() + currentDays);

            if (co.status === 'failed' || co.bankrupt) break;

            if (!adoptedToPublic) {
                const events = co.advance(dt, currentDate) || [];
                const ipoEvent = events.find(e => e && e.type === 'venture_ipo');
                if (ipoEvent && !adoptedToPublic && typeof sim.adoptVentureCompany === 'function') {
                    sim.adoptVentureCompany(co, currentDate);
                    adoptedToPublic = true;
                }
            } else {
                sim.tick(currentDate);
            }

            currentDays += dt;
            daysSimulated += dt;
        }

        if (YEARS.includes(year)) {
            let val = 0;
            const stillAlive = !(co.status === 'failed' || co.bankrupt);
            if (stillAlive) {
                if (typeof co.getPlayerValuation === 'function') {
                    val = co.getPlayerValuation('p1') || 0;
                } else {
                    const equity = (co.playerEquityMap && co.playerEquityMap['p1']) || 0;
                    const baseVal = co.marketCap || co.currentValuation || 0;
                    val = equity * baseVal;
                }
            }
            const multiple = actualInvested > 0 ? (val / actualInvested) : 0;
            results[year] = multiple * investmentAmount;
        }
    }

    return results;
}

function printResults(results) {
    console.log("\nSimulated Results (Approximate Returns on $100k):");
    console.log("Category | Company | Year | Avg EV | 10th | 25th | 50th (Median) | 75th | 90th");
    console.log(":--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---");

    const fmt = (n) => "$" + Math.round(n).toLocaleString();

    for (const [category, items] of Object.entries(results)) {
        for (const item of items) {
            [5, 10, 15, 20].forEach(year => {
                const s = item.stats[year];
                const row = [
                    category,
                    item.name,
                    year + "yr",
                    fmt(s.avg),
                    fmt(s.p10),
                    fmt(s.p25),
                    fmt(s.p50),
                    fmt(s.p75),
                    fmt(s.p90)
                ];
                console.log(row.join(" | "));
            });
            console.log("- | - | - | - | - | - | - | - | -");
        }
    }
}

runAll();
