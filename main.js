// --- DOM Elements ---
const bodyEl = document.body;
const netWorthDisplay = document.getElementById('netWorthDisplay');
const currentDateDisplay = document.getElementById('currentDateDisplay');
const companiesGrid = document.getElementById('companiesGrid');

const togglePauseBtn = document.getElementById('togglePauseBtn');
const speedBtns = { half: document.getElementById('halfSpeedBtn'), normal: document.getElementById('normalSpeedBtn'), double: document.getElementById('doubleSpeedBtn'), quad: document.getElementById('quadSpeedBtn'), octo: document.getElementById('octoSpeedBtn') };
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
const buyMaxBtn = document.getElementById('buyMaxBtn');
const sellMaxBtn = document.getElementById('sellMaxBtn');
const vcBtn = document.getElementById('vcBtn');
const vcView = document.getElementById('vc-view');
const backToMainBtn = document.getElementById('back-to-main-btn');
const dripToggle = document.getElementById('dripToggle');

// --- Helper utilities ---
const randBetween = (min, max) => Math.random() * (max - min) + min;
const randIntBetween = (min, max) => Math.floor(randBetween(min, max));

const riskyBiotechRoster = [
    {
        name: 'Helixor Biosystems',
        founders: [
            { name: 'Dr. Sahana Patel', degree: 'PhD', school: 'MIT' },
            { name: 'Dr. Kai Nakamura', degree: 'PhD', school: 'Tokyo University' }
        ],
        ipo_window: { from: 1990, to: 1991 }
    },
    {
        name: 'NeuroVance Therapeutics',
        founders: [
            { name: 'Dr. Elise Carver', degree: 'MD', school: 'Johns Hopkins' },
            { name: 'Dr. Malik Hassan', degree: 'PhD', school: 'Oxford' }
        ],
        ipo_window: { from: 1991, to: 1992 }
    },
    {
        name: 'OptiGene BioPharma',
        founders: [
            { name: 'Dr. Lucia Romero', degree: 'PhD', school: 'Stanford' },
            { name: 'Dr. Noah Bernstein', degree: 'MD', school: 'Harvard' }
        ],
        ipo_window: { from: 1992, to: 1993 }
    }
];

const riskyBiotechPipelineTemplate = [
    {
        id: 'pan_cancer_immunotherapy',
        label: 'Pan-cancer Immunotherapy',
        full_revenue_usd: 40_000_000_000,
        stages: [
            { id: 'phase_1', name: 'Phase 1 Trials', duration_days: 730, success_prob: 0.26, value_realization: 0.15, cost_usd: 120_000_000, max_retries: 2 },
            { id: 'phase_2', name: 'Phase 2 Trials', duration_days: 1095, depends_on: 'phase_1', success_prob: 0.41, value_realization: 0.3, cost_usd: 220_000_000, max_retries: 2 },
            { id: 'phase_3', name: 'Phase 3 Trials', duration_days: 1460, depends_on: 'phase_2', success_prob: 0.58, value_realization: 0.4, cost_usd: 380_000_000, max_retries: 1 },
            { id: 'fda_review', name: 'FDA Review', duration_days: 365, depends_on: 'phase_3', success_prob: 0.78, value_realization: 0.15, cost_usd: 110_000_000, max_retries: 1, commercialises_revenue: true }
        ]
    }
];

const cloneBiotechPipeline = (scale = 1, prefix = '') => {
    return riskyBiotechPipelineTemplate.map(entry => ({
        id: `${prefix || entry.id}`,
        label: entry.label,
        full_revenue_usd: Math.round(entry.full_revenue_usd * scale),
        stages: entry.stages.map(stage => ({ ...stage }))
    }));
};

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateRiskyBiotechCompanies(count = 1) {
    const roster = [...riskyBiotechRoster];
    const picked = [];
    while (picked.length < count && roster.length > 0) {
        const idx = Math.floor(Math.random() * roster.length);
        picked.push(roster.splice(idx, 1)[0]);
    }
    const companies = [];
    picked.forEach((entry, i) => {
        const name = entry.name || `Biotech Innovator ${i + 1}`;
        const founders = (entry.founders || []).map(f => ({ ...f }));
        const id = `preset_bio_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}_${i}`;
        const initialRevenueMin = randBetween(1_000_000, 5_000_000);
        const initialRevenueMax = initialRevenueMin * randBetween(4, 8);
        const ipoYear = entry.ipo_window ? randIntBetween(entry.ipo_window.from, entry.ipo_window.to) : randIntBetween(1990, 1993);
        const company = {
            id,
            static: {
                name,
                sector: 'Biotech',
                founders,
                ipo_window: entry.ipo_window || { from: ipoYear, to: ipoYear },
                ipo_instantly: true
            },
            sentiment: {
                structural_bias: { min: 0.2, max: 6, half_life_years: 25 }
            },
            base_business: {
                revenue_process: {
                    initial_revenue_usd: {
                        min: initialRevenueMin,
                        max: initialRevenueMax
                    }
                },
                margin_curve: {
                    start_profit_margin: randBetween(0.08, 0.15),
                    terminal_profit_margin: randBetween(0.5, 0.7),
                    years_to_mature: randBetween(10, 14)
                },
                multiple_curve: {
                    initial_ps_ratio: randBetween(28, 45),
                    terminal_pe_ratio: randBetween(16, 22),
                    years_to_converge: randBetween(8, 12)
                }
            },
            finance: {},
            pipeline: cloneBiotechPipeline(randBetween(0.75, 1.25), `${id}_pipeline`),
            events: []
        };
        companies.push(company);
    });
    return companies;
}

