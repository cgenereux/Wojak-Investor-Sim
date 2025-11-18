/*────────────────── Random helper ──────────────────*/
class Random {
  // standard normal via Box–Muller
  static gaussian () {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

const SIM_DAY_MS = 24 * 60 * 60 * 1000;

/*──────────────────── Utilities ────────────────────*/
const lerp    = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
const between = (lo, hi)   => lo + Math.random() * (hi - lo);

/*────────────────── Parameter curves ──────────────*/
class MarginCurve {
  constructor (s, t, y) { this.s = s; this.t = t; this.y = Math.max(0.01, y); }
  value (x) { return lerp(this.s, this.t, x / this.y); }
}
class MultipleCurve {
  constructor (ps, pe, y) { this.ps = ps; this.pe = pe; this.y = Math.max(0.01, y); }
  value (x, margin) { return lerp(this.ps, this.pe * margin, x / this.y); }
}

/*──────────────── Sector-dependent micro volatility & drift ──────*/
const sectorMicro = {
  Biotech:       { mu: +0.02, sigma: 0.35 },
  Semiconductor: { mu: +0.04, sigma: 0.30 },
  Retail:        { mu: +0.01, sigma: 0.15 },
  DEFAULT:       { mu: +0.02, sigma: 0.20 }
};

/*──────────────── Sector margin presets ─────────────────────────*/
const sectorMargin = {
  Biotech:        0.25,
  Semiconductor:  0.18,
  Tech:           0.22,
  Retail:         0.06,
  DEFAULT:        0.15
};

/*──────────────── Macro environment (one index per sector) ──────*/
class MacroEnvironment {
  constructor (sectorsSet) {
    // Primitive defaults; extend / externalise whenever you wish
    this.defaultParams = {
      mu: 0.06,         // long-run real growth
      sigma: 0.15
    };
    // Example hand-tuned sector overrides
    this.sectorPresets = {
      Biotech:        { mu: 0.08, sigma: 0.25 },
      Semiconductor:  { mu: 0.10, sigma: 0.30 },
      Tech:           { mu: 0.12, sigma: 0.22 },
      Retail:         { mu: 0.04, sigma: 0.10 }
    };

    this.idxs = {};
    sectorsSet.forEach(sec => {
      const p = this.sectorPresets[sec] || this.defaultParams;
      this.idxs[sec] = {
        value: 1,
        mu:    p.mu,
        sigma: p.sigma
      };
    });

    if (!this.idxs['DEFAULT']) {
      this.idxs['DEFAULT'] = {
        value: 1,
        mu: this.defaultParams.mu,
        sigma: this.defaultParams.sigma
      };
    }

    // placeholder for future global macro events
    this.events = []; // not used yet
  }

  step (dtYears) {
    Object.values(this.idxs).forEach(idx => {
      idx.value *= Math.exp(
        (idx.mu - 0.5 * idx.sigma * idx.sigma) * dtYears +
        idx.sigma * Math.sqrt(dtYears) * Random.gaussian()
      );
    });
  }

  ensureSector (sector) {
    if (!sector) return;
    if (!this.idxs[sector]) {
      const p = this.sectorPresets[sector] || this.defaultParams;
      this.idxs[sector] = {
        value: 1,
        mu: p.mu,
        sigma: p.sigma
      };
    }
  }

  getValue (sector) {
    this.ensureSector(sector);
    const entry = this.idxs[sector] || this.idxs['DEFAULT'] || { value: 1 };
    return entry.value;
  }
  getMu    (sector) {
    this.ensureSector(sector);
    const entry = this.idxs[sector] || this.idxs['DEFAULT'] || { mu: this.defaultParams.mu };
    return entry.mu;
  }
}

/*──────────────── Stage & Product ──────────────────*/
class Stage {
  constructor (c) {
    Object.assign(this, c);
    this.commercialises_revenue = !!c.commercialises_revenue; // <-- NEW
    this.cost = c.cost_usd || 0;
    this.max_retries = c.max_retries ?? 0;
    this.tries = 0;
    this.elapsed   = 0;
    this.completed = false;
    this.succeeded = false;
  }
  canStart (done) { return !this.completed && (!this.depends_on || done.has(this.depends_on)); }
  advance (dt, rng, company, prod) {
    if (this.completed) return;

    // burn R&D cash while the stage is running
    company.rdOpex += this.cost * dt / 365;

    this.elapsed += dt;
    if (this.elapsed < this.duration_days) return;

    // reached the decision point
    this.tries++;
    const hit = rng() < this.success_prob;
    if (hit || this.tries > this.max_retries) {
      this.completed = true;          // success or no retries left
    } else {
      // retry: reset the clock
      this.elapsed = 0;
    }
    this.succeeded = hit;
    company.hasPipelineUpdate = true;
  }
}
class Product {
  constructor (c) {
    this.label   = c.label || c.id;
    this.fullVal = c.full_revenue_usd;    // peak annual sales if 100 % unlocked
    this.stages  = c.stages.map(s => new Stage(s));
  }

  unlockedValue () {
    let factor = 0;
    for (const st of this.stages) {
      if (!st.completed) break;
      if (!st.succeeded) { factor = 0; break; }
      factor += st.value_realization;
    }
    return this.fullVal * factor;
  }

  isCommercialised () {
    return this.stages.some(
      s => s.commercialises_revenue && s.completed && s.succeeded
    );
  }

  realisedRevenuePerYear () { return this.isCommercialised() ? this.fullVal : 0; }

  expectedValue () {
    let probAcc  = 1;
    let exp      = 0;
    for (const st of this.stages) {
      if (st.completed && st.succeeded) continue;
      probAcc *= st.success_prob;
      exp = this.fullVal * probAcc;    // last stage's expected value
    }
    return exp * 0.25;  // haircut for time & discounting
  }

  advance (dt, rng, company) {
    const done = new Set(this.stages.filter(s => s.completed && s.succeeded).map(s => s.id));
    this.stages.forEach(st => { if (st.canStart(done)) st.advance(dt, rng, company, this.label); });
  }

  get hasMarket  () { return this.isCommercialised(); }
  get hasFailure () { return this.stages.some(s => s.completed && !s.succeeded); }
}

/*────────────────── Events & effects (unchanged) ────────────────*/
class TimedEffect {
  constructor (c) {
    this.t    = c.type;
    this.v    = c.value_usd || c.multiplier || c.value;
    this.left = c.duration_days || 0;
  }
  apply  (co) {
    switch (this.t) {
      case 'cash_fine':                  co.cash    -= this.v; break;
      case 'revenue_multiplier':         co.revMult *= this.v; break;
      case 'volatility_multiplier':      co.volMult *= this.v; break; // now → micro vol
      case 'flat_revenue_reduction_usd': co.flatRev += this.v; break;
    }
  }
  revert (co) {
    switch (this.t) {
      case 'revenue_multiplier':         co.revMult /= this.v; break;
      case 'volatility_multiplier':      co.volMult /= this.v; break;
      case 'flat_revenue_reduction_usd': co.flatRev -= this.v; break;
    }
  }
}
class ScheduledEvent {
  constructor (c) {
    this.desc     = c.description;
    this.rate     = c.trigger_prob_per_year;
    this.tpl      = c.effects.map(e => new TimedEffect(e));
    this.cool     = 365;
    this.coolLeft = 0;
  }
  maybe (dt, co) {
    if (this.coolLeft > 0) { this.coolLeft -= dt; return []; }
    if (Math.random() < this.rate * dt / 365) {
      this.coolLeft = this.cool;
      // clone effects
      return this.tpl.map(e => Object.assign(Object.create(Object.getPrototypeOf(e)), e));
    }
    return [];
  }
}

/*────────────────── Shared Company Base ─────────────────────*/
class BaseCompany {
  constructor (cfg, macroEnv, gameStartYear = 1990, ipoDate = new Date(gameStartYear,0,1)) {
    this.id      = cfg.id;
    this.name    = (cfg.static && cfg.static.name) || 'Company';
    this.sector  = (cfg.static && cfg.static.sector) || 'General';
    this.ipoDate = ipoDate;
    this.fromVenture = !!cfg.fromVenture;
    this.macroEnv = macroEnv;

    this.startYear = gameStartYear;
    this.ageDays = 0;
    this.history = [];
    this.financialHistory = [];
    this.currentYearRevenue = 0;
    this.currentYearProfit = 0;
    this.lastYearEnd = 0;
    this.newAnnualData = false;
    this.bankrupt = false;

    this.cash = 0;
    this.debt = 0;
    this.marketCap = 0;
    this.displayCap = 0;

    this.showDividendColumn = false;
  }

  accumulateYear(revenueIncrement, profitIncrement) {
    this.currentYearRevenue += revenueIncrement;
    this.currentYearProfit  += profitIncrement;
  }

  maybeRecordAnnual(dividend = 0) {
    const curYear = Math.floor(this.ageDays / 365);
    const lastYear = Math.floor(this.lastYearEnd / 365);
    if (curYear > lastYear && this.ageDays >= 365) {
      const ps = this.currentYearRevenue > 0 ? this.marketCap / this.currentYearRevenue : 0;
      const pe = this.currentYearProfit > 0 ? this.marketCap / this.currentYearProfit : 0;
      const yearStamp = this.ipoDate.getFullYear() + lastYear;
      this.financialHistory.push({
        year: yearStamp,
        revenue: this.currentYearRevenue,
        profit: this.currentYearProfit,
        marketCap: this.marketCap,
        cash: this.cash,
        debt: this.debt,
        dividend,
        ps,
        pe
      });
      if (this.financialHistory.length > 10) this.financialHistory.shift();
      this.currentYearRevenue = 0;
      this.currentYearProfit = 0;
      this.newAnnualData = true;
      this.lastYearEnd = this.ageDays;
      return true;
    }
    this.lastYearEnd = this.ageDays;
    return false;
  }

  recordHistoryPoint(gameDate, value = this.marketCap) {
    const stamp = gameDate.getTime();
    const last = this.history[this.history.length - 1];
    if (!last || last.x !== stamp) {
      this.history.push({ x: stamp, y: value });
    } else {
      last.y = value;
    }
  }

  markBankrupt(gameDate) {
    this.marketCap = 0;
    this.displayCap = 0;
    this.bankrupt = true;
    this.recordHistoryPoint(gameDate, 0);
  }

  getFinancialTable() {
    if (this.financialHistory.length === 0) return null;
    return this.financialHistory.slice().reverse();
  }

  getFinancialTableHTML() {
    const data = this.getFinancialTable();
    if (!data || data.length === 0) return '<p>No annual data available yet</p>';
    const fmtMoney = (v) => {
      const absV = Math.abs(v);
      let formatted;
      if (absV >= 1e12) formatted = `$${(absV/1e12).toFixed(1)}T`;
      else if (absV >= 1e9)  formatted = `$${(absV/1e9).toFixed(1)}B`;
      else if (absV >= 1e6)  formatted = `$${(absV/1e6).toFixed(1)}M`;
      else if (absV >= 1e3)  formatted = `$${(absV/1e3).toFixed(1)}K`;
      else formatted = `$${absV.toFixed(0)}`;
      return v < 0 ? `-${formatted}` : formatted;
    };
    const fmtRat = (v) => (v === 0 || !isFinite(v)) ? 'N/A' : `${v.toFixed(1)}x`;
    const fmtYield = (dividend, marketCap) => {
      if (!marketCap || marketCap <= 0) return 'N/A';
      const yieldPct = 100 * dividend / marketCap;
      return `${yieldPct.toFixed(2)}%`;
    };
    const includeDividend = this.showDividendColumn;
    let html = `<div class="financial-table"><h3>Financial History</h3><table><thead><tr><th>Year</th><th>Revenue</th><th>Profit</th><th>Cash</th><th>Debt</th>`;
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
}

class PhaseCompany extends BaseCompany {
  constructor(cfg, macroEnv, gameStartYear = 1990, ipoDate = new Date(gameStartYear,0,1), initialPhase = 'public') {
    super(cfg, macroEnv, gameStartYear, ipoDate);
    this.phase = initialPhase;
    this.phaseMetadata = {};
  }

  setPhase(nextPhase, extras = {}) {
    this.phase = nextPhase || this.phase;
    if (extras && typeof extras === 'object') {
      this.phaseMetadata = Object.assign({}, this.phaseMetadata, extras);
    }
  }

  getPhase() {
    return this.phase;
  }

  get isPrivatePhase() {
    return this.phase === 'private';
  }

  get isPublicPhase() {
    return this.phase === 'public';
  }
}
/*────────────────── Venture / Private stage config ──────────*/
const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));
const VC_DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365;
const QUARTER_DAYS = DAYS_PER_YEAR / 4;
const YEAR_MS = VC_DAY_MS * DAYS_PER_YEAR;

const VC_STAGE_CONFIG = [
  { id: 'seed',      label: 'Seed',      successProb: 0.92, preMoneyMultiplier: [1.6, 2.3], raiseFraction: [0.20, 0.35], monthsToNextRound: [10, 16] },
  { id: 'series_a',  label: 'Series A',  successProb: 0.88, preMoneyMultiplier: [1.5, 2.2], raiseFraction: [0.20, 0.32], monthsToNextRound: [10, 16] },
  { id: 'series_b',  label: 'Series B',  successProb: 0.84, preMoneyMultiplier: [1.4, 2.0], raiseFraction: [0.18, 0.28], monthsToNextRound: [12, 18] },
  { id: 'series_c',  label: 'Series C',  successProb: 0.80, preMoneyMultiplier: [1.3, 1.9], raiseFraction: [0.16, 0.24], monthsToNextRound: [14, 20] },
  { id: 'series_d',  label: 'Series D',  successProb: 0.78, preMoneyMultiplier: [1.25, 1.8], raiseFraction: [0.14, 0.22], monthsToNextRound: [14, 20] },
  { id: 'series_e',  label: 'Series E',  successProb: 0.76, preMoneyMultiplier: [1.2, 1.7], raiseFraction: [0.12, 0.2], monthsToNextRound: [14, 20] },
  { id: 'series_f',  label: 'Series F',  successProb: 0.74, preMoneyMultiplier: [1.15, 1.6], raiseFraction: [0.1, 0.18], monthsToNextRound: [14, 20] },
  { id: 'pre_ipo',   label: 'Pre-IPO',   successProb: 0.95, preMoneyMultiplier: [1.1, 1.4], raiseFraction: [0.08, 0.15], monthsToNextRound: [12, 18] },
  { id: 'ipo',       label: 'IPO',       successProb: 1 }
];

const normalizeStageId = (id) => (id || '').toString().trim().toLowerCase();
const ROUND_DEFINITION_MAP = VC_STAGE_CONFIG.reduce((map, stage) => {
  const key = normalizeStageId(stage.id);
  map[key] = Object.assign({ durationDays: null }, stage);
  if (stage.label) {
    map[normalizeStageId(stage.label)] = map[key];
  }
  return map;
}, {});

const STAGE_FINANCIALS = {
  seed:     { ps: 9.5, margin: -1.6 },
  series_a: { ps: 8.5, margin: -1.1 },
  series_b: { ps: 7.5, margin: -0.8 },
  series_c: { ps: 6.5, margin: -0.35 },
  series_d: { ps: 5.8, margin: -0.12 },
  series_e: { ps: 5.1, margin: 0.05 },
  series_f: { ps: 4.6, margin: 0.12 },
  pre_ipo:  { ps: 4.2, margin: 0.19 },
  ipo:      { ps: 4.1, margin: 0.2 }
};

const STAGE_INDEX_BY_LABEL = VC_STAGE_CONFIG.reduce((map, stage, idx) => {
  map[stage.label.toLowerCase()] = idx;
  map[stage.id] = idx;
  return map;
}, {});

const STAGE_INDEX = VC_STAGE_CONFIG.reduce((map, stage, idx) => {
  map[stage.id.toLowerCase()] = idx;
  map[stage.id] = idx;
  map[stage.label.toLowerCase()] = idx;
  return map;
}, {});

const VC_STAGE_LOOKUP = VC_STAGE_CONFIG.reduce((map, stage) => {
  map[stage.id.toLowerCase()] = stage;
  return map;
}, {});

const DEFAULT_ROUND_ORDER = VC_STAGE_CONFIG.map(stage => stage.id.toLowerCase());

function mergeRoundDefinition(base, override = {}) {
  const result = {
    id: normalizeStageId(override.id || base.id),
    label: override.label || base.label,
    successProb: override.successProb ?? override.success_prob ?? base.successProb,
    preMoneyMultiplier: override.preMoneyMultiplier || override.pre_money_multiplier || base.preMoneyMultiplier,
    raiseFraction: override.raiseFraction || override.raise_fraction || base.raiseFraction,
    monthsToNextRound: override.monthsToNextRound || override.months_to_next_round || base.monthsToNextRound,
    durationDays: override.durationDays ?? override.duration_days ?? base.durationDays ?? null,
    pipelineStage: override.pipelineStage || override.pipeline_stage || null,
    financials: override.financials || null
  };
  if (!Array.isArray(result.preMoneyMultiplier)) {
    result.preMoneyMultiplier = base.preMoneyMultiplier;
  }
  if (!Array.isArray(result.raiseFraction)) {
    result.raiseFraction = base.raiseFraction;
  }
  if (!Array.isArray(result.monthsToNextRound)) {
    result.monthsToNextRound = base.monthsToNextRound;
  }
  return result;
}

function resolveRoundDefinitions(rounds) {
  const order = Array.isArray(rounds) && rounds.length > 0 ? rounds : DEFAULT_ROUND_ORDER;
  return order.map(entry => {
    if (typeof entry === 'string') {
      const base = ROUND_DEFINITION_MAP[normalizeStageId(entry)] || ROUND_DEFINITION_MAP['seed'];
      return mergeRoundDefinition(base);
    }
    if (entry && typeof entry === 'object') {
      const refId = normalizeStageId(entry.id || entry.ref || entry.base || entry.stage);
      const base = ROUND_DEFINITION_MAP[refId] || ROUND_DEFINITION_MAP['seed'];
      return mergeRoundDefinition(base, entry);
    }
    return mergeRoundDefinition(ROUND_DEFINITION_MAP['seed']);
  });
}

function computeHypergrowthFairValue(company, applyNoise = true) {
  const fin = company.getStageFinancials();
  const ps = fin.ps || 6;
  const margin = clampValue(fin.margin ?? 0.1, -2, 0.35);
  const revenue = Math.max(1, company.revenue || company.currentValuation / Math.max(ps, 1));
  let base = revenue * ps;
  if (company.postGateMode) {
    const forwardMargin = company.postGateMargin || margin;
    const forwardE = revenue * forwardMargin;
    const impliedPE = Math.max(ps * 2, 8);
    base = forwardE * impliedPE;
  }
  if (applyNoise) {
    base *= between(0.9, 1.15);
  }
  return Math.max(1, base);
}

function computeHardTechFairValue(company, applyNoise = true) {
  const unlockedPV = company.products.reduce((sum, product) => sum + (typeof product.unlockedValue === 'function' ? product.unlockedValue() : 0), 0);
  const optionPV = company.products.reduce((sum, product) => sum + (typeof product.expectedValue === 'function' ? product.expectedValue() : 0), 0);
  let base = Math.max(1, unlockedPV + optionPV);
  if (applyNoise) {
    base *= between(0.9, 1.15);
  }
  return base;
}

function advanceHypergrowthPreGate(company, dtYears) {
  if (company.binarySuccess) {
    company.revenue = 0;
    company.profit = 0;
    return;
  }
  const stage = company.currentStage;
  const stageKey = stage ? stage.id : 'seed';
  const fin = STAGE_FINANCIALS[stageKey] || STAGE_FINANCIALS.seed;
  const targetRevenue = Math.max(company.currentValuation / Math.max(fin.ps || 1, 1e-3), 0);
  const smoothing = 1 - Math.exp(-5 * dtYears);
  company.revenue += (targetRevenue - company.revenue) * smoothing;
  company.profit = company.revenue * fin.margin;
}

function advanceHardTechPreGate(company, dtYears, dtDays, currentDate) {
  const days = typeof dtDays === 'number' ? dtDays : dtYears * DAYS_PER_YEAR;
  const years = days / DAYS_PER_YEAR;
  const smoothing = 1 - Math.exp(-3 * Math.max(years, 0));
  const stats = company.getHardTechPipelineStats();
  if (stats.failedStage) {
    company.handleHardTechFailure(currentDate);
    return;
  }
  const prevCompleted = company.completedStageCount || 0;
  company.completedStageCount = stats.completedStages;
  const stageCompleted = stats.completedStages > prevCompleted;
  const hasCommercial = stats.commercialCount > 0;
  if (!hasCommercial) {
    const targetRevenue = Math.max(250_000, stats.progress * 5_000_000);
    const baseBurn = 18_000_000 + stats.activeCost * 0.25;
    const progressBurn = baseBurn * (1 + stats.progress * 2.5);
    const targetProfit = -progressBurn;
    company.revenue += (targetRevenue - company.revenue) * smoothing;
    company.profit += (targetProfit - company.profit) * smoothing;
  } else {
    const commercialRevenue = stats.commercialValue * company.micro;
    const targetRevenue = Math.max(1, commercialRevenue);
    const targetMargin = clampValue(company.postGateMargin || 0.25, 0.05, 0.45);
    const targetProfit = targetRevenue * targetMargin;
    company.revenue += (targetRevenue - company.revenue) * smoothing;
    company.profit += (targetProfit - company.profit) * smoothing;
  }
  if (stageCompleted) {
    company.hasPipelineUpdate = true;
    if (company.currentRound) {
      const lastStage = company.getLastCompletedHardTechStage();
      if (lastStage) {
        company.currentRound.pipelineStage = lastStage.name || lastStage.id || company.currentRound.pipelineStage;
      }
      company.currentRound.stageReadyToResolve = true;
    }
    if (stats.totalStages > 0 && stats.completedStages >= stats.totalStages) {
      company.stageIndex = company.targetStageIndex;
      company.hardTechReadyForIPO = true;
    }
  }
}

class VentureStrategy {
  constructor(company) {
    this.company = company;
  }
  shouldStartNextRound() { return false; }
  configureRound(stage, draftRound) { return draftRound; }
  calculateRoundHealth(stage) { return 1; }
  shouldResolveRound() {
    const company = this.company;
    if (!company || !company.currentRound) return false;
    return company.daysSinceRound >= (company.currentRound.durationDays || 0);
  }
}

class HypergrowthStrategy extends VentureStrategy {
  shouldStartNextRound() {
    const company = this.company;
    if (company.status === 'failed' || company.status === 'exited' || company.status === 'ipo' || company.status === 'ipo_pending') return false;
    if (company.postGateMode && company.stageIndex >= company.targetStageIndex) return false;
    if (company.currentRound) return false;
    const burnTrigger = company.cashBurnPerDay > 0 ? company.cashBurnPerDay * 90 : 0;
    const triggerCash = Math.max(company.raiseTriggerCash, burnTrigger, 250_000);
    const cashDepleted = company.cash <= triggerCash;
    const runwayExpired = company.runwayTargetDays > 0 && company.daysSinceLastRaise >= company.runwayTargetDays;
    return cashDepleted || runwayExpired;
  }

