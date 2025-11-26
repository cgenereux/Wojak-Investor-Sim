(function (global) {
  // Simple deterministic PRNG (mulberry32) for seeded runs; defaults to Math.random if not set.
  const createDeterministicRng = (seed = Date.now()) => {
    let a = (typeof seed === 'number' ? seed : Math.abs(hashString(seed.toString()))) >>> 0;
    return function next () {
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
    static gaussian (rngFn = random) {
      let u = 0;
      let v = 0;
      while (!u) u = rngFn();
      while (!v) v = rngFn();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
  }

  class SeededRandom {
    constructor (seed = Date.now()) {
      this.seed = seed;
      this.prng = createDeterministicRng(seed);
    }
    random () { return this.prng(); }
    gaussian () {
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

  class MarginCurve {
    constructor (s, t, y) {
      this.s = s;
      this.t = t;
      this.y = Math.max(0.01, y);
    }
    value (x) {
      return lerp(this.s, this.t, x / this.y);
    }
  }

  class MultipleCurve {
    constructor (ps, pe, y) {
      this.ps = ps;
      this.pe = pe;
      this.y = Math.max(0.01, y);
    }
    value (x, margin) {
      return lerp(this.ps, this.pe * margin, x / this.y);
    }
  }

  const sectorMicro = {
    Biotech:       { mu: +0.02, sigma: 0.35 },
    Semiconductor: { mu: +0.04, sigma: 0.30 },
    Retail:        { mu: +0.01, sigma: 0.15 },
    DEFAULT:       { mu: +0.02, sigma: 0.20 }
  };

  const sectorMargin = {
    Biotech:        0.25,
    Semiconductor:  0.18,
    Tech:           0.22,
    Retail:         0.06,
    DEFAULT:        0.15
  };

  class MacroEnvironment {
    constructor (sectorsSet, eventManager = null) {
      this.defaultParams = { mu: 0.12, sigma: 0.15 };
      this.sectorPresets = {
        Biotech:        { mu: 0.08, sigma: 0.25 },
        Semiconductor:  { mu: 0.10, sigma: 0.30 },
        Tech:           { mu: 0.165, sigma: 0.22 },
        Retail:         { mu: 0.12, sigma: 0.10 }
      };
      this.eventManager = eventManager || null;

      this.idxs = {};
      sectorsSet.forEach(sec => {
        const p = this.sectorPresets[sec] || this.defaultParams;
        this.idxs[sec] = { value: 1, mu: p.mu, sigma: p.sigma };
      });

      if (!this.idxs.DEFAULT) {
        this.idxs.DEFAULT = {
          value: 1,
          mu: this.defaultParams.mu,
          sigma: this.defaultParams.sigma
        };
      }

      this.events = [];
    }

    step (dtYears) {
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

    ensureSector (sector) {
      if (!sector) return;
      if (!this.idxs[sector]) {
        const p = this.sectorPresets[sector] || this.defaultParams;
        this.idxs[sector] = { value: 1, mu: p.mu, sigma: p.sigma };
      }
    }

    getValue (sector) {
      this.ensureSector(sector);
      const entry = this.idxs[sector] || this.idxs.DEFAULT || { value: 1 };
      return entry.value;
    }

    getMu (sector) {
      this.ensureSector(sector);
      const entry = this.idxs[sector] || this.idxs.DEFAULT || { mu: this.defaultParams.mu };
      return entry.mu;
    }

    getRevenueMultiplier(sector) {
      if (!this.eventManager) return 1;
      return this.eventManager.getRevenueMultiplier(sector);
    }
  }

  class Stage {
    constructor (c) {
      Object.assign(this, c);
      this.commercialises_revenue = !!c.commercialises_revenue;
      this.cost = c.cost_usd || 0;
      this.max_retries = c.max_retries ?? 0;
      this.tries = 0;
      this.elapsed = 0;
      this.completed = false;
      this.succeeded = false;
    }

    canStart (done) {
      return !this.completed && (!this.depends_on || done.has(this.depends_on));
    }

    advance (dt, rng, company) {
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
    constructor (c) {
      this.label = c.label || c.id;
      this.fullVal = c.full_revenue_usd;
      this.stages = c.stages.map(s => new Stage(s));
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

    realisedRevenuePerYear () {
      return this.isCommercialised() ? this.fullVal : 0;
    }

    expectedValue () {
      let probAcc = 1;
      let exp = 0;
      for (const st of this.stages) {
        if (st.completed && st.succeeded) continue;
        probAcc *= st.success_prob;
        exp = this.fullVal * probAcc;
      }
      return exp * 0.25;
    }

    advance (dt, rng, company) {
      const done = new Set(this.stages.filter(s => s.completed && s.succeeded).map(s => s.id));
      this.stages.forEach(st => {
        if (st.canStart(done)) st.advance(dt, rng, company, this.label);
      });
    }

    get hasMarket () { return this.isCommercialised(); }
    get hasFailure () { return this.stages.some(s => s.completed && !s.succeeded); }
  }

  class TimedEffect {
    constructor (c) {
      this.t = c.type;
      this.v = c.value_usd || c.multiplier || c.value;
      this.left = c.duration_days || 0;
      this.apply = c.apply || (() => {});
      this.revert = c.revert || (() => {});
    }
  }

  class ScheduledEvent {
    constructor (c) {
      this.label = c.label || c.id;
      this.intervalDays = c.interval_days || 365;
      this.timer = between(0, this.intervalDays);
      this.effects = c.effects.map(e => new TimedEffect(e));
    }

    maybe (dtDays) {
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
    MacroEnvironment,
    Stage,
    Product,
    TimedEffect,
    ScheduledEvent
  };
})(typeof globalThis !== 'undefined'
    ? globalThis
    : (typeof window !== 'undefined' ? window : this));