const megacorpRoster = [
    {
        name: 'SmartCart Holdings',
        founders: [{ name: 'Linda Harris', degree: 'MBA', school: 'Harvard' }],
        sector: 'Retail',
        ipo_window: { from: 1979, to: 1981 }
    },
    {
        name: 'UrbanShop Group',
        founders: [{ name: 'Marco Viteri', degree: 'MBA', school: 'Columbia' }],
        sector: 'Consumer Staples',
        ipo_window: { from: 1981, to: 1983 }
    },
    {
        name: 'GlobalMart Logistics',
        founders: [{ name: 'Sandra Osei', degree: 'MBA', school: 'Wharton' }],
        sector: 'Retail',
        ipo_window: { from: 1980, to: 1982 }
    }
];

function generateSteadyMegacorpCompanies(count = 1) {
    const roster = [...megacorpRoster];
    const picked = [];
    while (picked.length < count && roster.length > 0) {
        const idx = Math.floor(Math.random() * roster.length);
        picked.push(roster.splice(idx, 1)[0]);
    }
    const companies = [];
    picked.forEach((entry, i) => {
        const name = entry.name || `MegaMart ${i + 1}`;
        const founders = (entry.founders || []).map(f => ({ ...f }));
        const id = `preset_megacorp_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}_${i}`;
        const baseRevenue = randBetween(60_000_000_000, 200_000_000_000);
        const ipoRange = entry.ipo_window || { from: 1980, to: 1985 };
        const company = {
            id,
            static: {
                name,
                sector: entry.sector || 'Retail',
                founders,
                ipo_window: ipoRange,
                ipo_instantly: true
            },
            sentiment: {
                structural_bias: { min: 0.5, max: 3, half_life_years: 15 }
            },
            base_business: {
                revenue_process: {
                    initial_revenue_usd: {
                        min: baseRevenue * 0.8,
                        max: baseRevenue * 1.2
                    }
                },
                margin_curve: {
                    start_profit_margin: randBetween(0.025, 0.04),
                    terminal_profit_margin: randBetween(0.05, 0.08),
                    years_to_mature: randBetween(7, 10)
                },
                multiple_curve: {
                    initial_ps_ratio: randBetween(0.7, 1.1),
                    terminal_pe_ratio: randBetween(12, 15),
                    years_to_converge: randBetween(6, 9)
                }
            },
            finance: {
                starting_cash_usd: baseRevenue * 0.03,
                starting_debt_usd: baseRevenue * 0.05,
                interest_rate_annual: 0.05
            },
        pipeline: [],
        events: []
        };
        companies.push(company);
    });
    return companies;
}

function generateHypergrowthPresetCompanies() {
    const companies = [];
    const names = ['ViaWave', 'LinkPulse', 'HyperLoom'];
    names.forEach((name, idx) => {
        const valuation = randBetween(6_000_000, 18_000_000);
        companies.push({
            id: `preset_web_vc_${idx}_${Date.now()}`,
            name,
            sector: 'Web',
            description: '1990s hypergrowth web preset (private)',
            valuation_usd: valuation,
            funding_round: 'Seed',
            ipo_stage: 'series_f',
            binary_success: false,
            gate_stage: 'series_c',
            hypergrowth_window_years: randBetween(2, 4),
            hypergrowth_total_multiplier: randBetween(6, 12),
            long_run_revenue_ceiling_usd: valuation * randBetween(20, 40),
            long_run_growth_rate: randBetween(0.45, 0.7),
            long_run_growth_floor: randBetween(0.08, 0.18),
            long_run_growth_decay: randBetween(0.25, 0.5),
            post_gate_initial_multiple: randBetween(12, 20),
            post_gate_baseline_multiple: randBetween(4, 7),
            post_gate_multiple_decay_years: randBetween(5, 9),
            post_gate_margin: randBetween(0.18, 0.3),
            max_failures_before_collapse: 2
        });
    });
    return companies;
}