  calculateRoundHealth(stage) {
    const company = this.company;
    const revenue = Math.max(1, company.revenue);
    const prev = Math.max(1, company.lastRoundRevenue || revenue);
    const growth = (revenue - prev) / prev;
    const growthScore = clampValue((growth + 0.4) / 0.8, 0, 1);

    const stageFin = company.getStageFinancials(stage);
    const expectedMargin = stageFin.margin ?? -0.2;
    const actualMargin = revenue > 0 ? company.profit / revenue : expectedMargin;
    const marginDenom = Math.max(0.3, Math.abs(expectedMargin) + 0.2);
    const marginScore = clampValue(1 - Math.abs(actualMargin - expectedMargin) / marginDenom, 0, 1);

    const runwayDenom = Math.max(company.runwayTargetDays || 0, 120);
    const runwayScore = clampValue(company.cachedRunwayDays / runwayDenom, 0, 1);

    let base = 0.5 * growthScore + 0.35 * marginScore + 0.15 * runwayScore;
    if (company.binarySuccess && !company.gateCleared) {
      base *= 0.9;
    }
    return clampValue(base, 0, 1);
  }

  advancePreGate(dtYears) {
    advanceHypergrowthPreGate(this.company, dtYears);
  }

  computeFairValue(applyNoise = true) {
    return computeHypergrowthFairValue(this.company, applyNoise);
  }
}

class HardTechStrategy extends VentureStrategy {
  shouldStartNextRound() {
    const company = this.company;
    if (company.status === 'failed' || company.status === 'exited' || company.status === 'ipo' || company.status === 'ipo_pending') return false;
    if (company.currentRound) return false;
    const nextStage = company.getNextHardTechStage();
    return company.status === 'raising' && !!nextStage;
  }

