(function (global) {
  // Simple deterministic PRNG (mulberry32) for seeded runs; defaults to Math.random if not set.
  const createDeterministicRng = (seed = Date.now()) => {
    let a = (typeof seed === 'number' ? seed : Math.abs(hashString(seed.toString()))) >>> 0;
    return function next() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const hashString = (str) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    }
    return h >>> 0;
  };

  let randomSource = Math.random;
  const setRandomSource = (fn) => {
    randomSource = typeof fn === 'function' ? fn : Math.random;
  };
  const withRandomSource = (fnOrSource, fnMaybe) => {
    const hasFn = typeof fnMaybe === 'function';
    const rng = hasFn ? fnOrSource : fnMaybe;
    const fn = hasFn ? fnMaybe : fnOrSource;
    if (typeof fn !== 'function') return undefined;
    const prev = randomSource;
    if (typeof rng === 'function') {
      randomSource = rng;
    }
    try {
      return fn();
    } finally {
      randomSource = prev;
    }
  };
  const random = () => randomSource();

  const SIM_DAY_MS = 24 * 60 * 60 * 1000;

  class Random {
    static gaussian(rngFn = random) {
      let u = 0;
      let v = 0;
      while (!u) u = rngFn();
      while (!v) v = rngFn();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
  }

  class SeededRandom {
    constructor(seed = Date.now()) {
      this.seed = seed;
      this.prng = createDeterministicRng(seed);
    }
    random() { return this.prng(); }
    gaussian() {
      let u = 0;
      let v = 0;
      while (!u) u = this.random();
      while (!v) v = this.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
  }

  const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
  const between = (lo, hi, rngFn = random) => lo + rngFn() * (hi - lo);
  const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));

  // Canonical sector mapping: collapse legacy labels into a stable set.
  const SECTOR_CANONICAL_MAP = {
    // Core tech + web-style
    tech: 'Technology',
    technology: 'Technology',
    web: 'Technology',
    aerospace: 'Technology',
    rockets: 'Technology',
    'rocket technology': 'Technology',
    'deep tech': 'Technology',
    'hard tech': 'Technology',
    semiconductor: 'Technology',

    // Bio / health
    biotech: 'BioTech',
    'bio tech': 'BioTech',
    biotechnology: 'BioTech',
    healthcare: 'Healthcare',
    'health care': 'Healthcare',

    // Finance / banking / real estate
    banking: 'Finance',
    finance: 'Finance',
    'real estate': 'Finance',

    // Industrial / materials
    industrial: 'Industrial',
    manufacturing: 'Industrial',
    automotive: 'Industrial',
    general: 'Industrial',
    private: 'Industrial',

    // Energy / defense / retail
    energy: 'Energy',
    defense: 'Industrial',
    retail: 'Retail',
    'consumer staples': 'Retail',

    // Travel folded into Industrial
    airlines: 'Industrial',
    travel: 'Industrial',
    transportation: 'Industrial',
    'travel & transport': 'Industrial',

    // Materials
    materials: 'Materials'
  };

  const normalizeSector = (input) => {
    if (!input) return input;
    const key = String(input).trim().toLowerCase();
    const mapped = SECTOR_CANONICAL_MAP[key];
    return mapped || input;
  };

  class MarginCurve {
    constructor(s, t, y) {
      this.s = s;
      this.t = t;
      this.y = Math.max(0.01, y);
    }
    value(x) {
      return lerp(this.s, this.t, x / this.y);
    }
  }

  class MultipleCurve {
    constructor(ps, pe, y) {
      this.ps = ps;
      this.pe = pe;
      this.y = Math.max(0.01, y);
    }
    value(x, margin) {
      return lerp(this.ps, this.pe * margin, x / this.y);
    }
  }

  const sectorMicro = {
    BioTech: { mu: +0.026, sigma: 0.145 },
    Finance: { mu: +0.02, sigma: 0.065 },
    Retail: { mu: +0.013, sigma: 0.06 },
    Technology: { mu: +0.026, sigma: 0.08},
    Healthcare: { mu: +0.019, sigma: 0.070 }, 
    Energy:     { mu: +0.018, sigma: 0.110 },
    Industrial: { mu: +0.017, sigma: 0.085 }, 
    Materials:  { mu: +0.018, sigma: 0.095 }, 
    DEFAULT: { mu: +0.026, sigma: 0.08 }
  };

  const sectorMargin = {
    BioTech: 0.25,
    Technology: 0.22,
    Finance: 0.16,
    Retail: 0.09,
    Energy: 0.14,
    Materials: 0.13,
    Industrial: 0.11,
    DEFAULT: 0.15
  };

  // Optional subsector-level overrides. If a company's subsector matches one
  // of these keys, it will use these micro/margin parameters instead of the
  // parent sector's defaults. Values are initialized to match Technology so
  // behavior is unchanged until tuned.
  const subsectorMicro = {
    'Web Technology': { mu: sectorMicro.Technology.mu, sigma: sectorMicro.Technology.sigma },
    'Hardware Technology': { mu: sectorMicro.Technology.mu, sigma: sectorMicro.Technology.sigma },
    'Material Technology': { mu: sectorMicro.Technology.mu, sigma: sectorMicro.Technology.sigma },
    'Aerospace Technology': { mu: sectorMicro.Technology.mu, sigma: sectorMicro.Technology.sigma },
    'Space Technology': { mu: sectorMicro.Technology.mu, sigma: sectorMicro.Technology.sigma }
  };

  const subsectorMargin = {
    'Web Technology': .19,
    'Hardware Technology': .20,
    'Material Technology': .31,
    'Aerospace Technology': .29,
    'Space Technology': 0.32
  };

  class MacroEnvironment {
    constructor(sectorsSet, eventManager = null) {
      this.defaultParams = { mu: 0.16, sigma: 0.12 };
      this.sectorPresets = {
        BioTech: { mu: 0.15, sigma: 0.21 },
        Technology: { mu: 0.215, sigma: 0.18 },
        Finance: { mu: 0.16, sigma: 0.13 },
        Retail: { mu: 0.15, sigma: 0.08 },

        Energy:     { mu: 0.184,  sigma: 0.14 },
        Industrial: { mu: 0.156,  sigma: 0.11 }, 
        Materials:  { mu: 0.165, sigma: 0.19 },
        Healthcare: { mu: 0.17,  sigma: 0.14 }
      };
      this.eventManager = eventManager || null;

      const buildBiasState = (range = [0.9, 1.1], halfLifeYears = 12, sigmaFactor = 0.3) => {
        const [lo, hi] = Array.isArray(range) && range.length >= 2 ? range : [0.9, 1.1];
        const lower = Math.max(0.2, Math.min(lo, hi));
        const upper = Math.max(lower + 0.05, Math.max(lo, hi));
        const k = Math.log(2) / Math.max(0.25, halfLifeYears);
        const span = Math.max(0.01, upper - lower);
        const sigma = span * sigmaFactor;
        const value = lower + random() * span;
        return { value, lower, upper, k, sigma };
      };

      const stepBias = (state, dtYears) => {
        if (!state || dtYears <= 0) return;
        const noise = Random.gaussian();
        const next = state.value + state.k * (1 - state.value) * dtYears + state.sigma * Math.sqrt(dtYears) * noise;
        state.value = clampValue(next, state.lower, state.upper);
      };

      this.stepBias = stepBias;

      this.marketBiasState = buildBiasState([0.8, 1.3], 14, 0.4);
      this.sectorBiasStates = {};

      this.idxs = {};
      sectorsSet.forEach(rawSec => {
        const sec = normalizeSector(rawSec);
        if (!sec) return;
        const p = this.sectorPresets[sec] || this.defaultParams;
        this.idxs[sec] = { value: 1, mu: p.mu, sigma: p.sigma };
        this.sectorBiasStates[sec] = buildBiasState([0.75, 1.5], 10, 0.35);
      });

      if (!this.idxs.DEFAULT) {
        this.idxs.DEFAULT = {
          value: 1,
          mu: this.defaultParams.mu,
          sigma: this.defaultParams.sigma
        };
        this.sectorBiasStates.DEFAULT = buildBiasState([0.75, 1.5], 10, 0.35);
      }

      this.events = [];
    }

    step(dtYears) {
      this.stepBias(this.marketBiasState, dtYears);
      Object.values(this.sectorBiasStates).forEach(state => this.stepBias(state, dtYears));

      const muDelta = this.eventManager ? this.eventManager.getMacroMuDelta() : 0;
      const volMult = this.eventManager ? this.eventManager.getVolatilityMultiplier() : 1;
      Object.values(this.idxs).forEach(idx => {
        const effectiveMu = idx.mu + muDelta;
        const effectiveSigma = Math.max(0.01, idx.sigma * volMult);
        idx.value *= Math.exp(
          (effectiveMu - 0.5 * effectiveSigma * effectiveSigma) * dtYears +
          effectiveSigma * Math.sqrt(dtYears) * Random.gaussian()
        );
      });
    }

    ensureSector(sectorRaw) {
      const sector = normalizeSector(sectorRaw);
      if (!sector) return;
      if (!this.idxs[sector]) {
        const p = this.sectorPresets[sector] || this.defaultParams;
        this.idxs[sector] = { value: 1, mu: p.mu, sigma: p.sigma };
        this.sectorBiasStates[sector] = this.sectorBiasStates.DEFAULT
          ? { ...this.sectorBiasStates.DEFAULT }
          : buildBiasState([0.75, 1.5], 10, 0.35);
      }
    }

    getValue(sectorRaw) {
      const sector = normalizeSector(sectorRaw);
      this.ensureSector(sector);
      const entry = this.idxs[sector] || this.idxs.DEFAULT || { value: 1 };
      return entry.value;
    }

    getMu(sectorRaw) {
      const sector = normalizeSector(sectorRaw);
      this.ensureSector(sector);
      const entry = this.idxs[sector] || this.idxs.DEFAULT || { mu: this.defaultParams.mu };
      return entry.mu;
    }

    getSentimentMultiplier(sectorRaw) {
      const sector = normalizeSector(sectorRaw);
      this.ensureSector(sector);
      const market = this.marketBiasState ? this.marketBiasState.value : 1;
      const sectorState = this.sectorBiasStates[sector] || this.sectorBiasStates.DEFAULT;
      const sectorBias = sectorState ? sectorState.value : 1;
      return market * sectorBias;
    }

    getRevenueMultiplier(sectorRaw) {
      const sector = normalizeSector(sectorRaw);
      const eventMult = this.eventManager ? this.eventManager.getRevenueMultiplier(sector) : 1;
      const biasMult = this.eventManager && typeof this.eventManager.getRevenueBiasMultiplier === 'function'
        ? this.eventManager.getRevenueBiasMultiplier(sector)
        : 1;
      const market = this.marketBiasState ? this.marketBiasState.value : 1;
      const sectorState = this.sectorBiasStates[sector] || this.sectorBiasStates.DEFAULT;
      const sectorBias = sectorState ? sectorState.value : 1;
      // Constrain revenue influence so it nudges ~±25% at extremes.
      const revBias = clampValue(market * sectorBias * biasMult, 0.75, 1.25);
      return revBias * eventMult;
    }
  }

  class Stage {
    constructor(c) {
      Object.assign(this, c);
      this.commercialises_revenue = !!c.commercialises_revenue;
      this.cost = c.cost_usd || 0;
      this.max_retries = c.max_retries ?? 0;
      this.tries = 0;
      this.elapsed = 0;
      this.completed = false;
      this.succeeded = false;
    }

    canStart(done) {
      return !this.completed && (!this.depends_on || done.has(this.depends_on));
    }

    advance(dt, rng, company) {
      if (this.completed) return;
      company.rdOpex += this.cost * dt / 365;
      this.elapsed += dt;
      if (this.elapsed < this.duration_days) return;

      this.tries++;
      const hit = rng() < this.success_prob;
      if (hit || this.tries > this.max_retries) {
        this.completed = true;
      } else {
        this.elapsed = 0;
      }
      this.succeeded = hit;
      company.hasPipelineUpdate = true;
    }
  }

  class Product {
    constructor(c) {
      this.label = c.label || c.id;
      // Support range for full_revenue_usd: [min, max] or single number
      const revInput = c.full_revenue_usd;
      if (Array.isArray(revInput) && revInput.length >= 2) {
        this.fullVal = between(revInput[0], revInput[1]);
      } else {
        this.fullVal = Number(revInput) || 0;
      }
      this.stages = c.stages.map(s => new Stage(s));
      this.hypergrowth = c.hypergrowth ? { ...c.hypergrowth } : null;
      this._hypergrowthTriggered = false;
    }

    unlockedValue() {
      let factor = 0;
      for (const st of this.stages) {
        if (!st.completed) break;
        if (!st.succeeded) { factor = 0; break; }
        // Use absolute value_realization (not cumulative) - each stage represents total % of value unlocked
        factor = st.value_realization;
      }
      return this.fullVal * factor;
    }

    isCommercialised() {
      return this.stages.some(
        s => s.commercialises_revenue && s.completed && s.succeeded
      );
    }

    realisedRevenuePerYear() {
      return this.isCommercialised() ? this.fullVal : 0;
    }

    expectedValue() {
      let probAcc = 1;
      let exp = 0;
      for (const st of this.stages) {
        if (st.completed && st.succeeded) continue;
        probAcc *= st.success_prob;
        exp = this.fullVal * probAcc;
      }
      return exp * 0.25;
    }

    advance(dt, rng, company) {
      const done = new Set(this.stages.filter(s => s.completed && s.succeeded).map(s => s.id));
      this.stages.forEach(st => {
        if (st.canStart(done)) st.advance(dt, rng, company, this.label);
      });
    }

    get hasMarket() { return this.isCommercialised(); }
    get hasFailure() { return this.stages.some(s => s.completed && !s.succeeded); }
  }

  class TimedEffect {
    constructor(c) {
      this.t = c.type;
      this.v = c.value_usd || c.multiplier || c.value;
      this.left = c.duration_days || 0;
      this.apply = c.apply || (() => { });
      this.revert = c.revert || (() => { });
    }
  }

  class ScheduledEvent {
    constructor(c) {
      this.label = c.label || c.id;
      this.intervalDays = c.interval_days || 365;
      this.timer = between(0, this.intervalDays);
      this.effects = c.effects.map(e => new TimedEffect(e));
    }

    maybe(dtDays) {
      this.timer -= dtDays;
      if (this.timer > 0) return [];
      this.timer = this.intervalDays;
      return this.effects;
    }
  }

  global.SimShared = {
    SeededRandom,
    createDeterministicRng,
    setRandomSource,
    withRandomSource,
    random,
    Random,
    SIM_DAY_MS,
    lerp,
    between,
    clampValue,
    MarginCurve,
    MultipleCurve,
    sectorMicro,
    sectorMargin,
    subsectorMicro,
    subsectorMargin,
    MacroEnvironment,
    normalizeSector,
    Stage,
    Product,
    TimedEffect,
    ScheduledEvent
  };
})(typeof globalThis !== 'undefined'
  ? globalThis
  : (typeof window !== 'undefined' ? window : this));
