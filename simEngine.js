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
    const defaultParams = {
      mu: 0.06,         // long-run real growth
      sigma: 0.15
    };
    // Example hand-tuned sector overrides
    const sectorPresets = {
      Biotech:        { mu: 0.08, sigma: 0.25 },
      Semiconductor:  { mu: 0.10, sigma: 0.30 },
      Tech:           { mu: 0.12, sigma: 0.22 },
      Retail:         { mu: 0.04, sigma: 0.10 }
    };

    this.idxs = {};
    sectorsSet.forEach(sec => {
      const p = sectorPresets[sec] || defaultParams;
      this.idxs[sec] = {
        value: 1,
        mu:    p.mu,
        sigma: p.sigma
      };
    });

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

  getValue (sector) { return (this.idxs[sector] || this.idxs['DEFAULT']).value; }
  getMu    (sector) { return (this.idxs[sector] || this.idxs['DEFAULT']).mu;    }
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
    console.log(`[${company.name}] ${prod} – ${this.name} ${hit ? 'succeeded' : 'failed'}`
                + (hit ? '' : ` (retry ${this.tries}/${this.max_retries})`));
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
      console.log(`[${co}] Event fired: ${this.desc}`);
      // clone effects
      return this.tpl.map(e => Object.assign(Object.create(Object.getPrototypeOf(e)), e));
    }
    return [];
  }
}

/*────────────────── Company ─────────────────────*/
class Company {
  constructor (cfg, macroEnv, gameStartYear = 1990, ipoDate = new Date(gameStartYear,0,1)) {
    this.id      = cfg.id;
    this.name    = cfg.static.name;
    this.sector  = cfg.static.sector;
    this.ipoDate = ipoDate;

    this.macroEnv = macroEnv;

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
    this.payoutRatio = fin.payout_ratio ?? null;      // 0-1
    this.targetYield = fin.target_yield ?? null;      // 0-1 (e.g. 0.03 = 3 %)

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

    this.ageDays = 0;
    this.marketCap   = 0;
    this.displayCap  = 0;
    this.multFreeze  = null; // unchanged
    this.history     = [];

    /* Tracking annuals */
    this.startYear = gameStartYear;
    this.currentYearRevenue = 0;
    this.currentYearProfit  = 0;
    this.lastYearEnd        = 0;
    this.financialHistory   = [];

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

    /* Bankruptcy simple rule */
    const solvencyDenom = coreAnnual + pipelineAnnual;
    // if (solvencyDenom > 0 && this.debt > 10 * solvencyDenom) {
    //   this.bankrupt = true;
    //   this.marketCap = 0;
    //   console.log(`[BK] ${this.name} filed for bankruptcy`);
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
    
    this.marketCap   = Math.max(0, distressedEnterprise - this.debt + this.cash);
    this.displayCap  = this.marketCap; // UI hook

    /* Histories ---------------------------------------------------------*/
    this.currentYearRevenue += (coreAnnual + pipelineAnnual) * dtYears;
    this.currentYearProfit  += netIncome;

    const curYear  = Math.floor(this.ageDays / 365);
    const lastYear = Math.floor(this.lastYearEnd / 365);
    if (curYear > lastYear && this.ageDays >= 365) {
      const ps = this.currentYearRevenue > 0 ? this.marketCap / this.currentYearRevenue : 0;
      const pe = this.currentYearProfit  > 0 ? this.marketCap / this.currentYearProfit  : 0;
      const actualY = this.ipoDate.getFullYear() + lastYear;
      
      // Dividends (yield or payout ratio)
      let dividend = 0;
      if (this.targetYield !== null) {
          dividend = this.marketCap * this.targetYield;          // per year
      } else if (this.payoutRatio !== null && this.currentYearProfit > 0) {
          dividend = this.currentYearProfit * this.payoutRatio;
      }
      if (dividend > this.cash) dividend = this.cash;    // can't pay what you don't have
      this.cash -= dividend;
      
      this.financialHistory.push({
        year: actualY,
        revenue: this.currentYearRevenue,
        profit:  this.currentYearProfit,
        marketCap: this.marketCap,
        cash: this.cash,
        debt: this.debt,
        dividend: dividend,
        ps, pe
      });
      if (this.financialHistory.length > 10) this.financialHistory.shift();
      this.currentYearRevenue = 0;
      this.currentYearProfit  = 0;
      this.newAnnualData = true;
    }
    this.lastYearEnd = this.ageDays;

    this.history.push({ x: gameDate.getTime(), y: this.marketCap });
  }

  /* unchanged helpers for UI */
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
    let html = `<div class="financial-table"><h3>Financial History</h3><table><thead><tr><th>Year</th><th>Revenue</th><th>Profit</th><th>Cash</th><th>Debt</th><th>Dividend Yield</th><th>P/S</th><th>P/E</th></tr></thead><tbody>`;
    data.forEach(r => {
      html += `<tr><td>${r.year}</td><td>${fmtMoney(r.revenue)}</td><td>${fmtMoney(r.profit)}</td><td>${fmtMoney(r.cash || 0)}</td><td>${fmtMoney(r.debt || 0)}</td><td>${fmtYield(r.dividend, r.marketCap)}</td><td>${fmtRat(r.ps)}</td><td>${fmtRat(r.pe)}</td></tr>`;
    });
    html += `</tbody></table></div>`; return html;
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
        const co = new Company(config, this.macroEnv, this.startYear, config.ipoDate);
        this.companies.push(co);
        config.isLive = true;
        console.log(`[IPO] ${co.name} went public on ${gameDate.toISOString().split('T')[0]}`);
      }
    });

    // prune configs for performance
    this.companyConfigs = this.companyConfigs.filter(c => !c.isLive);

    /* 3. Step live companies */
    this.companies.forEach(c => c.step(this.dtDays, gameDate));
  }
}

if (typeof window !== 'undefined') window.Simulation = Simulation;