  configureRound(stage, draftRound) {
    const company = this.company;
    const activeStage = company.getNextHardTechStage();
    if (!activeStage) return null;
    draftRound.durationDays = Math.max(30, activeStage.duration_days || draftRound.durationDays);
    draftRound.runwayMonths = draftRound.durationDays / 30;
    draftRound.pipelineStage = activeStage.name || activeStage.id;
    draftRound.requiredStageId = activeStage.id;
    draftRound.stageReadyToResolve = false;
    return draftRound;
  }

  calculateRoundHealth() {
    const company = this.company;
    const stats = company.getHardTechPipelineStats();
    const runwayDenom = Math.max(company.runwayTargetDays || 240, 120);
    const runwayScore = clampValue(company.cachedRunwayDays / runwayDenom, 0, 1);
    const progressScore = stats.progress;
    return clampValue(0.6 * progressScore + 0.4 * runwayScore, 0, 1);
  }

  shouldResolveRound() {
    const company = this.company;
    const round = company.currentRound;
    return !!(round && round.stageReadyToResolve);
  }

  advancePreGate(dtYears, dtDays, currentDate) {
    advanceHardTechPreGate(this.company, dtYears, dtDays, currentDate);
  }

  computeFairValue(applyNoise = true) {
    if (!this.company.postGateMode) {
      return computeHardTechFairValue(this.company, applyNoise);
    }
    return computeHypergrowthFairValue(this.company, applyNoise);
  }
}

const createVentureStrategy = (company) => {
  if (company.archetype === 'hardtech') {
    return new HardTechStrategy(company);
  }
  return new HypergrowthStrategy(company);
};

const DummyMacroEnv = {
  getValue: () => 1,
  getMu: () => 0.06,
  ensureSector: () => {}
};

const buildPublicConfigFromVenture = (cfg, startYear) => {
  const fallbackRevenue = Math.max(1_000_000, (cfg.valuation_usd || 10_000_000) / (STAGE_FINANCIALS.seed.ps || 9));
  const baseBusiness = cfg.base_business || {
    revenue_process: {
      initial_revenue_usd: {
        min: fallbackRevenue,
        max: fallbackRevenue * 1.25
      }
    },
    margin_curve: {
      start_profit_margin: -0.45,
      terminal_profit_margin: 0.22,
      years_to_mature: 8
    },
    multiple_curve: {
      initial_ps_ratio: 8,
      terminal_pe_ratio: 18,
      years_to_converge: 12
    }
  };
  const finance = cfg.finance || {
    starting_cash_usd: Math.max(2_000_000, (cfg.valuation_usd || 10_000_000) * 0.05),
    starting_debt_usd: 0,
    interest_rate_annual: 0.06
  };
  const costs = cfg.costs || {
    opex_fixed_usd: 10_000_000,
    opex_variable_ratio: 0.2,
    rd_base_ratio: 0.05
  };

  return {
    id: cfg.id,
    static: {
      name: cfg.name || 'Venture Spinout',
      sector: cfg.sector || 'Private',
      ipo_window: { from: startYear, to: startYear },
      ipo_instantly: true,
      fromVenture: true
    },
    base_business: baseBusiness,
    finance,
    costs,
    pipeline: Array.isArray(cfg.pipeline) ? cfg.pipeline : [],
    events: Array.isArray(cfg.events) ? cfg.events : []
  };
};

/*────────────────── Company ─────────────────────*/

class Company extends PhaseCompany {
  constructor (cfg, macroEnv, gameStartYear = 1990, ipoDate = new Date(gameStartYear,0,1)) {
    super(cfg, macroEnv, gameStartYear, ipoDate, 'public');
    this.showDividendColumn = true;

    /* Base revenue (annual) – will be multiplied by sector & micro factors */
    const rp = cfg.base_business.revenue_process;
    this.baseRevenue = between(rp.initial_revenue_usd.min, rp.initial_revenue_usd.max);

    /* Curves */
    const mc  = cfg.base_business.margin_curve;
    const mu  = cfg.base_business.multiple_curve;
    this.marginCurve = cfg.base_business.margin_curve
         ? new MarginCurve(mc.start_profit_margin, mc.terminal_profit_margin, mc.years_to_mature)
         : null;
    this.multCurve   = new MultipleCurve(mu.initial_ps_ratio, mu.terminal_pe_ratio, mu.years_to_converge);

    /* Balance-sheet */
    const fin = cfg.finance || {};
    this.cash      = fin.starting_cash_usd  ?? 0;
    this.debt      = fin.starting_debt_usd  ?? 0;
    this.intRate   = fin.interest_rate_annual ?? 0.05;
    this.payoutRatio = null;
    this.targetYield = null;
    this.pendingDividendRemaining = 0;
    this.dividendInstallmentsLeft = 0;
    this.dividendAccumulatorDays = 0;
    this.dividendEvents = [];

    /* Costs */
    const cost = cfg.costs || {};
    this.opexFixed   = cost.opex_fixed_usd      ?? 5_000_000;
    this.opexVar     = cost.opex_variable_ratio ?? 0.15;
    this.rdBaseRatio = cost.rd_base_ratio       ?? 0.05;

    /* Timed multipliers */
    this.revMult = 1;
    this.volMult = 1;  // scales micro volatility
    this.flatRev = 0;

    /* Mis-pricing layers --------------------------------------------------*/
    // Structural bias
    const biasCfg = (cfg.sentiment && cfg.sentiment.structural_bias) || {};
    const minB = biasCfg.min ?? 0.25;
    const maxB = biasCfg.max ?? 4;
    this.structBias = between(minB, maxB);
    const hl = biasCfg.half_life_years ?? 15;
    this.biasLambda = Math.log(2) / hl;

    // Cyclical noise
    this.cyclical = between(0.8, 1.2);
    this.cyc_k    = 0.3;
    this.cyc_sig  = 0.20;

    /* Micro performance factor (idiosyncratic) */
    this.micro     = 1;
    this.micro_k   = 0.4;   // speed of mean reversion to 1
    const sm = sectorMicro[this.sector] || sectorMicro.DEFAULT;
    this.micro_mu   = sm.mu;          // permanent drift advantage
    this.micro_sig  = sm.sigma;       // replaces hard-coded 0.25
    /* ----------------------------------------------------------*/

    this.multFreeze  = null; // unchanged

    /* Tracking annuals */
    this.rdOpex = 0;

    /* Pipeline & events */
    this.products = (cfg.pipeline || []).map(p => new Product(p));
    this.events   = (cfg.events   || []).map(e => new ScheduledEvent(e));
    this.effects  = [];
    this.hasPipelineUpdate = false;

    /* Pre-simulate if IPO < gameStart */
    let simDate = new Date(ipoDate);
    const dt = 14;
    while (simDate.getFullYear() < gameStartYear) {
      this.step(dt, simDate);
      simDate.setDate(simDate.getDate() + dt);
    }
  }

