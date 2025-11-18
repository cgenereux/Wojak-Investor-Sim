(function (global) {
  const shared = global.SimShared || {};
  if (!shared.Random || !shared.MacroEnvironment) {
    throw new Error('SimShared must load before publicCompanies.js');
  }

  const {
    Random,
    between,
    MarginCurve,
    MultipleCurve,
    sectorMicro,
    sectorMargin,
    Product,
    ScheduledEvent
  } = shared;

  const QUARTER_DAYS = 365 / 4;

  class BaseCompany {
    constructor (cfg, macroEnv, gameStartYear = 1990, ipoDate = new Date(gameStartYear, 0, 1)) {
      this.id = cfg.id;
      this.name = (cfg.static && cfg.static.name) || 'Company';
      this.sector = (cfg.static && cfg.static.sector) || 'General';
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

    accumulateYear (revenueIncrement, profitIncrement) {
      this.currentYearRevenue += revenueIncrement;
      this.currentYearProfit += profitIncrement;
    }

    maybeRecordAnnual (dividend = 0) {
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

    recordHistoryPoint (gameDate, value = this.marketCap) {
      const stamp = gameDate.getTime();
      const last = this.history[this.history.length - 1];
      if (!last || last.x !== stamp) {
        this.history.push({ x: stamp, y: value });
      } else {
        last.y = value;
      }
    }

    markBankrupt (gameDate) {
      this.marketCap = 0;
      this.displayCap = 0;
      this.bankrupt = true;
      this.recordHistoryPoint(gameDate, 0);
    }

    getFinancialTable () {
      if (this.financialHistory.length === 0) return null;
      return this.financialHistory.slice().reverse();
    }

    getFinancialTableHTML () {
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
    constructor (cfg, macroEnv, gameStartYear = 1990, ipoDate = new Date(gameStartYear, 0, 1), initialPhase = 'public') {
      super(cfg, macroEnv, gameStartYear, ipoDate);
      this.phase = initialPhase;
      this.phaseMetadata = {};
    }

    setPhase (nextPhase, extras = {}) {
      this.phase = nextPhase || this.phase;
      if (extras && typeof extras === 'object') {
        this.phaseMetadata = Object.assign({}, this.phaseMetadata, extras);
      }
    }

    getPhase () {
      return this.phase;
    }

    get isPrivatePhase () {
      return this.phase === 'private';
    }

    get isPublicPhase () {
      return this.phase === 'public';
    }
  }

  class Company extends PhaseCompany {
    constructor (cfg, macroEnv, gameStartYear = 1990, ipoDate = new Date(gameStartYear, 0, 1)) {
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

      this.multFreeze = null;
      this.rdOpex = 0;

      this.products = (cfg.pipeline || []).map(p => new Product(p));
      this.events = (cfg.events || []).map(e => new ScheduledEvent(e));
      this.effects = [];
      this.hasPipelineUpdate = false;

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
        p.advance(dtDays, Math.random, this);
        if (p.unlockedValue() > vBefore) successThisTick = true;
      }
      if (successThisTick && this.multFreeze === null) {
        const mNowTmp = this.marginCurve.value(ageYears);
        this.multFreeze = this.multCurve.value(ageYears, mNowTmp);
      }

      const epsMicro = Random.gaussian();
      const vol = this.micro_sig * this.volMult;
      this.micro += (this.micro_mu + this.micro_k * (1 - this.micro)) * dtYears
        + vol * Math.sqrt(dtYears) * epsMicro;
      this.micro = Math.max(0.1, Math.min(5, this.micro));

      const sectorFactor = this.macroEnv.getValue(this.sector);
      const coreAnnual = this.baseRevenue * sectorFactor * this.micro * this.revMult - this.flatRev;
      const pipelineAnnual = this.products.reduce((s, p) => s + p.realisedRevenuePerYear(), 0);
      const revenueThisTick = (coreAnnual + pipelineAnnual) * dtYears;

      let marginNow;
      if (this.marginCurve) {
        marginNow = this.marginCurve.value(ageYears);
      } else {
        const base = sectorMargin[this.sector] ?? sectorMargin.DEFAULT;
        const sizeKick = 0.02 * Math.log10(Math.max(1, (coreAnnual + pipelineAnnual) / 1e9));
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
      const forwardE = (coreAnnual + pipelineAnnual) * marginNow;
      const fairPE = this.multCurve.value(ageYears, marginNow);
      const fairValue = forwardE * fairPE + unlockedPV + pipelineOption;

      this.structBias = 1 + (this.structBias - 1) * Math.exp(-this.biasLambda * dtYears);
      const epsCyc = Random.gaussian();
      this.cyclical += this.cyc_k * (1 - this.cyclical) * dtYears
        + this.cyc_sig * Math.sqrt(dtYears) * epsCyc;
      this.cyclical = Math.max(0.2, Math.min(5, this.cyclical));

      const sentiment = this.structBias * this.cyclical;
      const enterprise = fairValue * sentiment;

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

      this.accumulateYear(revenueThisTick, netIncome);

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

    processPendingDividends (gameDate) {
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

    recordDividendEvent (amount, gameDate) {
      if (amount <= 0) return;
      if (!this.dividendEvents) this.dividendEvents = [];
      this.dividendEvents.push({ amount, timestamp: gameDate ? gameDate.getTime() : Date.now() });
    }

    drainDividendEvents () {
      if (!this.dividendEvents || this.dividendEvents.length === 0) return [];
      const events = this.dividendEvents.slice();
      this.dividendEvents.length = 0;
      return events;
    }
  }

  class HypergrowthCompany extends BaseCompany {
    constructor (cfg, macroEnv, gameStartYear = 1990, ipoDate = new Date(gameStartYear, 0, 1)) {
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

    step (dtDays, gameDate) {
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

      this.accumulateYear(revenueThisTick, netIncome);
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
