// simEngine.js – continuous-volatility version (non-module build)
// =============================================================
//  • Removes the old “×10 volatility for 3 years” pump hack.
//  • σ is always the base value times active TimedEffects.
// -------------------------------------------------------------

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

/*──────────────────── GBM revenue ──────────────────*/
class RevenueProcess {
  constructor (R0, mu, sigma) { this.R = R0; this.mu = mu; this.s0 = sigma; }
  step (dtYears, volMult) {
    const s = this.s0 * volMult;
    this.R *= Math.exp(
      (this.mu - 0.5 * s * s) * dtYears +
      s * Math.sqrt(dtYears) * Random.gaussian()
    );
    return this.R;
  }
}

/*──────────────────── Pipeline ─────────────────────*/
class Stage {
  constructor (c) {
    Object.assign(this, c);
    this.elapsed   = 0;
    this.completed = false;
    this.succeeded = false;
  }
  canStart (done) { return !this.completed && (!this.depends_on || done.has(this.depends_on)); }
  advance (dt, rng, co, prod) {
    if (this.completed) return;
    this.elapsed += dt;
    if (this.elapsed >= this.duration_days) {
      this.completed  = true;
      this.succeeded  = rng() < this.success_prob;
      console.log(`[${co}] ${prod} – ${this.name} ${this.succeeded ? 'succeeded' : 'failed'}`);
    }
  }
}
class Product {
  constructor (c) {
    this.label  = c.label || c.id;
    this.full   = c.full_revenue_usd;
    this.stages = c.stages.map(s => new Stage(s));
  }
  advance (dt, rng, co) {
    const done = new Set(this.stages.filter(s => s.completed && s.succeeded).map(s => s.id));
    this.stages.forEach(st => { if (st.canStart(done)) st.advance(dt, rng, co, this.label); });
  }
  realised () {
    let factor = 0;
    for (const st of this.stages) {
      if (!st.completed) break;
      if (!st.succeeded) { factor = 0; break; }
      factor += st.value_realization;
    }
    return this.full * factor;
  }
  get hasMarket  () { return this.stages.some(s => s.id === 'market' && s.completed && s.succeeded); }
  get hasFailure () { return this.stages.some(s => s.completed && !s.succeeded); }
}

/*────────────────── Events & effects ──────────────*/
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
      case 'volatility_multiplier':      co.volMult *= this.v; break;
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
      console.log(`[${co}] Event fired: ${this.desc}`);
      return this.tpl.map(e => Object.assign(Object.create(Object.getPrototypeOf(e)), e));
    }
    return [];
  }
}

/*──────────────────── Company ─────────────────────*/
class Company {
  constructor (cfg) {
    /*---- static ----*/
    this.id     = cfg.id;
    this.name   = cfg.static.name;
    this.sector = cfg.static.sector;

    /*---- revenue process ----*/
    const rp = cfg.base_business.revenue_process;
    this.revProc = new RevenueProcess(
      between(rp.initial_revenue_usd.min, rp.initial_revenue_usd.max),
      rp.gbm_drift_annual,
      rp.gbm_volatility_annual
    );

    /*---- curves ----*/
    const mc = cfg.base_business.margin_curve;
    const mu = cfg.base_business.multiple_curve;
    this.marginCurve = new MarginCurve(mc.start_profit_margin, mc.terminal_profit_margin, mc.years_to_mature);
    this.multCurve   = new MultipleCurve(mu.initial_ps_ratio, mu.terminal_pe_ratio, mu.years_to_converge);

    /*---- state ----*/
    this.revMult    = 1;
    this.volMult    = 1;
    this.flatRev    = 0;
    this.cash       = 0;
    this.multFreeze = null;
    this.ageDays    = 0;
    this.marketCap  = 0;
    this.displayCap = 0;
    this.history    = [];

    /*---- pipeline & events ----*/
    this.products = (cfg.pipeline || []).map(p => new Product(p));
    this.events   = (cfg.events   || []).map(e => new ScheduledEvent(e));
    this.effects  = [];
  }

  step (dt) {
    this.ageDays += dt;
    const dtYears  = dt / 365;
    const ageYears = this.ageDays / 365;

    /*── events ──*/
    for (const ev of this.events)
      for (const eff of ev.maybe(dt, this.name)) {
        eff.apply(this);
        this.effects.push(eff);
      }
    this.effects = this.effects.filter(e => {
      if (e.left <= 0) { e.revert(this); return false; }
      e.left -= dt;
      return true;
    });

    /*── pipeline ──*/
    let successThisTick = false;
    for (const p of this.products) {
      const revBefore = p.realised();
      p.advance(dt, Math.random, this.name);
      if (p.realised() > revBefore) successThisTick = true;
    }
    if (successThisTick && this.multFreeze === null) {
      const marginNowTemp = this.marginCurve.value(ageYears);
      this.multFreeze     = this.multCurve.value(ageYears, marginNowTemp);
    }

    /*── revenue ──*/
    const volNow   = this.volMult;   // ← always base volatility
    const realised = this.products.reduce((s, p) => s + p.realised(), 0);
    const RevCore  = this.revProc.step(dtYears, volNow) * this.revMult
                   - this.flatRev + realised;

    /*── valuation ──*/
    const marginNow  = this.marginCurve.value(ageYears);
    const multNow    = this.multFreeze ?? this.multCurve.value(ageYears, marginNow);

    const hasMarket     = this.products.some(p => p.hasMarket);
    const horizonYears  = hasMarket ? 0 : 10;

    const earnNow = RevCore * marginNow;
    const futRev  = RevCore * Math.exp(this.revProc.mu * horizonYears);
    const futEarn = futRev  * this.marginCurve.value(ageYears + horizonYears);

    const multH = this.multFreeze ??
                  this.multCurve.value(
                    ageYears + horizonYears,
                    this.marginCurve.value(ageYears + horizonYears)
                  );

    this.marketCap  = earnNow * multNow + futEarn * multH;
    this.displayCap = this.marketCap;

    this.history.push({ x: Date.now(), y: this.marketCap });
  }
}

/*────────────────── Simulation ────────────────────*/
class Simulation {
  constructor (cfg, dt = 14) {
    this.dtDays    = dt;
    this.companies = cfg.map(c => new Company(c));
    this.tick();
  }
  tick () { this.companies.forEach(c => c.step(this.dtDays)); }
}

/*────────── expose to browser global ──────────────*/
if (typeof window !== 'undefined') window.Simulation = Simulation;