  step (dtDays, gameDate) {
    if (this.bankrupt) return;

    this.ageDays += dtDays;
    const dtYears = dtDays / 365;
    const ageYears = this.ageDays / 365;

    /* Macro step handled by Simulation */

    /* Fire company specific events --------------------------------------*/
    for (const ev of this.events)
      for (const eff of ev.maybe(dtDays, this.name)) {
        eff.apply(this);
        this.effects.push(eff);
      }
    this.effects = this.effects.filter(e => {
      if (e.left <= 0) { e.revert(this); return false; }
      e.left -= dtDays; return true;
    });

    /* Advance pipeline ---------------------------------------------------*/
    let successThisTick = false;
    for (const p of this.products) {
      const vBefore = p.unlockedValue();
      p.advance(dtDays, Math.random, this);
      if (p.unlockedValue() > vBefore) successThisTick = true;
    }
    if (successThisTick && this.multFreeze === null) {
      const mNowTmp = this.marginCurve.value(ageYears);
      this.multFreeze = this.multCurve.value(ageYears, mNowTmp);
    }

    /* Update micro performance factor  ----------------------------------*/
    const epsMicro = Random.gaussian();
    const vol       = this.micro_sig * this.volMult;       // volMult now ⇢ idio vol
    this.micro += (this.micro_mu + this.micro_k * (1 - this.micro)) * dtYears
                + vol * Math.sqrt(dtYears) * epsMicro;
    this.micro = Math.max(0.1, Math.min(5, this.micro));

    /* Revenue -----------------------------------------------------------*/
    const sectorFactor     = this.macroEnv.getValue(this.sector);
    const coreAnnual       = this.baseRevenue * sectorFactor * this.micro * this.revMult - this.flatRev;
    const pipelineAnnual   = this.products.reduce((s, p) => s + p.realisedRevenuePerYear(), 0);
    const revenueThisTick  = (coreAnnual + pipelineAnnual) * dtYears;

    /* Costs & income ----------------------------------------------------*/
    let marginNow;
    if (this.marginCurve) {
        marginNow = this.marginCurve.value(ageYears);
    } else {
        const base   = sectorMargin[this.sector] ?? sectorMargin.DEFAULT;
        const sizeKick = 0.02 * Math.log10(Math.max(1, (coreAnnual+pipelineAnnual)/1e9)); // larger firms → a bit more leverage
        const cycle  = this.macroEnv.getValue(this.sector);      // >1 in booms, <1 in busts
        const downPenalty = Math.max(0, 1 - cycle);              // 0 in boom, up to 1 in deep bust
        marginNow = Math.max(0.01, base + sizeKick - 0.15*downPenalty);
    }
    const grossProfit = revenueThisTick * marginNow;

    this.rdOpex = 0;            // reset; will be filled by stages
    // ... inside for-each product above Stage.advance already calls company.rdOpex += ...

    /* -------- Operating & R&D costs ---------------------------------*/
    const opex = this.opexFixed * dtYears + this.opexVar * grossProfit;
    const rdPipeline = this.products.reduce((s,p)=>s+p.expectedValue(),0);
    const rdBurn =
          this.rdOpex                                   // stage-specific cost (from Stage.advance)
        + this.rdBaseRatio * rdPipeline * dtYears;      // steady research platform spend

    const interest    = this.debt * this.intRate * dtYears;
    const netIncome   = grossProfit - opex - rdBurn - interest;

    /* Cash-flow & auto-debt --------------------------------------------*/
    this.cash += netIncome;
    if (this.cash < 0) { this.debt += -this.cash; this.cash = 0; }

    /* Pay down debt with surplus cash */
    if (this.debt > 0 && this.cash > 0) {
      const reserve = Math.max(1_000_000, this.opexFixed * 0.25);
      const excessCash = this.cash - reserve;
      if (excessCash > 0) {
        const repayment = Math.min(this.debt, excessCash);
        this.debt -= repayment;
        this.cash -= repayment;
      }
    }

    this.dividendAccumulatorDays = (this.dividendAccumulatorDays || 0) + dtDays;
    this.processPendingDividends(gameDate);

    /* Bankruptcy simple rule */
    const solvencyDenom = coreAnnual + pipelineAnnual;
    // if (solvencyDenom > 0 && this.debt > 10 * solvencyDenom) {
    //   this.bankrupt = true;
    //   this.marketCap = 0;
    //   return;
    // }

    /* Fair value --------------------------------------------------------*/
    const unlockedPV = this.products.reduce((s, p) => s + p.unlockedValue(), 0);
    const pipelineOption = this.products.reduce((s, p) => s + p.expectedValue(), 0);
    const forwardE   = (coreAnnual + pipelineAnnual) * marginNow;
    const fairPE     = this.multCurve.value(ageYears, marginNow);
    const fairValue  = forwardE * fairPE + unlockedPV + pipelineOption;

    /* Mis-pricing update ------------------------------------------------*/
    // structural bias (very slow decay to 1)
    this.structBias = 1 + (this.structBias - 1) * Math.exp(-this.biasLambda * dtYears);
    // cyclical OU noise
    const epsCyc = Random.gaussian();
    this.cyclical += this.cyc_k * (1 - this.cyclical) * dtYears
                   + this.cyc_sig * Math.sqrt(dtYears) * epsCyc;
    this.cyclical = Math.max(0.2, Math.min(5, this.cyclical));

    const sentiment = this.structBias * this.cyclical;

    /* Market cap  = enterprise × sentiment – debt + cash ---------------*/
    const enterprise = fairValue * sentiment;
    
    /* ===== Distress discount =======================================
       Very crude: probability of survival falls with leverage ratio. */
    const leverage = this.debt / Math.max(1, enterprise);      // 0–∞
    const survivalProb = 1 / (1 + Math.exp(4*(leverage-0.6))); // ≈1 above 0.6 debt/EV halves value
    const distressedEnterprise = enterprise * survivalProb;
    
    const candidateCap = distressedEnterprise - this.debt + this.cash;
    if (candidateCap <= 0) {
      this.markBankrupt(gameDate);
      return;
    }

    this.marketCap   = candidateCap;
    this.displayCap  = this.marketCap; // UI hook

    /* Histories ---------------------------------------------------------*/
    this.accumulateYear(revenueThisTick, netIncome);

    // Dividends: only if debt is cleared and the last three years were profitable, pay annually
    let plannedDividend = 0;
    if (this.debt <= 0 && Array.isArray(this.financialHistory) && this.financialHistory.length >= 3) {
      const lastThree = this.financialHistory.slice(-3);
      const allProfitable = lastThree.every(entry => entry && typeof entry.profit === 'number' && entry.profit > 0);
      if (allProfitable && this.cash > 0) {
        plannedDividend = Math.min(this.cash, this.cash * 0.11);
      }
    }

    const recordedAnnual = this.maybeRecordAnnual(plannedDividend);
    if (recordedAnnual) {
      if (plannedDividend > 0) {
        this.pendingDividendRemaining = plannedDividend;
        this.dividendInstallmentsLeft = 4;
        this.dividendAccumulatorDays = 0;
      } else if (this.pendingDividendRemaining <= 0) {
        this.pendingDividendRemaining = 0;
        this.dividendInstallmentsLeft = 0;
        this.dividendAccumulatorDays = 0;
      }
    }

    this.recordHistoryPoint(gameDate);
  }

  processPendingDividends(gameDate) {
    if (this.pendingDividendRemaining <= 0 || this.dividendInstallmentsLeft <= 0) {
      if (this.pendingDividendRemaining <= 0) {
        this.pendingDividendRemaining = 0;
        this.dividendInstallmentsLeft = 0;
        this.dividendAccumulatorDays = 0;
      }
      return;
    }
    while (
      this.dividendInstallmentsLeft > 0 &&
      this.pendingDividendRemaining > 0 &&
      this.dividendAccumulatorDays >= QUARTER_DAYS
    ) {
      const portion = this.pendingDividendRemaining / this.dividendInstallmentsLeft;
      const payout = Math.min(this.cash, portion);
      if (payout <= 0) break;
      this.cash -= payout;
      this.pendingDividendRemaining -= payout;
      this.dividendInstallmentsLeft--;
      this.dividendAccumulatorDays -= QUARTER_DAYS;
      this.recordDividendEvent(payout, gameDate);
    }
    if (this.pendingDividendRemaining <= 1 || this.dividendInstallmentsLeft <= 0) {
      this.pendingDividendRemaining = 0;
      this.dividendInstallmentsLeft = 0;
      this.dividendAccumulatorDays = 0;
    }
  }

  recordDividendEvent(amount, gameDate) {
    if (amount <= 0) return;
    if (!this.dividendEvents) this.dividendEvents = [];
    this.dividendEvents.push({ amount, timestamp: gameDate ? gameDate.getTime() : Date.now() });
  }