const hardTechRoster = [
    {
        name: 'Apex Fusion Works',
        sector: 'Energy',
        description: 'Building compact fusion cores for terrestrial grids.',
        funding_round: 'Series B',
        gate_stage: 'series_f'
    },
    {
        name: 'Odin Launch Systems',
        sector: 'Aerospace',
        description: 'Reusable heavy-lift platform for deep space industry.',
        funding_round: 'Series C',
        gate_stage: 'series_f'
    },
    {
        name: 'NeuraForge Interfaces',
        sector: 'BioTech',
        description: 'High-bandwidth BMI hardware for clinical and defense.',
        funding_round: 'Series B',
        gate_stage: 'series_e'
    }
];

const hardTechPipelineTemplate = [
    {
        id: 'deeptech_flagship',
        label: 'Flagship Hard-Tech Program',
        full_revenue_usd: 30_000_000_000,
        stages: [
            { id: 'concept_validation', name: 'Concept Validation', duration_days: 720, success_prob: 0.55, value_realization: 0.1, cost_usd: 120_000_000, max_retries: 2 },
            { id: 'prototype_build', name: 'Prototype Build', duration_days: 900, depends_on: 'concept_validation', success_prob: 0.5, value_realization: 0.2, cost_usd: 180_000_000, max_retries: 2 },
            { id: 'pilot_demo', name: 'Pilot Demonstration', duration_days: 720, depends_on: 'prototype_build', success_prob: 0.6, value_realization: 0.25, cost_usd: 220_000_000, max_retries: 1 },
            { id: 'regulatory_clearance', name: 'Regulatory Clearance', duration_days: 540, depends_on: 'pilot_demo', success_prob: 0.7, value_realization: 0.25, cost_usd: 150_000_000, max_retries: 1 },
            { id: 'commercial_ramp', name: 'Commercial Ramp', duration_days: 540, depends_on: 'regulatory_clearance', success_prob: 0.85, value_realization: 0.2, cost_usd: 120_000_000, max_retries: 1, commercialises_revenue: true }
        ]
    }
];

const cloneHardTechPipeline = (scale = 1, prefix = '') => {
    return hardTechPipelineTemplate.map(entry => ({
        id: prefix ? `${prefix}_${entry.id}` : entry.id,
        label: entry.label,
        full_revenue_usd: Math.round(entry.full_revenue_usd * scale),
        stages: entry.stages.map(stage => ({ ...stage }))
    }));
};

function generateBinaryHardTechCompanies(count = 1) {
    const roster = [...hardTechRoster];
    const companies = [];
    while (companies.length < count && roster.length > 0) {
        const idx = Math.floor(Math.random() * roster.length);
        const entry = roster.splice(idx, 1)[0];
        const valuation = randBetween(15_000_000, 40_000_000);
        const id = `preset_hardtech_${entry.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}_${companies.length}`;
        const pipelineScale = randBetween(0.8, 1.4);
        const pipelineIdPrefix = `${id}_binary`;
        const pipeline = cloneHardTechPipeline(pipelineScale, pipelineIdPrefix);
        const initialRevenue = randBetween(2_000_000, 6_000_000);
        const baseBusiness = {
            revenue_process: {
                initial_revenue_usd: {
                    min: initialRevenue * 0.7,
                    max: initialRevenue * 1.4
                }
            },
            margin_curve: {
                start_profit_margin: randBetween(-1.4, -0.6),
                terminal_profit_margin: randBetween(0.18, 0.32),
                years_to_mature: randBetween(9, 14)
            },
            multiple_curve: {
                initial_ps_ratio: randBetween(14, 22),
                terminal_pe_ratio: randBetween(20, 30),
                years_to_converge: randBetween(10, 14)
            }
        };
        const finance = {
            starting_cash_usd: initialRevenue * randBetween(6, 12),
            starting_debt_usd: 0,
            interest_rate_annual: 0.06
        };
        const costs = {
            opex_fixed_usd: randBetween(30_000_000, 60_000_000),
            opex_variable_ratio: randBetween(0.18, 0.32),
            rd_base_ratio: randBetween(0.05, 0.1)
        };
        companies.push({
            id,
            name: entry.name,
            sector: entry.sector || 'Deep Tech',
            description: entry.description || 'Binary hard-tech preset (private)',
            valuation_usd: valuation,
            funding_round: entry.funding_round || 'Series B',
            ipo_stage: 'pre_ipo',
            binary_success: true,
            archetype: 'hardtech',
            gate_stage: entry.gate_stage || 'series_f',
            hypergrowth_window_years: randBetween(1.5, 3.5),
            hypergrowth_total_multiplier: randBetween(10, 25),
            long_run_revenue_ceiling_usd: valuation * randBetween(35, 70),
            long_run_growth_rate: randBetween(0.25, 0.45),
            long_run_growth_floor: randBetween(0.05, 0.12),
            long_run_growth_decay: randBetween(0.08, 0.2),
            post_gate_initial_multiple: randBetween(10, 16),
            post_gate_baseline_multiple: randBetween(4, 8),
            post_gate_multiple_decay_years: randBetween(6, 11),
            post_gate_margin: randBetween(0.2, 0.35),
            max_failures_before_collapse: 1,
            base_business: baseBusiness,
            finance,
            costs,
            pipeline
        });
    }
    return companies;
}

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
let companyQueueCounter = 0;

