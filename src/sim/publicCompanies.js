(function (global) {
  const shared = global.SimShared || {};
  if (!shared.Random || !shared.MacroEnvironment) {
    throw new Error('SimShared must load before publicCompanies.js');
  }

  const {
    Random,
    random,
    between,
    MarginCurve,
    MultipleCurve,
    sectorMicro,
    sectorMargin,
    Product,
    ScheduledEvent
  } = shared;

  const QUARTER_DAYS = 365 / 4;
  const MAX_QUARTER_HISTORY = 100;
  const PRODUCT_RETIRE_DELAY_DAYS = Math.round(2.5 * 365);

  const sampleRange = (range, fallbackMin, fallbackMax) => {
    if (Array.isArray(range) && range.length >= 2) return between(range[0], range[1]);
    if (typeof range === 'number') return range;
    return between(fallbackMin, fallbackMax);
  };

  const pickWeightedRandom = (items) => {
    if (!Array.isArray(items) || items.length === 0) return null;
    const total = items.reduce((sum, item) => sum + (item.weight || 1), 0);
    let roll = random() * total;
    for (const item of items) {
      roll -= (item.weight || 1);
      if (roll <= 0) return item;
    }
    return items[items.length - 1];
  };

  const cloneProductTemplate = (template, suffix = '') => {
    const baseId = template.id || template.label || 'product';
    const cloneId = suffix ? `${baseId}_${suffix}` : baseId;
    return {
      id: cloneId,
      label: template.label || template.id || 'Product',
      full_revenue_usd: Number(template.full_revenue_usd || template.fullVal || 0),
      stages: Array.isArray(template.stages) ? template.stages.map(stage => ({ ...stage })) : []
    };
  };

  class ProductManager {
    constructor(company, plan) {
      this.company = company;
      this.plan = this.normalizePlan(plan);
      this.spawnQueue = [];
      this.initialized = false;
      this.idCounter = 0;
    }

    normalizePlan(plan) {
      if (!plan) return null;
      const catalog = Array.isArray(plan.catalog) ? plan.catalog : [];
      if (catalog.length === 0) return null;
      const normalized = {
        catalog,
        maxActive: plan.max_active ?? plan.maxActive ?? 2,
        initialCount: plan.initial ?? plan.initial_count ?? 1,
        replacementYears: plan.replacement_years || plan.replacementYears || [8, 12],
        gapYears: plan.gap_years || plan.gapYears || [0.5, 2],
        allowDuplicates: plan.allow_duplicates ?? plan.allowDuplicates ?? false
      };
      normalized.maxActive = Math.max(1, Number(normalized.maxActive) || 1);
      normalized.initialCount = Math.max(0, Number(normalized.initialCount) || 0);
      return normalized;
    }

    tick() {
      if (!this.plan) return;
      if (!this.initialized) {
        this.seedInitialProducts();
        this.initialized = true;
      }
      this.trackCompletionsAndRetire();
      this.scheduleSpawns();
      this.processSpawnQueue();
    }

    seedInitialProducts() {
      let managedCount = this.getManagedProducts().length;
      while (managedCount < this.plan.initialCount && this.trySpawnProduct()) {
        managedCount = this.getManagedProducts().length;
      }
    }

    scheduleSpawns() {
      const products = this.getManagedProducts();
      products.forEach(product => {
        const meta = product.__planMeta;
        if (!meta) return;
        if (!meta.nextSpawnScheduled && this.company.ageDays >= meta.nextSpawnAgeDays) {
          const gapYears = sampleRange(this.plan.gapYears, 0.5, 2);
          const gapDays = Math.max(0, gapYears * 365);
          this.spawnQueue.push({
            spawnAgeDays: this.company.ageDays + gapDays
          });
          meta.nextSpawnScheduled = true;
        }
      });
      this.spawnQueue.sort((a, b) => a.spawnAgeDays - b.spawnAgeDays);
    }

    processSpawnQueue() {
      if (!this.spawnQueue.length) return;
      const now = this.company.ageDays || 0;
      while (this.spawnQueue.length && this.spawnQueue[0].spawnAgeDays <= now) {
        this.trySpawnProduct();
        this.spawnQueue.shift();
      }
    }

    trySpawnProduct() {
      if (!this.plan) return false;
      const template = this.pickNextTemplate();
      if (!template) return false;
      this.ensureCapacityForNew();
      const suffix = `${this.idCounter++}_${Math.floor(random() * 1000000)}`;
      const clone = cloneProductTemplate(template, suffix);
      const product = new Product(clone);
      const replacementYears = sampleRange(this.plan.replacementYears, 8, 12);
      const nextSpawnAgeDays = (this.company.ageDays || 0) + Math.max(0, replacementYears * 365);
      product.__planMeta = {
        managed: true,
        templateId: template.id || template.label || clone.id,
        createdAgeDays: this.company.ageDays || 0,
        nextSpawnAgeDays,
        nextSpawnScheduled: false
      };
      this.company.products.push(product);
      this.company.hasPipelineUpdate = true;
      return true;
    }

    ensureCapacityForNew() {
      const managed = this.getManagedProducts();
      if (managed.length < this.plan.maxActive) return;
      const oldest = managed.reduce((oldestSoFar, product) => {
        const meta = product.__planMeta || {};
        if (!oldestSoFar) return product;
        const oldestMeta = oldestSoFar.__planMeta || {};
        return (meta.createdAgeDays || 0) < (oldestMeta.createdAgeDays || 0) ? product : oldestSoFar;
      }, null);
      if (!oldest) return;
      const idx = this.company.products.indexOf(oldest);
      if (idx >= 0) {
        this.company.products.splice(idx, 1);
        this.company.hasPipelineUpdate = true;
      }
    }

    pickNextTemplate() {
      if (!this.plan || !Array.isArray(this.plan.catalog) || this.plan.catalog.length === 0) return null;
      if (this.plan.allowDuplicates) {
        return pickWeightedRandom(this.plan.catalog);
      }
      const used = new Set(
        this.getManagedProducts()
          .map(p => (p.__planMeta && p.__planMeta.templateId) || null)
          .filter(Boolean)
      );
      const filtered = this.plan.catalog.filter(t => t && t.id ? !used.has(t.id) : true);
      const pool = filtered.length > 0 ? filtered : this.plan.catalog;
      return pickWeightedRandom(pool);
    }

    getManagedProducts() {
      return Array.isArray(this.company.products)
        ? this.company.products.filter(p => p && p.__planMeta && p.__planMeta.managed)
        : [];
    }

    trackCompletionsAndRetire() {
      const products = Array.isArray(this.company.products) ? this.company.products : [];
      const now = this.company.ageDays || 0;
      products.forEach(product => {
        const meta = product.__planMeta || {};
        const stages = Array.isArray(product.stages) ? product.stages : [];
        const allDone = stages.length > 0 && stages.every(s => s.completed);
        const hasFailure = typeof product.hasFailure === 'function'
          ? product.hasFailure()
          : Boolean(product.hasFailure);
        if (!meta.completedAgeDays && (allDone || hasFailure)) {
          meta.completedAgeDays = now;
          product.__planMeta = meta;
        }
        if (meta.completedAgeDays && now - meta.completedAgeDays >= PRODUCT_RETIRE_DELAY_DAYS) {
          const idx = this.company.products.indexOf(product);
          if (idx >= 0) {
            this.company.products.splice(idx, 1);
            this.company.hasPipelineUpdate = true;
          }
        }
      });
    }
  }

  class BaseCompany {
    constructor(cfg, macroEnv, gameStartYear = 1990, ipoDate = new Date(gameStartYear, 0, 1)) {
      this.id = cfg.id;
      this.name = (cfg.static && cfg.static.name) || 'Company';
      this.sector = (cfg.static && cfg.static.sector) || 'General';
      this.founders = Array.isArray(cfg.static?.founders) ? cfg.static.founders.map(f => ({ ...f })) : (Array.isArray(cfg.founders) ? cfg.founders.map(f => ({ ...f })) : []);
      this.mission = (cfg.static && cfg.static.mission) || cfg.mission || '';
      this.foundingLocation = (cfg.static && (cfg.static.founding_location || cfg.static.foundingLocation)) || cfg.founding_location || cfg.foundingLocation || '';
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
      this.newQuarterlyData = false;
      this.bankrupt = false;
      this.quarterHistory = [];
      this.currentQuarterRevenue = 0;
      this.currentQuarterProfit = 0;
      this.currentQuarterMeta = null;

      this.cash = 0;
      this.debt = 0;
      this.marketCap = 0;
      this.displayCap = 0;

      this.showDividendColumn = false;
    }

    syncFromSnapshot(snapshot) {
      if (!snapshot) return;
      // Sync basic properties
      if (typeof snapshot.marketCap === 'number') this.marketCap = snapshot.marketCap;
      if (typeof snapshot.valuation === 'number') this.currentValuation = snapshot.valuation; // Handle naming diff
      if (typeof snapshot.cash === 'number') this.cash = snapshot.cash;
      if (typeof snapshot.debt === 'number') this.debt = snapshot.debt;
      if (typeof snapshot.revenue === 'number') this.revenue = snapshot.revenue;
      if (typeof snapshot.profit === 'number') this.profit = snapshot.profit;
      if (typeof snapshot.displayCap === 'number') {
        this.displayCap = snapshot.displayCap;
      } else if (typeof this.marketCap === 'number') {
        this.displayCap = this.marketCap;
      }
      if (Array.isArray(snapshot.founders)) {
        this.founders = snapshot.founders.map(f => ({ ...f }));
      }
      if (typeof snapshot.mission === 'string') {
        this.mission = snapshot.mission;
      }
      if (snapshot.founding_location || snapshot.foundingLocation) {
        this.foundingLocation = snapshot.founding_location || snapshot.foundingLocation;
      }
      if (snapshot.ipoDate) {
        const parsed = new Date(snapshot.ipoDate);
        if (!isNaN(parsed.getTime())) {
          this.ipoDate = parsed;
        }
      }

      // Sync history arrays if provided
      if (Array.isArray(snapshot.history)) {
        this.history = snapshot.history.slice();
      } else if (typeof snapshot.marketCap === 'number' && snapshot.lastTick) {
        // If no full history but we have a tick, append to history
        this.recordHistoryPoint(new Date(snapshot.lastTick), snapshot.marketCap);
      }

      // Sync financial history
      if (Array.isArray(snapshot.financialHistory)) {
        this.financialHistory = snapshot.financialHistory.slice();
        this.financialHistory.sort((a, b) => a.year - b.year);
      }

      // Sync quarter history (Critical for charts)
      if (Array.isArray(snapshot.quarterHistory)) {
        this.quarterHistory = snapshot.quarterHistory.slice();
        this.quarterHistory.sort((a, b) => (a.year - b.year) || (a.quarter - b.quarter));
      }

      // Flags for UI updates
      this.newAnnualData = true;
      this.newQuarterlyData = true;
    }

    accumulateYear(revenueIncrement, profitIncrement, gameDate) {
      this.currentYearRevenue += revenueIncrement;
      this.currentYearProfit += profitIncrement;
      this.accumulateQuarter(revenueIncrement, profitIncrement, gameDate);
    }

    maybeRecordAnnual(dividend = 0) {
      const curYear = Math.floor(this.ageDays / 365);
      const lastYear = Math.floor(this.lastYearEnd / 365);
      if (curYear > lastYear && this.ageDays >= 365) {
        const yearStamp = this.ipoDate.getFullYear() + lastYear;
        const totals = this.sumQuarterTotalsForYear(yearStamp);
        const annualRevenue = totals.quarters > 0 ? totals.revenue : this.currentYearRevenue;
        const annualProfit = totals.quarters > 0 ? totals.profit : this.currentYearProfit;
        const ps = annualRevenue > 0 ? this.marketCap / annualRevenue : 0;
        const pe = annualProfit > 0 ? this.marketCap / annualProfit : 0;
        this.financialHistory.push({
          year: yearStamp,
          revenue: annualRevenue,
          profit: annualProfit,
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

    accumulateQuarter(revenueIncrement = 0, profitIncrement = 0, gameDate = null) {
      const meta = this.getQuarterMeta(gameDate);
      const sameQuarter = this.currentQuarterMeta &&
        this.currentQuarterMeta.year === meta.year &&
        this.currentQuarterMeta.quarter === meta.quarter;
      if (!sameQuarter) {
        this.finalizeQuarter(meta);
      }
      this.currentQuarterRevenue += revenueIncrement;
      this.currentQuarterProfit += profitIncrement;
    }

    finalizeQuarter(nextMeta = null) {
      if (this.currentQuarterMeta) {
        const hasRevenue = Math.abs(this.currentQuarterRevenue) > 1e-6;
        const hasProfit = Math.abs(this.currentQuarterProfit) > 1e-6;
        if (hasRevenue || hasProfit) {
          this.quarterHistory.push({
            year: this.currentQuarterMeta.year,
            quarter: this.currentQuarterMeta.quarter,
            revenue: this.currentQuarterRevenue,
            profit: this.currentQuarterProfit
          });
          this.newQuarterlyData = true;
          if (this.quarterHistory.length > MAX_QUARTER_HISTORY) {
            this.quarterHistory.shift();
          }
        }
      }
      this.currentQuarterMeta = nextMeta
        ? { year: nextMeta.year, quarter: nextMeta.quarter }
        : null;
      this.currentQuarterRevenue = 0;
      this.currentQuarterProfit = 0;
    }

    getQuarterMeta(dateLike) {
      let dateObj = null;
      if (dateLike instanceof Date) {
        dateObj = dateLike;
      } else if (typeof dateLike === 'number' || typeof dateLike === 'string') {
        const maybeDate = new Date(dateLike);
        if (!isNaN(maybeDate.getTime())) {
          dateObj = maybeDate;
        }
      }
      if (!dateObj) {
        if (this.currentQuarterMeta) {
          return { ...this.currentQuarterMeta };
        }
        dateObj = this.ipoDate ? new Date(this.ipoDate) : new Date();
      }
      return {
        year: dateObj.getFullYear(),
        quarter: Math.floor(dateObj.getMonth() / 3) + 1
      };
    }

    sumQuarterTotalsForYear(year) {
      if (typeof year !== 'number') {
        return { revenue: 0, profit: 0, quarters: 0 };
      }
      return this.quarterHistory.reduce((acc, entry) => {
        if (entry.year === year) {
          acc.revenue += entry.revenue;
          acc.profit += entry.profit;
          acc.quarters += 1;
        }
        return acc;
      }, { revenue: 0, profit: 0, quarters: 0 });
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

    getYoySeries(limit = 8) {
      if (!Array.isArray(this.quarterHistory) || this.quarterHistory.length === 0) return [];
      const ordered = this.quarterHistory.slice().sort((a, b) => {
        if (a.year === b.year) return a.quarter - b.quarter;
        return a.year - b.year;
      });

      const series = [];
      // Calculate TTM (or partial TTM) for every available quarter
      for (let i = 0; i < ordered.length; i++) {
        let revenue = 0;
        let profit = 0;
        // Sum up to 4 quarters ending at i (partial sum if < 4 available)
        const start = Math.max(0, i - 3);
        let count = 0;
        for (let j = start; j <= i; j++) {
          revenue += ordered[j].revenue;
          profit += ordered[j].profit;
          count++;
        }

        // Extrapolate if less than 4 quarters (Annualized Run Rate)
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

    getFinancialTableHTML() {
      const data = this.getFinancialTable();
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
      const includeDividend = this.showDividendColumn;
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
  }

  class PhaseCompany extends BaseCompany {
    constructor(cfg, macroEnv, gameStartYear = 1990, ipoDate = new Date(gameStartYear, 0, 1), initialPhase = 'public') {
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

  class Company extends PhaseCompany {
    constructor(cfg, macroEnv, gameStartYear = 1990, ipoDate = new Date(gameStartYear, 0, 1)) {
      super(cfg, macroEnv, gameStartYear, ipoDate, 'public');
      this.showDividendColumn = true;

      const rp = cfg.base_business.revenue_process;
      this.baseRevenue = between(rp.initial_revenue_usd.min, rp.initial_revenue_usd.max);

      const mc = cfg.base_business.margin_curve;
      const mu = cfg.base_business.multiple_curve;
      this.marginCurve = cfg.base_business.margin_curve
        ? new MarginCurve(mc.start_profit_margin, mc.terminal_profit_margin, mc.years_to_mature)
        : null;
      this.multCurve = new MultipleCurve(mu.initial_ps_ratio, mu.terminal_pe_ratio, mu.years_to_converge);

      const fin = cfg.finance || {};
      this.cash = fin.starting_cash_usd ?? 0;
      this.debt = fin.starting_debt_usd ?? 0;
      this.intRate = fin.interest_rate_annual ?? 0.05;
      this.payoutRatio = null;
      this.targetYield = null;
      this.pendingDividendRemaining = 0;
      this.dividendInstallmentsLeft = 0;
      this.dividendAccumulatorDays = 0;
      this.dividendEvents = [];

      const cost = cfg.costs || {};
      this.opexFixed = cost.opex_fixed_usd ?? 5_000_000;
      this.opexVar = cost.opex_variable_ratio ?? 0.15;
      this.rdBaseRatio = cost.rd_base_ratio ?? 0.05;

      this.revMult = 1;
      this.volMult = 1;
      this.flatRev = 0;

      const biasCfg = (cfg.sentiment && cfg.sentiment.structural_bias) || {};
      const minB = biasCfg.min ?? 0.25;
      const maxB = biasCfg.max ?? 4;
      this.structBias = between(minB, maxB);
      const hl = biasCfg.half_life_years ?? 15;
      this.biasLambda = Math.log(2) / hl;

      this.cyclical = between(0.8, 1.2);
      this.cyc_k = 0.3;
      this.cyc_sig = 0.20;

      this.micro = 1;
      this.micro_k = 0.4;
      const sm = sectorMicro[this.sector] || sectorMicro.DEFAULT;
      this.micro_mu = sm.mu;
      this.micro_sig = sm.sigma;
      this.rng = cfg.rng || random;

      this.multFreeze = null;
      this.rdOpex = 0;

      this.products = (cfg.pipeline || []).map(p => new Product(p));
      this.events = (cfg.events || []).map(e => new ScheduledEvent(e));
      this.effects = [];
      this.hasPipelineUpdate = false;
      const productPlanCfg = cfg.product_plan || cfg.productPlan || null;
      this.productManager = productPlanCfg ? new ProductManager(this, productPlanCfg) : null;

      let simDate = new Date(ipoDate);
      const dt = 14;
      while (simDate.getFullYear() < gameStartYear) {
        this.step(dt, simDate);
        simDate.setDate(simDate.getDate() + dt);
      }
    }

    step(dtDays, gameDate) {
      if (this.bankrupt) return;

      this.ageDays += dtDays;
      const dtYears = dtDays / 365;
      const ageYears = this.ageDays / 365;

      if (this.productManager) {
        this.productManager.tick();
      }

      for (const ev of this.events) {
        for (const eff of ev.maybe(dtDays, this.name)) {
          eff.apply(this);
          this.effects.push(eff);
        }
      }
      this.effects = this.effects.filter(e => {
        if (e.left <= 0) { e.revert(this); return false; }
        e.left -= dtDays;
        return true;
      });

      let successThisTick = false;
      for (const p of this.products) {
        const vBefore = p.unlockedValue();
        p.advance(dtDays, random, this);
        if (p.unlockedValue() > vBefore) successThisTick = true;
      }
      if (successThisTick && this.multFreeze === null) {
        const mNowTmp = this.marginCurve.value(ageYears);
        this.multFreeze = this.multCurve.value(ageYears, mNowTmp);
      }

      const epsMicro = Random.gaussian(this.rng || random);
      const vol = this.micro_sig * this.volMult;
      this.micro += (this.micro_mu + this.micro_k * (1 - this.micro)) * dtYears
        + vol * Math.sqrt(dtYears) * epsMicro;
      this.micro = Math.max(0.1, Math.min(5, this.micro));

      const sectorFactor = this.macroEnv.getValue(this.sector);
      const revenueMultiplier = this.macroEnv.getRevenueMultiplier
        ? this.macroEnv.getRevenueMultiplier(this.sector)
        : 1;
      const pipelineBoost = this.products.reduce((s, p) => s + p.realisedRevenuePerYear(), 0);
      const coreAnnual = ((this.baseRevenue + pipelineBoost) * sectorFactor * this.micro * this.revMult) - this.flatRev;
      const effectiveAnnual = coreAnnual * revenueMultiplier;
      const revenueThisTick = effectiveAnnual * dtYears;

      let marginNow;
      if (this.marginCurve) {
        marginNow = this.marginCurve.value(ageYears);
      } else {
        const base = sectorMargin[this.sector] ?? sectorMargin.DEFAULT;
        const sizeKick = 0.02 * Math.log10(Math.max(1, effectiveAnnual / 1e9));
        const cycle = this.macroEnv.getValue(this.sector);
        const downPenalty = Math.max(0, 1 - cycle);
        marginNow = Math.max(0.01, base + sizeKick - 0.15 * downPenalty);
      }
      const grossProfit = revenueThisTick * marginNow;

      this.rdOpex = 0;
      const opex = this.opexFixed * dtYears + this.opexVar * grossProfit;
      const rdPipeline = this.products.reduce((s, p) => s + p.expectedValue(), 0);
      const rdBurn = this.rdOpex + this.rdBaseRatio * rdPipeline * dtYears;

      const interest = this.debt * this.intRate * dtYears;
      const netIncome = grossProfit - opex - rdBurn - interest;

      this.cash += netIncome;
      if (this.cash < 0) { this.debt += -this.cash; this.cash = 0; }

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

      const unlockedPV = this.products.reduce((s, p) => s + p.unlockedValue(), 0);
      const pipelineOption = this.products.reduce((s, p) => s + p.expectedValue(), 0);
      const forwardE = effectiveAnnual * marginNow;
      const fairPE = this.multCurve.value(ageYears, marginNow);
      const fairValue = forwardE * fairPE + unlockedPV + pipelineOption;
      const valuationMultiplier = this.macroEnv.getValuationMultiplier
        ? this.macroEnv.getValuationMultiplier(this.sector)
        : 1;
      const adjustedFairValue = fairValue * valuationMultiplier;

      this.structBias = 1 + (this.structBias - 1) * Math.exp(-this.biasLambda * dtYears);
      const epsCyc = Random.gaussian(this.rng || random);
      this.cyclical += this.cyc_k * (1 - this.cyclical) * dtYears
        + this.cyc_sig * Math.sqrt(dtYears) * epsCyc;
      this.cyclical = Math.max(0.2, Math.min(5, this.cyclical));

      const sentiment = this.structBias * this.cyclical;
      const enterprise = adjustedFairValue * sentiment;

      const leverage = this.debt / Math.max(1, enterprise);
      const survivalProb = 1 / (1 + Math.exp(4 * (leverage - 0.6)));
      const distressedEnterprise = enterprise * survivalProb;

      const candidateCap = distressedEnterprise - this.debt + this.cash;
      if (candidateCap <= 0) {
        this.markBankrupt(gameDate);
        return;
      }

      this.marketCap = candidateCap;
      this.displayCap = this.marketCap;

      this.accumulateYear(revenueThisTick, netIncome, gameDate);

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
      const ts = gameDate ? gameDate.getTime() : 0;
      this.dividendEvents.push({ amount, timestamp: ts });
    }

    drainDividendEvents() {
      if (!this.dividendEvents || this.dividendEvents.length === 0) return [];
      const events = this.dividendEvents.slice();
      this.dividendEvents.length = 0;
      return events;
    }

    toSnapshot(options = {}) {
      const historyLimit = options.historyLimit ?? 10;
      const quarterLimit = options.quarterLimit ?? 8;
      const tail = (arr, n) => Array.isArray(arr) ? arr.slice(Math.max(0, arr.length - n)) : [];
      const productSnapshot = Array.isArray(this.products)
        ? this.products.map(p => ({
          id: p.id,
          label: p.label,
          fullVal: p.fullVal,
          stages: Array.isArray(p.stages) ? p.stages.map(s => ({
            id: s.id,
            completed: !!s.completed,
            succeeded: !!s.succeeded,
            elapsed: s.elapsed || 0,
            tries: s.tries || 0
          })) : []
        }))
        : [];
      return {
        id: this.id,
        name: this.name,
        sector: this.sector,
        founders: Array.isArray(this.founders) ? this.founders.map(f => ({ ...f })) : [],
        mission: this.mission || '',
        founding_location: this.foundingLocation || '',
        ageDays: this.ageDays,
        startYear: this.startYear,
        ipoDate: this.ipoDate ? this.ipoDate.toISOString() : null,
        marketCap: this.marketCap,
        cash: this.cash,
        debt: this.debt,
        revenueYearToDate: this.currentYearRevenue,
        profitYearToDate: this.currentYearProfit,
        quarterHistory: tail(this.quarterHistory, quarterLimit),
        financialHistory: tail(this.financialHistory, historyLimit),
        history: tail(this.history, historyLimit),
        products: productSnapshot,
        fromVenture: this.fromVenture || false,
        phase: this.phase || 'public'
      };
    }
  }

  class HypergrowthCompany extends BaseCompany {
    constructor(cfg, macroEnv, gameStartYear = 1990, ipoDate = new Date(gameStartYear, 0, 1)) {
      super(cfg, macroEnv, gameStartYear, ipoDate);
      if (!cfg.static || !cfg.static.name) this.name = 'Hypergrowth Co';
      if (!cfg.static || !cfg.static.sector) this.sector = 'Web';

      const rp = (cfg.base_business && cfg.base_business.revenue_process) || { initial_revenue_usd: { min: 2_000_000, max: 40_000_000 } };
      this.arr = between(rp.initial_revenue_usd.min, rp.initial_revenue_usd.max);
      this.initialArr = this.arr;
      this.growthTarget = between(0.8, 2.5);
      this.growthFloor = between(0.08, 0.35);
      this.growthDecay = between(0.75, 0.92);
      this.marginStart = between(-2.0, -0.3);
      this.marginTarget = between(0.08, 0.28);
      this.marginYears = between(5, 10);

      const fin = cfg.finance || {};
      this.cash = fin.starting_cash_usd ?? between(80_000_000, 140_000_000);
      this.debt = fin.starting_debt_usd ?? 0;
      this.intRate = fin.interest_rate_annual ?? 0.06;

      const cost = cfg.costs || {};
      this.opexFixed = cost.opex_fixed_usd ?? 25_000_000;
      this.opexVar = cost.opex_variable_ratio ?? 0.12;

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
      if (random() < 0.05 * dtYears) {
        this.growthTarget *= between(0.45, 0.75);
      } else if (random() < 0.02 * dtYears) {
        this.growthTarget *= between(1.15, 1.35);
      }
      if (!this.inflection.triggered && random() < 0.10 * dtYears) {
        this.inflection = {
          triggered: true,
          elapsed: 0,
          durationDays: between(720, 1080),
          startGrowth: this.growthTarget,
          endGrowth: between(-0.25, -0.4),
          tailDecay: between(0.005, 0.01)
        };
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

      this.structBias += Random.gaussian(this.rng || random) * 0.005;
      this.structBias = Math.max(0.6, Math.min(1.6, this.structBias));
      this.sentiment += Random.gaussian(this.rng || random) * 0.025;
      this.sentiment = Math.max(0.5, Math.min(1.8, this.sentiment));

      const noise = Random.gaussian(this.rng || random) * 0.08;
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
        this.slowExpense = targetExpense;
      } else {
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

      this.accumulateYear(revenueThisTick, netIncome, gameDate);
      this.maybeRecordAnnual(0);
      this.recordHistoryPoint(gameDate);
    }
  }

  global.CompanyModule = {
    BaseCompany,
    PhaseCompany,
    Company,
    HypergrowthCompany
  };
})(typeof globalThis !== 'undefined'
  ? globalThis
  : (typeof window !== 'undefined' ? window : this));