  drainDividendEvents() {
    if (!this.dividendEvents || this.dividendEvents.length === 0) return [];
    const events = this.dividendEvents.slice();
    this.dividendEvents.length = 0;
    return events;
  }
}


class VentureCompany extends Company {
  constructor(config, startDate) {
    const start = startDate ? new Date(startDate) : new Date('1990-01-01T00:00:00Z');
    const publicCfg = buildPublicConfigFromVenture(config, start.getUTCFullYear());
    super(publicCfg, DummyMacroEnv, start.getUTCFullYear(), start);
    this.setPhase('private');
    this.showDividendColumn = false;
    this.fromVenture = true;

    this.description = config.description || '';
    this.archetype = config.archetype || 'hypergrowth';
    this.roundDefinitions = resolveRoundDefinitions(config.rounds);
    const startingStageId = normalizeStageId(config.funding_round || 'seed');
    let startingIndex = this.roundDefinitions.findIndex(stage => stage.id === startingStageId);
    if (startingIndex < 0) startingIndex = 0;
    this.stageIndex = startingIndex;

    const targetLabel = normalizeStageId(config.ipo_stage || 'series_f');
    let targetIdx = this.roundDefinitions.findIndex(stage => stage.id === targetLabel);
    if (targetIdx < 0) {
      targetIdx = this.roundDefinitions.length - 1;
    }
    this.targetStageIndex = Math.max(0, Math.min(targetIdx, this.roundDefinitions.length - 1));

    this.currentValuation = Math.max(1, Number(config.valuation_usd) || 10_000_000);
    this.status = 'raising';
    this.daysSinceRound = 0;
    this.playerEquity = 0;
    this.playerInvested = 0;
    this.pendingCommitment = 0;
    this.cash = Number(config.starting_cash_usd ?? 0);
    this.raiseTriggerCash = 0;
    this.cashBurnPerDay = 0;
    this.runwayTargetDays = 180;
    this.daysSinceLastRaise = 0;
    this.cachedRunwayDays = Infinity;
    this.lastRoundRevenue = 0;
    this.lastRoundMargin = 0;
    this.lastEventNote = 'Fresh opportunity';
    this.currentRound = null;
    this.ipoReady = false;
    this.exited = false;
    this.revenue = 0;
    this.profit = 0;
    this.history = [];
    this.financialHistory = [];
    this.ageDays = 0;
    this.currentYearRevenue = 0;
    this.currentYearProfit = 0;
    this.startDate = new Date(start);
    this.lastYearRecorded = this.startDate.getUTCFullYear();
    this.stageChanged = false;
    this.consecutiveFails = 0;
    this.maxFailuresBeforeCollapse = Math.max(1, Number(config.max_failures_before_collapse || 2));
    this.completedStageCount = 0;
    this.pendingStageCompletion = false;
    this.pendingHardTechFailure = null;

    this.binarySuccess = Boolean(config.binary_success);
    const gateLabel = normalizeStageId(config.gate_stage || 'series_c');
    let gateIndex = this.roundDefinitions.findIndex(stage => stage.id === gateLabel);
    if (gateIndex < 0) {
      gateIndex = Math.max(1, Math.min(this.targetStageIndex, this.roundDefinitions.length - 2));
    }
    this.gateStageIndex = Math.max(0, Math.min(gateIndex, this.roundDefinitions.length - 1));
    this.gateStageId = this.roundDefinitions[this.gateStageIndex]?.id || gateLabel;

    this.hypergrowthWindowYears = Math.max(Number(config.hypergrowth_window_years || 2), 0.25);
    this.hypergrowthTotalMultiplier = Math.max(Number(config.hypergrowth_total_multiplier || 3), 1.5);
    this.longRunRevenueCeiling = Math.max(Number(config.long_run_revenue_ceiling_usd || this.currentValuation * 40), this.currentValuation);
    this.longRunGrowthRate = Math.max(Number(config.long_run_growth_rate || 0.3), 0.05);
    this.longRunGrowthFloor = Math.max(Number(config.long_run_growth_floor || 0.05), 0.01);
    this.longRunGrowthDecay = Math.max(Number(config.long_run_growth_decay || 0.25), 0.05);
    this.postGateInitialMultiple = Math.max(Number(config.post_gate_initial_multiple || 12), 2);
    this.postGateBaselineMultiple = Math.max(Number(config.post_gate_baseline_multiple || 4), 1);
    this.postGateMultipleDecayYears = Math.max(Number(config.post_gate_multiple_decay_years || 6), 1);
    this.postGateMargin = Math.max(Number(config.post_gate_margin || 0.2), 0.05);

    this.strategy = createVentureStrategy(this);
    this.gateCleared = false;
    this.postGatePending = false;
    this.postGateMode = false;
    this.hypergrowthActive = false;
    this.hypergrowthElapsedYears = 0;
    this.hypergrowthTargetRevenue = null;
    this.postGateStartDate = null;
    this.hypergrowthEndDate = null;
    this.currentMultiple = this.postGateInitialMultiple;

    this.lastFairValue = this.currentValuation;

    this.generateRound(start);
    this.updateFinancialsFromValuation();
    this.recordHistory(start);

    if (!isFinite(this.cash) || this.cash <= 0) {
      const seedCapital = this.currentRound ? this.currentRound.raiseAmount : this.currentValuation * 0.1;
      this.cash = Math.max(500_000, seedCapital * 0.35);
    }
    this.raiseTriggerCash = Math.max(this.cash * 0.35, 250_000);
    this.lastRoundRevenue = this.revenue;
    this.lastRoundMargin = this.revenue > 0 ? this.profit / Math.max(this.revenue, 1) : -0.5;
  }

  get currentStage() {
    if (!Array.isArray(this.roundDefinitions) || this.roundDefinitions.length === 0) {
      this.roundDefinitions = resolveRoundDefinitions();
    }
    return this.roundDefinitions[Math.min(this.stageIndex, this.roundDefinitions.length - 1)];
  }

  getStageFinancials(stageOverride = null) {
    const stage = stageOverride || this.currentStage;
    const stageKey = normalizeStageId(stage ? stage.id : 'seed');
    if (stage && stage.financials) {
      return stage.financials;
    }
    const fin = STAGE_FINANCIALS[stageKey] || STAGE_FINANCIALS.seed;
    return fin;
  }

  computeFairValue(applyNoise = true) {
    if (this.strategy && typeof this.strategy.computeFairValue === 'function') {
      return this.strategy.computeFairValue(applyNoise);
    }
    return computeHypergrowthFairValue(this, applyNoise);
  }

  updateFinancialsFromValuation() {
    if (this.postGateMode) {
      this.marketCap = this.currentValuation;
      return;
    }
    const stage = this.currentStage;
    const stageKey = stage ? stage.id : 'seed';
    const fin = STAGE_FINANCIALS[stageKey] || STAGE_FINANCIALS.seed;
    const ps = fin.ps || 6;
    const margin = clampValue(fin.margin ?? 0.1, -2, 0.35);
    const valuation = Math.max(this.currentValuation || 0, 0);
    const revenue = this.binarySuccess ? 0 : valuation / Math.max(ps, 1e-3);
    const profit = revenue * margin;
    this.revenue = revenue;
    this.profit = profit;
    this.marketCap = this.currentValuation;
  }

  recordHistory(date) {
    if (!date) return;
    const timestamp = date.getTime ? date.getTime() : Date.now();
    const last = this.history[this.history.length - 1];
    if (last && last.x === timestamp) {
      last.y = this.currentValuation;
      return;
    }
    this.history.push({ x: timestamp, y: this.currentValuation });
  }

  accumulateFinancials(dtDays, currentDate) {
    const dtYears = dtDays / 365;
    this.currentYearRevenue += this.revenue * dtYears;
    this.currentYearProfit += this.profit * dtYears;
    this.ageDays += dtDays;
    this.applyRunwayFlow(dtDays);

    const year = currentDate.getUTCFullYear();
    if (year > this.lastYearRecorded) {
      this.financialHistory.push({
        year: this.lastYearRecorded,
        revenue: this.currentYearRevenue,
        profit: this.currentYearProfit,
        marketCap: this.currentValuation,
        cash: Math.max(this.cash, 0),
        debt: 0,
        dividend: 0,
        ps: this.currentYearRevenue > 0 ? this.currentValuation / this.currentYearRevenue : 0,
        pe: this.currentYearProfit > 0 ? this.currentValuation / this.currentYearProfit : 0
      });
      if (this.financialHistory.length > 12) {
        this.financialHistory.shift();
      }
      this.currentYearRevenue = 0;
      this.currentYearProfit = 0;
      this.lastYearRecorded = year;
    }
  }

  progressCompanyClock(dtDays, currentDate) {
    const dtYears = dtDays / DAYS_PER_YEAR;
    if (Array.isArray(this.products) && this.products.length > 0) {
      for (const product of this.products) {
        product.advance(dtDays, Math.random, this);
      }
    }
    if (this.postGateMode) {
      if (dtYears > 0) {
        this.advancePostGateRevenue(dtYears);
      }
      this.syncPostGateMultiple(currentDate);
      this.profit = this.revenue * this.postGateMargin;
      this.lastFairValue = Math.max(1, this.revenue * this.currentMultiple);
    } else if (dtYears > 0) {
      this.advancePreGateRevenue(dtYears, dtDays, currentDate);
    }
    this.marketCap = this.currentValuation;
  }

  advancePreGateRevenue(dtYears, dtDays, currentDate) {
    if (this.strategy && typeof this.strategy.advancePreGate === 'function') {
      this.strategy.advancePreGate(dtYears, dtDays, currentDate);
      return;
    }
    advanceHypergrowthPreGate(this, dtYears);
  }


  advancePostGateRevenue(dtYears) {
    if (this.hypergrowthActive) {
      const annualFactor = Math.pow(this.hypergrowthTotalMultiplier, 1 / Math.max(this.hypergrowthWindowYears, 0.25));
      const growthFactor = Math.pow(annualFactor, dtYears);
      this.revenue *= growthFactor;
      this.hypergrowthElapsedYears += dtYears;
      if (this.hypergrowthElapsedYears >= this.hypergrowthWindowYears || this.revenue >= this.hypergrowthTargetRevenue) {
        this.revenue = Math.min(this.revenue, this.hypergrowthTargetRevenue || this.revenue);
        this.hypergrowthActive = false;
        this.hypergrowthEndDate = this.postGateStartDate ? new Date(this.postGateStartDate.getTime() + this.hypergrowthWindowYears * YEAR_MS) : null;
      }
    } else {
      const yearsSinceHyper = Math.max(0, this.hypergrowthElapsedYears - this.hypergrowthWindowYears);
      const baseRate = this.longRunGrowthRate;
      const decay = Math.exp(-this.longRunGrowthDecay * yearsSinceHyper);
      const effectiveRate = Math.max(this.longRunGrowthFloor, baseRate * decay);
      const growthFactor = Math.pow(1 + effectiveRate, dtYears);
      this.revenue *= growthFactor;
    }
    if (this.revenue > this.longRunRevenueCeiling) {
      this.revenue = this.longRunRevenueCeiling;
    }
  }

  getHardTechPipelineStats() {
    const stats = {
      totalStages: 0,
      completedStages: 0,
      commercialCount: 0,
      commercialValue: 0,
      activeCost: 0,
      failedStage: false
    };
    if (!Array.isArray(this.products)) {
      return stats;
    }
    this.products.forEach(product => {
      let activeStageCost = 0;
      product.stages.forEach(stage => {
        stats.totalStages += 1;
        if (stage.completed && stage.succeeded) {
          stats.completedStages += 1;
        }
        if (stage.completed && !stage.succeeded) {
          stats.failedStage = true;
        }
        if (!stage.completed && activeStageCost === 0) {
          const canStart = !stage.depends_on || product.stages.some(s => s.id === stage.depends_on && s.completed && s.succeeded);
          if (canStart) {
            activeStageCost = stage.cost || 0;
          }
        }
      });
      stats.activeCost += activeStageCost;
      if (product.isCommercialised && product.isCommercialised()) {
        stats.commercialCount += 1;
        stats.commercialValue += product.fullVal || 0;
      }
    });
    stats.progress = stats.totalStages > 0 ? stats.completedStages / stats.totalStages : 0;
    return stats;
  }

  getNextHardTechStage() {
    if (!Array.isArray(this.products)) return null;
    for (const product of this.products) {
      for (const stage of product.stages) {
        if (!stage.completed) {
          return stage;
        }
        if (stage.completed && !stage.succeeded) {
          return null;
        }
      }
    }
    return null;
  }

  getLastCompletedHardTechStage() {
    if (!Array.isArray(this.products)) return null;
    let last = null;
    this.products.forEach(product => {
      product.stages.forEach(stage => {
        if (stage.completed && stage.succeeded) {
          last = stage;
        }
      });
    });
    return last;
  }