function ensureVentureSimulation(force = false) {
    if ((force || !ventureSim) && typeof VentureSimulation !== 'undefined' && ventureCompanies.length > 0) {
        ventureSim = new VentureSimulation(ventureCompanies, currentDate);
        window.ventureSim = ventureSim;
    }
}

async function loadCompaniesData() {
    try {
        const [companiesResponse, ventureCompaniesResponse] = await Promise.all([
            fetch('data/companies.json'),
            fetch('data/venture_companies.json')
        ]);

        if (!companiesResponse.ok) { throw new Error(`HTTP error! status: ${companiesResponse.status} for companies.json`); }
        if (!ventureCompaniesResponse.ok) { throw new Error(`HTTP error! status: ${ventureCompaniesResponse.status} for venture_companies.json`); }

        const rawCompanies = await companiesResponse.json();
        ventureCompanies = await ventureCompaniesResponse.json();
        if (!Array.isArray(ventureCompanies)) ventureCompanies = [];
        let filteredCompanies = rawCompanies.filter(cfg => !cfg.experimental);
        const presetBiotechCompanies = generateRiskyBiotechCompanies(3);
        filteredCompanies.push(...presetBiotechCompanies);
        const presetMegacorpCompanies = generateSteadyMegacorpCompanies(2);
        filteredCompanies.push(...presetMegacorpCompanies);
        const presetVentureCompanies = generateHypergrowthPresetCompanies();
        ventureCompanies.push(...presetVentureCompanies);
        const hardTechCompanies = generateBinaryHardTechCompanies(1);
        ventureCompanies.push(...hardTechCompanies);
        ensureVentureSimulation(true);
        return new Simulation(filteredCompanies);
    } catch (error) {
        console.error("Could not load data:", error);
        alert("Failed to load game data. Please ensure JSON files are in the same directory and a local server is running.");
        return null;
    }
}

// --- Chart Objects ---
let netWorthChart, companyDetailChart;

// --- Formatting ---
const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
function formatLargeNumber(num) {
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    if (absNum >= 1e12) return `${sign}$${(absNum / 1e12).toFixed(2)}T`;
    if (absNum >= 1e9) return `${sign}$${(absNum / 1e9).toFixed(2)}B`;
    if (absNum >= 1e6) return `${sign}$${(absNum / 1e6).toFixed(2)}M`;
    if (absNum >= 1e3) return `${sign}$${(absNum / 1e3).toFixed(1)}K`;
    return currencyFormatter.format(num);
}
function formatDate(date) { return date.toISOString().split('T')[0]; }

// --- Rendering ---
let lastCompanyRenderTs = 0;
const COMPANIES_RENDER_MIN_INTERVAL = 500; // ms
let hoveredCompanyName = null;

function ensureCompanyQueueIndex(company) {
    if (!company) return;
    if (company.__queueIndex == null) {
        company.__queueIndex = companyQueueCounter++;
    }
}
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
    const equityValue = publicAssets + privateAssets;
    const totalAssets = cash + equityValue - pendingCommitments;
    
    netWorthDisplay.textContent = currencyFormatter.format(netWorth);
    netWorthDisplay.style.color = netWorth >= 0 ? '#00c742' : '#dc3545';
    currentDateDisplay.textContent = formatDate(currentDate);
    
    // Update the single display line
    const displayCash = Math.max(0, cash);
    const commitmentsLabel = pendingCommitments > 0 ? ` | Commitments: ${currencyFormatter.format(-pendingCommitments)}` : '';
    subFinancialDisplay.textContent = `Equities: ${currencyFormatter.format(equityValue)} | Cash: ${currencyFormatter.format(displayCash)}${commitmentsLabel} | Liabilities: ${currencyFormatter.format(totalBorrowed)}`;
    
    if (netWorth < 0 && totalBorrowed > 0) {
        endGame("bankrupt");
    }
}