  handleHardTechFailure(currentDate) {
    const refund = this.pendingCommitment || 0;
    if (refund > 0) {
      this.pendingCommitment = 0;
    }
    this.playerEquity = 0;
    this.currentValuation = 0;
    this.status = 'failed';
    this.lastEventNote = 'Pipeline failure collapsed the program.';
    this.stageChanged = true;
    this.currentRound = null;
    this.hasPipelineUpdate = true;
    this.pendingHardTechFailure = {
      type: 'venture_failed',
      companyId: this.id,
      name: this.name,
      valuation: this.currentValuation,
      revenue: this.revenue,
      profit: this.profit,
      refund
    };
  }

  applyRunwayFlow(dtDays) {
    if (!isFinite(dtDays) || dtDays <= 0) return;
    const dtYears = dtDays / DAYS_PER_YEAR;
    const netIncome = this.profit * dtYears;
    if (isFinite(netIncome)) {
      this.cash += netIncome;
    }
    const burnPerDay = Math.max(0, -this.profit) / DAYS_PER_YEAR;
    this.cashBurnPerDay = burnPerDay;
    this.cachedRunwayDays = burnPerDay > 0 ? this.cash / burnPerDay : Infinity;
    if (this.cash < 0) {
      this.cash = 0;
    }
    this.daysSinceLastRaise += dtDays;
  }

  shouldStartNextRound() {
    if (!this.strategy) return false;
    return this.strategy.shouldStartNextRound();
  }

  calculateRoundHealth() {
    if (!this.strategy) return 1;
    return this.strategy.calculateRoundHealth(this.currentStage);
  }

  syncPostGateMultiple(currentDate) {
    const nowMs = currentDate ? currentDate.getTime() : Date.now();
    const baseMs = this.postGateStartDate ? this.postGateStartDate.getTime() : nowMs;
    const years = Math.max(0, (nowMs - baseMs) / YEAR_MS);
    const range = this.postGateInitialMultiple - this.postGateBaselineMultiple;
    let decayShare = this.postGateMultipleDecayYears > 0 ? Math.min(1, years / this.postGateMultipleDecayYears) : 1;
    if (this.hypergrowthActive) {
      decayShare *= 0.25;
    }
    const nextMultiple = this.postGateInitialMultiple - range * decayShare;
    this.currentMultiple = Math.max(this.postGateBaselineMultiple, nextMultiple);
  }

  enterPostGateMode(currentDate) {
    this.postGateMode = true;
    this.postGatePending = false;
    this.hypergrowthActive = true;
    this.hypergrowthElapsedYears = 0;
    this.postGateStartDate = currentDate ? new Date(currentDate) : new Date();
    const baselineMultiple = this.postGateInitialMultiple;
    let baselineRevenue = this.revenue;
    if (!baselineRevenue || baselineRevenue <= 0) {
      baselineRevenue = Math.max(this.currentValuation / Math.max(baselineMultiple, 1), 1_000_000);
    }
    this.revenue = Math.max(1, baselineRevenue);
    const target = this.revenue * this.hypergrowthTotalMultiplier;
    this.hypergrowthTargetRevenue = Math.min(this.longRunRevenueCeiling, target);
    if (this.hypergrowthTargetRevenue < this.revenue) {
      this.hypergrowthTargetRevenue = this.revenue;
      this.hypergrowthActive = false;
    }
    this.profit = this.revenue * this.postGateMargin;
    this.currentMultiple = baselineMultiple;
    this.lastFairValue = Math.max(1, this.revenue * this.currentMultiple);
  }

  generateRound(currentDate) {
    const stage = this.currentStage;
    if (!stage || stage.id === 'ipo') {
      this.currentRound = null;
      return;
    }
    const raiseRange = Array.isArray(stage.raiseFraction) && stage.raiseFraction.length >= 2
      ? stage.raiseFraction
      : [0.15, 0.3];
    const raiseFraction = between(raiseRange[0], raiseRange[1]);
    const baseFairValue = this.computeFairValue(true);
    const prevValuation = Math.max(1, this.currentValuation || this.lastFairValue || 1);
    const multiplierRange = Array.isArray(stage.preMoneyMultiplier) && stage.preMoneyMultiplier.length >= 2
      ? stage.preMoneyMultiplier
      : [1.05, 1.25];
    const minFairValue = prevValuation * multiplierRange[0];
    const maxFairValue = prevValuation * multiplierRange[1];
    const fairValue = clampValue(baseFairValue, minFairValue, maxFairValue);
    const preMoney = fairValue;
    const raiseAmount = Math.max(500_000, fairValue * raiseFraction);
    const postMoney = preMoney + raiseAmount;
    const monthsRange = Array.isArray(stage.monthsToNextRound) && stage.monthsToNextRound.length >= 2
      ? stage.monthsToNextRound
      : [12, 18];
    let runwayMonths = between(monthsRange[0], monthsRange[1]);
    let durationDays = stage.durationDays
      ? Math.max(30, stage.durationDays)
      : Math.max(60, Math.round(Math.max(2, runwayMonths * 0.35) * 30)) * 3;
    let pipelineStageName = null;

    let nextRound = {
      stageId: stage.id,
      stageLabel: stage.label,
      preMoney,
      raiseAmount,
      postMoney,
      equityOffered: raiseAmount / postMoney,
      successProb: typeof stage.successProb === 'number' ? stage.successProb : 0.85,
      durationDays,
      runwayMonths,
      playerCommitted: false,
      openedOn: new Date(currentDate || new Date()),
      fairValue: fairValue,
      pipelineStage: pipelineStageName,
      stageReadyToResolve: false
    };
    if (this.strategy) {
      nextRound = this.strategy.configureRound(stage, nextRound);
    }
    if (!nextRound) {
      this.currentRound = null;
      return;
    }
    this.currentRound = nextRound;
    this.daysSinceRound = 0;
    this.status = 'raising';
  }

  getStatusLabel() {
    if (this.status === 'failed') return 'Failed';
    if (this.status === 'ipo') return 'Exited (IPO)';
    if (this.status === 'ipo_pending') return 'IPO Ready';
    if (this.status === 'exited') return 'Exited';
    return 'Raising';
  }

  getPlayerValuation() {
    if (this.status === 'failed' || this.status === 'exited') return 0;
    const equityValue = this.playerEquity ? this.playerEquity * this.currentValuation : 0;
    return equityValue > 0 ? equityValue : 0;
  }

  leadRound() {
    if (!this.currentRound || this.status !== 'raising') {
      return { success: false, reason: 'Not currently raising.' };
    }
    if (this.currentRound.playerCommitted) {
      return { success: false, reason: 'You already led this round.' };
    }
    this.currentRound.playerCommitted = true;
    this.currentRound.playerCommitAmount = this.currentRound.raiseAmount;
    this.pendingCommitment = (this.pendingCommitment || 0) + this.currentRound.raiseAmount;
    return {
      success: true,
      raiseAmount: this.currentRound.raiseAmount,
      equityOffered: this.currentRound.equityOffered,
      stageLabel: this.currentRound.stageLabel
    };
  }

  advance(dtDays, currentDate) {
    if (!this.isPrivatePhase) return [];
    if (this.status === 'failed' || this.status === 'exited') return [];
    this.stageChanged = false;
    this.progressCompanyClock(dtDays, currentDate);
    if (this.pendingHardTechFailure) {
      const failureEvent = this.pendingHardTechFailure;
      this.pendingHardTechFailure = null;
      return [failureEvent];
    }
    this.accumulateFinancials(dtDays, currentDate);
    this.recordHistory(currentDate);
    if (!this.currentRound && this.shouldStartNextRound()) {
      this.generateRound(currentDate);
    }
    if (!this.currentRound) return [];

    this.daysSinceRound += dtDays;
    const events = [];

    const stage = this.currentStage;
    if (!this.strategy || !this.strategy.shouldResolveRound(stage)) {
      return events;
    }

    const closingRound = this.currentRound;
    const healthScore = this.calculateRoundHealth();
    const baseProb = stage && stage.successProb ? stage.successProb : 0;
    const performanceFactor = healthScore >= 0.65
      ? 1
      : clampValue(0.25 + 1.15 * healthScore, 0.2, 1);
    let successChance = clampValue(baseProb * performanceFactor, 0.01, 0.995);
    const autoBackersInterested = healthScore >= 0.4;
    if (!closingRound.playerCommitted && !autoBackersInterested) {
      successChance = 0;
    }
    const roundFailuresEnabled = false;
    let success;
    if (!roundFailuresEnabled) {
      success = true;
    } else if (closingRound.playerCommitted && !autoBackersInterested) {
      success = true; // only the player kept this round alive
    } else {
      success = Math.random() < successChance;
    }
    const stageWasGate = stage && stage.id === this.gateStageId;

    const preMoney = closingRound.fairValue ?? this.computeFairValue(false);
    const raiseAmount = closingRound.raiseAmount;
    const postMoney = preMoney + raiseAmount;
    const equityOffered = closingRound.equityOffered;
    const dilutedEquity = this.playerEquity * (preMoney / postMoney);

    if (!success && roundFailuresEnabled) {
      const refundAmount = closingRound.playerCommitted ? (closingRound.playerCommitAmount || 0) : 0;
      if (refundAmount > 0) {
        this.pendingCommitment = Math.max(0, this.pendingCommitment - refundAmount);
      }
      const failEvent = {
        companyId: this.id,
        name: this.name,
        valuation: this.currentValuation,
        revenue: this.revenue,
        profit: this.profit,
        refund: refundAmount
      };

      this.consecutiveFails = (this.consecutiveFails || 0) + 1;
      const collapse = this.consecutiveFails >= this.maxFailuresBeforeCollapse;

      if (collapse) {
        this.playerEquity = 0;
        this.currentValuation = 0;
        this.status = 'failed';
        this.lastEventNote = `${closingRound.stageLabel} round collapsed twice. Operations halted.`;
        this.currentRound = null;
        this.stageChanged = true;
        this.playerInvested = 0;
        this.pendingCommitment = 0;
        this.updateFinancialsFromValuation();
        this.recordHistory(currentDate);
        this.postGateMode = false;
        this.postGatePending = false;
        this.hypergrowthActive = false;
        failEvent.type = 'venture_failed';
        events.push(failEvent);
        return events;
      }

      const haircut = this.binarySuccess ? between(0.35,0.45) : between(0.5,0.65);
      this.currentValuation = Math.max(1, preMoney * haircut);
      this.lastEventNote = `${closingRound.stageLabel} round slipped; valuation reset to $${Math.round(this.currentValuation).toLocaleString()}.`;
      this.pendingCommitment = 0;
      this.currentRound = null;
      this.stageChanged = false;
      this.updateFinancialsFromValuation();
      this.recordHistory(currentDate);
      this.generateRound(currentDate);
      failEvent.type = 'venture_round_failed';
      events.push(failEvent);
      return events;
    }

    this.consecutiveFails = 0;
    let updatedEquity = dilutedEquity;
    if (closingRound.playerCommitted) {
      updatedEquity += equityOffered;
      this.playerInvested += this.pendingCommitment || 0;
      this.pendingCommitment = 0;
    }
    this.playerEquity = updatedEquity;
    this.currentValuation = postMoney;
    this.updateFinancialsFromValuation();
    this.recordHistory(currentDate);

    const runwayMonths = closingRound.runwayMonths || between(stage.monthsToNextRound[0], stage.monthsToNextRound[1]);
    const runwayDays = Math.max(120, Math.round(runwayMonths * 30));
    this.cash += raiseAmount;
    this.runwayTargetDays = runwayDays;
    this.daysSinceLastRaise = 0;
    this.raiseTriggerCash = Math.max(raiseAmount * 0.35, this.cashBurnPerDay * 90, 250_000);
    this.lastRoundRevenue = this.revenue;
    this.lastRoundMargin = this.revenue > 0 ? this.profit / Math.max(this.revenue, 1) : -1;
    this.currentRound = null;

    if (stageWasGate && success) {
      this.gateCleared = true;
      this.postGatePending = true;
    } else if (this.postGatePending && success) {
      this.enterPostGateMode(currentDate);
      this.recordHistory(currentDate);
    }

    const reachedTarget = this.stageIndex >= this.targetStageIndex || stage.id === 'pre_ipo' || stage.id === 'ipo';
    if (reachedTarget) {
      this.stageIndex = Math.max(0, this.roundDefinitions.length - 1);
      this.status = 'ipo_pending';
      const finalValuation = this.currentValuation;
      this.lastEventNote = `IPO set at $${finalValuation.toLocaleString()}.`;
      this.stageChanged = true;
      events.push({
        type: 'venture_ipo',
        companyId: this.id,
        name: this.name,
        valuation: finalValuation,
        playerEquity: this.playerEquity,
        revenue: this.revenue,
        profit: this.profit,
        companyRef: this
      });
      return events;
    }

    const previousStageLabel = closingRound.stageLabel;
    if (this.archetype !== 'hardtech') {
      this.stageIndex = Math.min(this.stageIndex + 1, Math.max(0, this.roundDefinitions.length - 1));
    }
    const displayValuation = this.currentValuation;
    const cashNote = Math.round(raiseAmount).toLocaleString();
    this.stageChanged = true;
    this.generateRound(currentDate);
    const nextStageLabel = this.currentStage ? this.currentStage.label : 'Next round';
    this.lastEventNote = `${previousStageLabel} round closed; +$${cashNote} cash, valuation now $${displayValuation.toLocaleString()}. Next: ${nextStageLabel}.`;
    return events;
  }

  getSummary() {
    return {
      id: this.id,
      name: this.name,
      sector: this.sector,
      valuation: this.currentValuation,
      stageLabel: this.currentStage ? this.currentStage.label : 'N/A',
      status: this.getStatusLabel(),
      playerEquityPercent: this.playerEquity * 100,
      pendingCommitment: this.pendingCommitment || 0,
      lastEventNote: this.lastEventNote,
      revenue: this.revenue,
      profit: this.profit,
      playerCommitted: !!(this.currentRound && this.currentRound.playerCommitted),
      cash: this.cash,
      runwayDays: isFinite(this.cachedRunwayDays) ? this.cachedRunwayDays : null
    };
  }

  getDetail() {
    const round = this.currentRound;
    const stage = this.currentStage;
    const daysRemaining = round ? Math.max(0, round.durationDays - this.daysSinceRound) : 0;
    return {
      id: this.id,
      name: this.name,
      sector: this.sector,
      description: this.description,
      valuation: this.currentValuation,
      stageLabel: stage ? stage.label : 'N/A',
      status: this.getStatusLabel(),
      playerEquity: this.playerEquity,
      playerEquityPercent: this.playerEquity * 100,
      playerInvested: this.playerInvested,
      pendingCommitment: this.pendingCommitment || 0,
      lastEventNote: this.lastEventNote,
      revenue: this.revenue,
      profit: this.profit,
      cash: this.cash,
      runwayDays: isFinite(this.cachedRunwayDays) ? this.cachedRunwayDays : null,
      history: this.history.slice(),
      financialHistory: this.financialHistory.slice(),
      products: this.products.map(product => ({
        label: product.label,
        fullVal: product.fullVal,
        stages: product.stages.map(stage => ({
          id: stage.id,
          name: stage.name,
          duration_days: stage.duration_days,
          success_prob: stage.success_prob,
          depends_on: stage.depends_on,
          completed: stage.completed,
          succeeded: stage.succeeded,
          commercialises_revenue: !!stage.commercialises_revenue
        }))
      })),
      round: round ? {
        stageLabel: round.stageLabel,
        raiseAmount: round.raiseAmount,
        preMoney: round.preMoney,
        postMoney: round.postMoney,
        equityOffered: round.equityOffered,
        successProb: round.successProb,
        daysRemaining,
        playerCommitted: round.playerCommitted,
        playerCommitAmount: round.playerCommitAmount || 0
      } : null
    };
  }

  finalizeIPO() {
    this.status = 'ipo';
    this.playerEquity = 0;
    this.pendingCommitment = 0;
    this.currentRound = null;
    this.exited = true;
    this.lastEventNote = 'Exited via IPO.';
  }

  promoteToPublic(macroEnv, ipoDate) {
    const effectiveDate = ipoDate ? new Date(ipoDate) : new Date();
    this.setPhase('public', { ipoDate: effectiveDate.toISOString() });
    this.status = 'ipo';
    this.macroEnv = macroEnv || this.macroEnv;
    this.ipoDate = effectiveDate;
    this.showDividendColumn = true;
    this.currentRound = null;
    this.pendingCommitment = 0;
    this.postGateMode = false;
    this.postGatePending = false;
    this.hasPipelineUpdate = true;
    this.lastEventNote = `IPO completed at $${Math.round(this.currentValuation).toLocaleString()}.`;
    this.bankrupt = false;
    this.marketCap = this.currentValuation;
    this.displayCap = this.currentValuation;

    const stage = this.getStageFinancials();
    const ps = stage && stage.ps ? stage.ps : 6;
    const macroFactor = this.macroEnv ? this.macroEnv.getValue(this.sector) : 1;
    const revenueSnapshot = Math.max(1, this.revenue || this.currentValuation / Math.max(ps, 1));
    const denom = Math.max(1e-3, macroFactor * Math.max(this.micro || 1, 0.05) * Math.max(this.revMult || 1, 0.05));
    const normalizedBase = (revenueSnapshot + (this.flatRev || 0)) / denom;
    this.baseRevenue = Math.max(1, normalizedBase);

    if (this.marginCurve && isFinite(this.lastRoundMargin)) {
      const startMargin = this.marginCurve.s;
      const endMargin = this.marginCurve.t;
      const span = endMargin - startMargin;
      const targetMargin = Math.max(Math.min(this.lastRoundMargin, Math.max(startMargin, endMargin)), Math.min(startMargin, endMargin));
      if (Math.abs(span) > 1e-4) {
        const ratio = Math.max(0, Math.min(1, (targetMargin - startMargin) / span));
        const targetAgeDays = ratio * this.marginCurve.y * 365;
        if (targetAgeDays > this.ageDays) {
          this.ageDays = targetAgeDays;
        }
      } else if (targetMargin > startMargin) {
        this.ageDays = Math.max(this.ageDays, this.marginCurve.y * 365);
      }
    }

    if (!this.history || this.history.length === 0) {
      this.recordHistory(effectiveDate);
    }
  }

}

class VentureSimulation {
  constructor(configs, startDate) {
    this.companies = (configs || []).map(cfg => new VentureCompany({
      id: cfg.id,
      name: cfg.name,
      sector: cfg.sector,
      description: cfg.description,
      valuation_usd: cfg.valuation_usd,
      funding_round: cfg.funding_round,
      ipo_stage: cfg.ipo_stage,
      binary_success: cfg.binary_success,
      gate_stage: cfg.gate_stage,
      hypergrowth_window_years: cfg.hypergrowth_window_years,
      hypergrowth_total_multiplier: cfg.hypergrowth_total_multiplier,
      long_run_revenue_ceiling_usd: cfg.long_run_revenue_ceiling_usd,
      long_run_growth_rate: cfg.long_run_growth_rate,
      long_run_growth_floor: cfg.long_run_growth_floor,
      long_run_growth_decay: cfg.long_run_growth_decay,
      post_gate_initial_multiple: cfg.post_gate_initial_multiple,
      post_gate_baseline_multiple: cfg.post_gate_baseline_multiple,
      post_gate_multiple_decay_years: cfg.post_gate_multiple_decay_years,
      post_gate_margin: cfg.post_gate_margin,
      max_failures_before_collapse: cfg.max_failures_before_collapse,
      base_business: cfg.base_business,
      finance: cfg.finance,
      costs: cfg.costs,
      archetype: cfg.archetype,
      pipeline: Array.isArray(cfg.pipeline) ? cfg.pipeline : [],
      events: Array.isArray(cfg.events) ? cfg.events : []
    }, startDate));
    this.lastTick = startDate ? new Date(startDate) : new Date('1990-01-01T00:00:00Z');
    this.stageUpdateFlag = false;
  }

  getCompanyById(id) {
    return this.companies.find(c => c.id === id);
  }

  tick(currentDate) {
    if (!currentDate) return [];
    if (!(currentDate instanceof Date)) currentDate = new Date(currentDate);
    const dtDays = Math.max(0, (currentDate - this.lastTick) / VC_DAY_MS);
    this.lastTick = new Date(currentDate);
    if (dtDays <= 0) return [];
    const events = [];
    this.companies.forEach(company => {
      const companyEvents = company.advance(dtDays, currentDate);
      if (company.stageChanged) {
        this.stageUpdateFlag = true;
        company.stageChanged = false;
      }
      if (companyEvents && companyEvents.length) {
        events.push(...companyEvents);
      }
    });
    return events;
  }

  consumeStageUpdates() {
    const flag = this.stageUpdateFlag;
    this.stageUpdateFlag = false;
    return flag;
  }

  leadRound(companyId) {
    const company = this.getCompanyById(companyId);
    if (!company) {
      return { success: false, reason: 'Company not found.' };
    }
    return company.leadRound();
  }

  getCompanySummaries() {
    return this.companies
      .filter(company => !company.exited)
      .map(company => company.getSummary());
  }