function renderCompanies(force = false) {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (!force && (now - lastCompanyRenderTs) < COMPANIES_RENDER_MIN_INTERVAL) {
        return;
    }
    lastCompanyRenderTs = now;
    (companies || []).forEach(ensureCompanyQueueIndex);
    let filteredCompanies = [...companies];

    if (currentFilter !== 'all') {
        if (currentFilter.startsWith('sector_')) {
            const sector = currentFilter.substring(7);
            filteredCompanies = filteredCompanies.filter(c => c.sector === sector);
        }
    }

    if (currentSort === 'marketCapDesc') {
        filteredCompanies.sort((a, b) => b.marketCap - a.marketCap);
    } else if (currentSort === 'ipoDateDesc') {
        filteredCompanies.sort((a, b) => b.ipoDate.getTime() - a.ipoDate.getTime());
    } else if (currentSort === 'ipoQueue') {
        filteredCompanies.sort((a, b) => {
            ensureCompanyQueueIndex(a);
            ensureCompanyQueueIndex(b);
            return (a.__queueIndex || 0) - (b.__queueIndex || 0);
        });
    }

    companiesGrid.innerHTML = filteredCompanies.map(company => {
        const boxClass = company.bankrupt ? 'company-box bankrupt' : 'company-box';
        const capLabel = company.bankrupt ? 'Cap: Bankrupt' : `Cap: ${formatLargeNumber(company.displayCap)}`;
        const sectorLabel = company.bankrupt ? 'Status: Bankrupt' : company.sector;
        return `
        <div class="${boxClass}" data-company-name="${company.name}">
            <div class="company-name">${company.name}</div>
            <div class="company-info">
                <div class="company-valuation" data-company-cap="${company.name}">${capLabel}</div>
                <div class="company-sector">${sectorLabel}</div>
            </div>
        </div>`;
    }).join('');

    const boxes = companiesGrid.querySelectorAll('.company-box');
    boxes.forEach((box) => {
        const name = box.getAttribute('data-company-name');
        if (hoveredCompanyName === name) {
            box.classList.add('hovered');
        }
        box.addEventListener('pointerenter', () => {
            hoveredCompanyName = name;
            box.classList.add('hovered');
        });
        box.addEventListener('pointerleave', () => {
            if (hoveredCompanyName === name) hoveredCompanyName = null;
            box.classList.remove('hovered');
        });
    });
}