  getCompanyDetail(companyId) {
    const company = this.getCompanyById(companyId);
    return company ? company.getDetail() : null;
  }

  extractCompany(companyId) {
    const index = this.companies.findIndex(c => c.id === companyId);
    if (index >= 0) {
      const [company] = this.companies.splice(index, 1);
      return company;
    }
    return null;
  }

  getPlayerHoldingsValue() {
    return this.companies.reduce((sum, company) => sum + company.getPlayerValuation(), 0);
  }

  getPendingCommitments() {
    return this.companies.reduce((sum, company) => sum + (company.pendingCommitment || 0), 0);
  }

  finalizeIPO(companyId) {
    const company = this.extractCompany(companyId);
    if (company) {
      company.finalizeIPO();
      return company;
    }
    return null;
  }
}

/*────────────────── Hypergrowth Company ─────────────────────*/
class HypergrowthCompany extends BaseCompany {
  constructor (cfg, macroEnv, gameStartYear = 1990, ipoDate = new Date(gameStartYear,0,1)) {
    super(cfg, macroEnv, gameStartYear, ipoDate);
    if (!cfg.static || !cfg.static.name) this.name = 'Hypergrowth Co';
    if (!cfg.static || !cfg.static.sector) this.sector = 'Web';

    const rp = (cfg.base_business && cfg.base_business.revenue_process) || { initial_revenue_usd: { min: 2_000_000, max: 40_000_000 } };
    this.arr = between(rp.initial_revenue_usd.min, rp.initial_revenue_usd.max);
    this.initialArr = this.arr;
    this.growthTarget = between(0.8, 2.5);
    this.growthFloor  = between(0.08, 0.35);
    this.growthDecay  = between(0.75, 0.92);
    this.marginStart  = between(-2.0, -0.3);
    this.marginTarget = between(0.08, 0.28);
    this.marginYears  = between(5, 10);

    const fin = cfg.finance || {};
    this.cash      = fin.starting_cash_usd  ?? between(80_000_000, 140_000_000);
    this.debt      = fin.starting_debt_usd  ?? 0;
    this.intRate   = fin.interest_rate_annual ?? 0.06;

    const cost = cfg.costs || {};
    this.opexFixed   = cost.opex_fixed_usd      ?? 25_000_000;
    this.opexVar     = cost.opex_variable_ratio ?? 0.12;

    this.structBias = between(0.8, 1.4);
    this.sentiment = 1;
    this.inflection = { triggered: false };
    this.peakArr = this.arr;
    this.slowExpense = null;
  }

  step(dtDays, gameDate) {
    if (this.bankrupt) return;
    const dtYears = dtDays / 365;
    this.ageDays += dtDays;

    const decayFactor = Math.pow(this.growthDecay, dtYears);
    this.growthTarget = Math.max(this.growthFloor, this.growthTarget * decayFactor);
    if (Math.random() < 0.05 * dtYears) {
      this.growthTarget *= between(0.45, 0.75);
    } else if (Math.random() < 0.02 * dtYears) {
      this.growthTarget *= between(1.15, 1.35);
    }
    if (!this.inflection.triggered && Math.random() < 0.10 * dtYears) {
      this.inflection = {
        triggered: true,
        elapsed: 0,
        durationDays: between(720, 1080),
        startGrowth: this.growthTarget,
        endGrowth: between(-0.25, -0.4),
        tailDecay: between(0.005, 0.01)
      };
      console.log(`[Hypergrowth Inflection] ${this.name} demand collapsed; growth now ${(this.growthTarget * 100).toFixed(1)}% YoY.`);
    }
    if (this.inflection.triggered) {
      this.inflection.elapsed += dtDays;
      const progress = Math.min(1, this.inflection.elapsed / this.inflection.durationDays);
      const target = this.inflection.startGrowth + (this.inflection.endGrowth - this.inflection.startGrowth) * progress;
      this.growthTarget = Math.min(this.growthTarget, target);
      if (progress >= 1) {
        this.growthTarget -= this.inflection.tailDecay * dtYears;
      }
    }
    this.growthTarget = Math.max(-0.8, Math.min(3.0, this.growthTarget));

    this.structBias += Random.gaussian() * 0.005;
    this.structBias = Math.max(0.6, Math.min(1.6, this.structBias));
    this.sentiment += Random.gaussian() * 0.025;
    this.sentiment = Math.max(0.5, Math.min(1.8, this.sentiment));

    const noise = Random.gaussian() * 0.08;
    const effectiveGrowth = Math.max(-0.8, this.growthTarget + noise);
    const growthFactor = Math.pow(1 + effectiveGrowth, dtYears);
    this.arr = Math.max(100000, this.arr * growthFactor);
    this.peakArr = Math.max(this.peakArr, this.arr);

    const progress = Math.min(1, this.ageDays / (365 * this.marginYears));
    let desiredMargin = this.marginStart + (this.marginTarget - this.marginStart) * progress;
    if (effectiveGrowth < 0) {
      desiredMargin -= Math.min(0.25, Math.abs(effectiveGrowth) * 0.3);
    }
    if (this.inflection.triggered) {
      const inflectProgress = Math.min(1, (this.inflection.elapsed || 0) / this.inflection.durationDays);
      desiredMargin -= inflectProgress * 0.15;
    }
    desiredMargin = Math.max(this.marginStart, Math.min(this.marginTarget, desiredMargin));

    const revenueThisTick = this.arr * dtYears;
    const targetExpense = revenueThisTick * (1 - desiredMargin);
    if (this.slowExpense == null) this.slowExpense = targetExpense;

    if (targetExpense >= this.slowExpense) {
      // scaling up spend happens quickly in good times, so margin hugs the desired curve
      this.slowExpense = targetExpense;
    } else {
      // cost cuts lag badly (especially post-inflection) to simulate sticky burn
      const adjustmentRate = this.inflection.triggered ? 0.08 : 0.2;
      this.slowExpense += (targetExpense - this.slowExpense) * Math.min(1, adjustmentRate * dtYears);
    }
    const netIncome = revenueThisTick - this.slowExpense;

    this.cash += netIncome;
    if (this.cash < 0) { this.debt += -this.cash; this.cash = 0; }

    if (this.debt > 0) {
      const interest = this.debt * this.intRate * dtYears;
      this.debt += interest;
      if (this.cash > interest) {
        this.cash -= interest;
        this.debt -= interest;
      }
    }

    const runwayMonths = netIncome < 0 ? (this.cash / Math.max(1, -netIncome)) * 12 : 24;
    if ((this.debt > this.arr * 4 && runwayMonths < 3) || this.arr < 500000 || (this.peakArr > 0 && this.arr / this.peakArr <= 0.1)) {
      this.markBankrupt(gameDate);
      return;
    }

    const growthPercent = effectiveGrowth;
    const multiple = Math.min(35, Math.max(3, 6 + 12 * growthPercent)) * this.structBias * this.sentiment;
    const intrinsicValue = Math.max(5_000_000, this.arr * Math.max(1, multiple));
    this.marketCap = Math.max(intrinsicValue, this.cash - this.debt);
    this.displayCap = this.marketCap;

    this.accumulateYear(revenueThisTick, netIncome);
    this.maybeRecordAnnual(0);
    this.recordHistoryPoint(gameDate);
  }
}

/*────────────────── Simulation ────────────────────*/
class Simulation {
  constructor(cfg, startYear = 1990, dt = 14) {
    this.dtDays = dt;
    this.startYear = startYear;

    // build a set of sectors we will need macros for
    const sectorSet = new Set(cfg.map(c => c.static.sector));
    this.macroEnv = new MacroEnvironment(sectorSet);

    this.companyConfigs = cfg.map(c => ({ ...c, isLive: false, ipoDate: null }));
    this.companies = [];

    this.tick(new Date(startYear, 0, 1));
  }

  tick(gameDate) {
    const dtYears = this.dtDays / 365;

    /* 1. advance macro environment */
    this.macroEnv.step(dtYears);

    /* 2. Check for new IPOs */
    this.companyConfigs.forEach(config => {
      if (config.isLive) return;

      if (!config.ipoDate) {
        if (config.static.ipo_instantly) {
          config.ipoDate = new Date(this.startYear, 0, 1);
        } else {
          const { from, to } = config.static.ipo_window;
          const ipoYear = Math.floor(between(from, to + 1));
          const ipoDay  = Math.floor(between(1, 366));
          const d = new Date(ipoYear, 0, 1);
          d.setDate(ipoDay);
          config.ipoDate = d;
        }
      }

      if (gameDate >= config.ipoDate) {
        let co;
        if (config.preset === 'hypergrowth_web_1990') {
          co = new HypergrowthCompany(config, this.macroEnv, this.startYear, config.ipoDate);
        } else {
          co = new Company(config, this.macroEnv, this.startYear, config.ipoDate);
        }
        if (config.initialHistory) {
          const normalizedHistory = (config.initialHistory.history || []).slice().sort((a, b) => a.x - b.x);
          if (normalizedHistory.length === 1) {
            normalizedHistory.unshift({ x: normalizedHistory[0].x - SIM_DAY_MS, y: normalizedHistory[0].y });
          }
          if (normalizedHistory.length > 0) {
            co.history = normalizedHistory.map(point => ({ x: point.x, y: point.y }));
            co.marketCap = normalizedHistory[normalizedHistory.length - 1].y;
            co.displayCap = co.marketCap;
          }
          if (config.initialHistory.financialHistory) {
            co.financialHistory = config.initialHistory.financialHistory.map(entry => ({
              year: entry.year,
              revenue: entry.revenue,
              profit: entry.profit,
              marketCap: entry.marketCap || co.marketCap,
              cash: entry.cash || 0,
              debt: entry.debt || 0,
              dividend: entry.dividend || 0,
              ps: entry.ps || (entry.revenue > 0 ? (entry.marketCap || co.marketCap) / entry.revenue : 0),
              pe: entry.pe || (entry.profit > 0 ? (entry.marketCap || co.marketCap) / entry.profit : 0)
            }));
            co.newAnnualData = true;
          }
        }
        this.companies.push(co);
        config.isLive = true;
      }
    });

    // prune configs for performance
    this.companyConfigs = this.companyConfigs.filter(c => !c.isLive);

    /* 3. Step live companies */
    this.companies.forEach(c => c.step(this.dtDays, gameDate));
  }

  adoptVentureCompany(company, ipoDate) {
    if (!company) return;
    const effectiveDate = ipoDate ? new Date(ipoDate) : new Date();
    company.promoteToPublic(this.macroEnv, effectiveDate);
    this.companies.push(company);
  }
}

if (typeof window !== 'undefined') {
  window.Simulation = Simulation;
  window.VentureSimulation = VentureSimulation;
  window.VC_STAGE_CONFIG = VC_STAGE_CONFIG;
}