function renderPortfolio() {
    const hasPublicHoldings = portfolio.length > 0;
    const ventureSummaries = ventureSim ? ventureSim.getCompanySummaries() : [];
    const hasPrivateHoldings = ventureSummaries.some(summary => {
        if (!summary) return false;
        const detail = ventureSim.getCompanyDetail(summary.id);
        if (!detail) return false;
        return (detail.playerEquity || 0) > 0 || (detail.pendingCommitment || 0) > 0;
    });
    if (!hasPublicHoldings && !hasPrivateHoldings) {
        portfolioList.innerHTML = '';
        emptyPortfolioMsg.style.display = 'block';
        return;
    }
    emptyPortfolioMsg.style.display = 'none';

    const existingItems = new Map();
    portfolioList.querySelectorAll('.portfolio-item').forEach(item => {
        const key = item.dataset.portfolioKey || item.querySelector('.company-name').textContent;
        existingItems.set(key, item);
    });

    const newPortfolioHtml = [];
    portfolio.forEach(holding => {
        const company = companies.find(c => c.name === holding.companyName);
        if (!company) return;

        const currentValue = company.marketCap * holding.unitsOwned;
        const formattedValue = currencyFormatter.format(currentValue);
        const key = `public:${holding.companyName}`;

        if (existingItems.has(key)) {
            // Update existing item
            const item = existingItems.get(key);
            item.querySelector('.portfolio-value').textContent = formattedValue;
            existingItems.delete(key);
        } else {
            // Create new item
            newPortfolioHtml.push(`
                <div class="portfolio-item" data-portfolio-type="public" data-portfolio-key="${key}">
                    <div class="company-name">${holding.companyName}</div>
                    <div class="portfolio-info">
                        Value: <span class="portfolio-value">${formattedValue}</span>
                    </div>
                </div>
            `);
        }
    });

    ventureSummaries.forEach(summary => {
        if (!summary) return;
        const detail = ventureSim.getCompanyDetail(summary.id);
        if (!detail) return;
        const hasEquity = (detail.playerEquity || 0) > 0;
        const pendingCommitment = detail.pendingCommitment || 0;
        const hasPending = pendingCommitment > 0;
        if (!hasEquity && !hasPending) return;
        const equityValue = hasEquity ? detail.playerEquity * detail.valuation : 0;
        const formattedValue = hasEquity ? currencyFormatter.format(equityValue) : '';
        const pendingLabel = hasPending ? `Pending: ${currencyFormatter.format(pendingCommitment)}` : '';
        const key = `private:${summary.id}`;
        const stakeLabel = hasEquity ? `${detail.playerEquityPercent.toFixed(2)}% stake` : 'Stake pending';
        if (existingItems.has(key)) {
            const item = existingItems.get(key);
            const valueRow = item.querySelector('.portfolio-value-row');
            if (valueRow) valueRow.style.display = hasEquity ? 'block' : 'none';
            const valueEl = item.querySelector('.portfolio-value');
            if (valueEl) valueEl.textContent = formattedValue;
            const stakeEl = item.querySelector('.portfolio-stake');
            if (stakeEl) stakeEl.textContent = stakeLabel;
            const pendingEl = item.querySelector('.portfolio-pending');
            if (pendingEl) {
                pendingEl.textContent = pendingLabel;
                pendingEl.style.display = hasPending ? 'block' : 'none';
            }
            existingItems.delete(key);
        } else {
            const stageLabel = detail.stageLabel || summary.stageLabel || 'Private';
            newPortfolioHtml.push(`
                <div class="portfolio-item" data-portfolio-type="private" data-venture-id="${summary.id}" data-portfolio-key="${key}">
                    <div class="company-name">${summary.name} (${stageLabel})</div>
                    <div class="portfolio-info">
                        <div class="portfolio-value-row" style="display:${hasEquity ? 'block' : 'none'}">
                            Value: <span class="portfolio-value">${formattedValue}</span>
                        </div>
                        <span class="portfolio-stake">${stakeLabel}</span>
                        <span class="portfolio-pending" style="display:${hasPending ? 'block' : 'none'}">${pendingLabel}</span>
                    </div>
                </div>
            `);
        }
    });

    if (newPortfolioHtml.length > 0) {
        portfolioList.insertAdjacentHTML('beforeend', newPortfolioHtml.join(''));
    }

    if (existingItems.size > 0) {
        existingItems.forEach(item => {
            item.remove();
        });
    }
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
    let totalHoldingsValue = portfolio.reduce((sum, holding) => {
        const company = companies.find(c => c.name === holding.companyName);
        return sum + (company ? company.marketCap * holding.unitsOwned : 0);
    }, 0);
    const ventureHoldingsValue = ventureSim ? ventureSim.getPlayerHoldingsValue() : 0;
    const pendingCommitments = ventureSim ? ventureSim.getPendingCommitments() : 0;
    netWorth = cash + totalHoldingsValue + ventureHoldingsValue - pendingCommitments - totalBorrowed;
    netWorthHistory.push({ x: currentDate.getTime(), y: netWorth });
    if (netWorthHistory.length > 2000) netWorthHistory.shift();

    if (netWorth >= 1000000 && !isMillionaire) {
        isMillionaire = true; 
        wojakImage.src = 'wojaks/suit-wojak.png';
        jsConfetti.addConfetti({ emojis: ['💰', '💵'], confettiNumber: 150, emojiSize: 30, });
    }
    if (netWorth >=  1000000000  && !isBillionaire) {
        isBillionaire = true;
        wojakImage.src = 'wojaks/red-suit-wojak.png';
        jsConfetti.addConfetti({ emojis: ['💎','📀'], confettiNumber: 40, emojiSize: 40, });
    }
    if (netWorth >= 1000000000000 && !isTrillionaire) {
        isTrillionaire = true;
        wojakImage.src = 'wojaks/purple-suit-wojak.png';
        jsConfetti.addConfetti({ emojis: ['🌌','🥇','🔮'], confettiNumber: 100, emojiSize: 30, });
        setTimeout(() => { jsConfetti.addConfetti({ emojis: ['🌌','🥇','🔮'], confettiNumber: 100, emojiSize: 30, }); }, 1000); 
        setTimeout(() => { jsConfetti.addConfetti({ emojis: ['🌌','🥇','🔮'], confettiNumber: 100, emojiSize: 30, }); }, 2000); 
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
    // netWorth is already cash + portfolio - totalBorrowed
    return Math.max(0, netWorth * 5 - totalBorrowed);
}

function borrow(amount) {
    amount = parseUserAmount(amount);
    if (isNaN(amount) || amount <= 0) { alert("Please enter a valid amount to borrow."); return; }
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
    if (amount > totalBorrowed) { alert(`You only owe ${currencyFormatter.format(totalBorrowed)}.`); return; }
    if (amount > cash) { alert("You don't have enough cash to repay this amount."); return; }
    totalBorrowed -= amount;
    cash -= amount;
    lastInterestDate = new Date(currentDate); // Reset interest timer on repay
    updateNetWorth(); updateDisplay(); updateBankingDisplay(); bankingAmountInput.value = '';
}

function updateBankingDisplay() {
    const maxBorrowing = getMaxBorrowing();
    bankingCashDisplay.textContent = currencyFormatter.format(cash);
    bankingCashDisplay.className = `stat-value ${cash >= 0 ? 'positive' : 'negative'}`;
    let totalAssets = cash;
    portfolio.forEach(holding => {
        const company = companies.find(c => c.name === holding.companyName);
        if (company) { totalAssets += company.marketCap * holding.unitsOwned; }
    });
    const privateAssets = ventureSim ? ventureSim.getPlayerHoldingsValue() : 0;
    totalAssets += privateAssets;
    bankingNetWorthDisplay.textContent = currencyFormatter.format(totalAssets);
    bankingNetWorthDisplay.className = `stat-value positive`;
    currentDebtDisplay.textContent = currencyFormatter.format(totalBorrowed);
    currentDebtDisplay.className = `stat-value ${totalBorrowed > 0 ? 'negative' : 'positive'}`;
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
    
    if (activeCompanyDetail && activeCompanyDetail.newAnnualData) {
        document.getElementById('financialHistoryContainer').innerHTML = activeCompanyDetail.getFinancialTableHTML();
        activeCompanyDetail.newAnnualData = false;
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

function updateInvestmentPanelStats(company) {
    playerCashDisplay.textContent = currencyFormatter.format(cash);
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
    companyDetailChart = new Chart(ctx, {
        type: 'line', data: { datasets: [{ label: 'Market Cap', data: company.history, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 2, pointRadius: 0, tension: 0.1, fill: true }]},
        options: { responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, plugins: { legend: { display: false } }, scales: { x: { type: 'time', time: { unit: 'year' } }, y: { ticks: { callback: value => formatLargeNumber(value) } } } }
    });
    document.getElementById('financialHistoryContainer').innerHTML = company.getFinancialTableHTML();
    updatePipelineDisplay(company); // Draw pipeline on view
}

function hideCompanyDetail() {
    activeCompanyDetail = null;
    bodyEl.classList.remove('detail-active');
    if (companyDetailChart) { companyDetailChart.destroy(); companyDetailChart = null; }
}

function pauseGame() {
    if (isPaused) return; 
    isPaused = true;
    clearInterval(gameInterval);
    togglePauseBtn.textContent = 'Resume';
}

function resumeGame() {
    if (!isPaused) return; 
    isPaused = false;
    wasAutoPaused = false; 
    setGameSpeed(currentSpeed);
    togglePauseBtn.textContent = 'Pause';
}

function setGameSpeed(speed) {
    currentSpeed = speed;
    if (!isPaused) {
        clearInterval(gameInterval);
        gameInterval = setInterval(gameLoop, 400 / speed);
    }
    Object.values(speedBtns).forEach(btn => btn.classList.remove('speed-active'));
    if (speed === 0.5) speedBtns.half.classList.add('speed-active');
    if (speed === 1) speedBtns.normal.classList.add('speed-active');
    if (speed === 2) speedBtns.double.classList.add('speed-active');
    if (speed === 4) speedBtns.quad.classList.add('speed-active');
    if (speed === 8) speedBtns.octo.classList.add('speed-active');
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
            buy(company.name, cash);
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

togglePauseBtn.addEventListener('click', () => { 
    if (isPaused) {
        resumeGame();
    } else {
        wasAutoPaused = false;
        pauseGame();
    }
});

speedBtns.half.addEventListener('click', () => setGameSpeed(0.5));
speedBtns.normal.addEventListener('click', () => setGameSpeed(1));
speedBtns.double.addEventListener('click', () => setGameSpeed(2));
speedBtns.quad.addEventListener('click', () => setGameSpeed(4));
speedBtns.octo.addEventListener('click', () => setGameSpeed(8));



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

bankBtn.addEventListener('click', showBankingModal);
closeBankingBtn.addEventListener('click', hideBankingModal);
bankingModal.addEventListener('click', (event) => {
    if (event.target === bankingModal) hideBankingModal();
});
borrowBtn.addEventListener('click', () => borrow(bankingAmountInput.value));
repayBtn.addEventListener('click', () => repay(bankingAmountInput.value));
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

function getPipelineHTML(company) {
    let html = '<h3 class="investment-title">Product Pipeline</h3>';

    if (!company.products || company.products.length === 0) {
        html += '<div class="no-pipeline">No product pipeline for this company</div>';
        return html;
    }
    
    company.products.forEach(product => {
        html += `<div class="pipeline-section">
                    <h4 class="product-name-label">${product.label}</h4>
                    <div class="pipeline">`;
        
        let lastStageSucceeded = true;

        product.stages.forEach((stage, index) => {
            let stageClass = 'incomplete';
            let nodeContent = index + 1;

            if (stage.completed) {
                if (stage.succeeded) {
                    stageClass = 'completed';
                    nodeContent = '✓';
                } else {
                    stageClass = 'failed';
                    nodeContent = 'X';
                    lastStageSucceeded = false;
                    // Set a fail timeout if not already set
                    if (!product.resultFailTimeout) {
                        product.resultFailTimeout = Date.now() + 10000;
                        // Schedule a re-render after 10 seconds
                        setTimeout(() => { updatePipelineDisplay(company); }, 10000);
                    }
                }
            } else if (lastStageSucceeded) {
                const done = new Set(product.stages.filter(s => s.completed && s.succeeded).map(s => s.id));
                const canStart = !stage.depends_on || done.has(stage.depends_on);
                if (canStart) {
                    if (typeof stage.success_prob !== 'undefined' && stage.success_prob < 1) {
                        // Orange, pulsing, question mark
                        stageClass = 'completed current current-uncertain';
                        nodeContent = '?';
                    } else if (typeof stage.success_prob !== 'undefined' && stage.success_prob === 1) {
                        // Green, pulsing, stage number
                        stageClass = 'completed current';
                        nodeContent = index + 1;
                    } else {
                        // Default: blue, pulsing, stage number (fallback)
                        stageClass = 'incomplete current';
                        nodeContent = index + 1;
                    }
                }
            }
            
            html += `
                <div class="stage ${stageClass}">
                    <div class="stage-node">${nodeContent}</div>
                    <div class="stage-label">${stage.name}</div>
                </div>
            `;
            
            if (index < product.stages.length - 1) {
                let connectorClass = 'incomplete';
                if (stage.completed) {
                    connectorClass = stage.succeeded ? 'completed' : 'failed';
                }
                html += `<div class="connector ${connectorClass}"></div>`;
            }
        });
        
        // If product failed and 10s have passed, show only 'Result: fail'
        // if (
        //     product.stages.some(s => s.completed && !s.succeeded) &&
        //     product.resultFailTimeout && Date.now() > product.resultFailTimeout
        // ) {
        //     html = `<div class="pipeline-section"><h4 class="product-name-label">${product.label}</h4><div class="pipeline" style="min-height:60px;display:flex;align-items:center;justify-content:center;"><span style="font-size:1.3em;color:#dc3545;font-weight:600;">Result: fail</span></div></div>`;
        // } else {
            html += '</div></div>';
        // }
    });
    
    return html;
}
window.getPipelineHTML = getPipelineHTML;

function updatePipelineDisplay(company) {
    const container = document.getElementById('pipelineContainer');
    if (container) {
        container.innerHTML = getPipelineHTML(company);
    }
}

// --- Initialization ---
async function init() {
    const sortCompaniesSelect = document.getElementById('sortCompanies');
    const filterCompaniesSelect = document.getElementById('filterCompanies');

    if (sortCompaniesSelect) {
        sortCompaniesSelect.value = currentSort;
    }

    sim = await loadCompaniesData();
    if (!sim) { return; }
    companies = sim.companies;

    netWorthChart = new Chart(document.getElementById('netWorthChart').getContext('2d'), {
        type: 'line', data: { datasets: [{ label: 'Net Worth', data: netWorthHistory, borderColor: '#00c742', backgroundColor: 'rgba(0, 199, 66, 0.1)', borderWidth: 2, pointRadius: 0, tension: 0.4, fill: true }] },
        options: { responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, plugins: { legend: { display: false } }, scales: { x: { type: 'time', time: { unit: 'year' } }, y: { ticks: { callback: value => formatLargeNumber(value) } } } }
    });

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
        try {
            localStorage.setItem(DRIP_STORAGE_KEY, dripEnabled);
        } catch (err) {
            console.warn('Unable to store DRIP setting:', err);
        }
    });
}
