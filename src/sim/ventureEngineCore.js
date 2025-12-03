(function (global) {
  const shared = global.SimShared || {};
  const companyModule = global.CompanyModule || {};
  const strategyModule = global.VentureStrategyModule || {};
  if (!shared.between || !companyModule.Company) {
    throw new Error('SimShared and CompanyModule must load before ventureEngineCore.js');
  }
  const {
    between,
    clampValue,
    random,
    withRandomSource,
    SeededRandom
  } = shared;
  const FAST_LISTING = false // !!process.env.FAST_LISTING; // 1;
  const { Company } = companyModule;
  const {
    computeHypergrowthFairValue,
    computeHardTechFairValue,
    advanceHypergrowthPreGate,
    advanceHardTechPreGate,
    createVentureStrategy
  } = strategyModule;
  if (!computeHypergrowthFairValue || !createVentureStrategy) {
    throw new Error('VentureStrategyModule must load before ventureEngineCore.js');
  }

  const VC_DAY_MS = 24 * 60 * 60 * 1000;
  const DAYS_PER_YEAR = 365;
  const QUARTER_DAYS = DAYS_PER_YEAR / 4;
  const YEAR_MS = VC_DAY_MS * DAYS_PER_YEAR;
  const VENTURE_FAIL_TTL_MS = 120000;

  function coerceDate(value, isEnd = false) {
    if (value == null) return null;
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && String(value).trim() !== '') {
      const year = Math.trunc(asNumber);
      return isEnd
        ? new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))
        : new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function normalizeListingWindow(windowLike) {
    if (!windowLike || typeof windowLike !== 'object') return null;
    const from = coerceDate(windowLike.from ?? windowLike.start ?? windowLike.start_year, false);
    const to = coerceDate(windowLike.to ?? windowLike.end ?? windowLike.end_year, true);
    if (!from && !to) return null;
    return { from, to };
  }

  const VC_STAGE_CONFIG = [
    { id: 'seed', label: 'Seed', successProb: 0.92, preMoneyMultiplier: [1.6, 2.3], raiseFraction: [0.20, 0.35], monthsToNextRound: [10, 16] },
    { id: 'series_a', label: 'Series A', successProb: 0.88, preMoneyMultiplier: [1.5, 2.2], raiseFraction: [0.20, 0.32], monthsToNextRound: [10, 16] },
    { id: 'series_b', label: 'Series B', successProb: 0.84, preMoneyMultiplier: [1.4, 2.0], raiseFraction: [0.18, 0.28], monthsToNextRound: [12, 18] },
    { id: 'series_c', label: 'Series C', successProb: 0.80, preMoneyMultiplier: [1.3, 1.9], raiseFraction: [0.16, 0.24], monthsToNextRound: [14, 20] },
    { id: 'series_d', label: 'Series D', successProb: 0.78, preMoneyMultiplier: [1.25, 1.8], raiseFraction: [0.14, 0.22], monthsToNextRound: [14, 20] },
    { id: 'series_e', label: 'Series E', successProb: 0.76, preMoneyMultiplier: [1.2, 1.7], raiseFraction: [0.12, 0.2], monthsToNextRound: [14, 20] },
    { id: 'series_f', label: 'Series F', successProb: 0.74, preMoneyMultiplier: [1.15, 1.6], raiseFraction: [0.1, 0.18], monthsToNextRound: [14, 20] },
    { id: 'pre_ipo', label: 'Pre-IPO', successProb: 0.95, preMoneyMultiplier: [1.1, 1.4], raiseFraction: [0.08, 0.15], monthsToNextRound: [12, 18] },
    { id: 'ipo', label: 'IPO', successProb: 1 }
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
    seed: { ps: 9.5, margin: -1.6 },
    series_a: { ps: 8.5, margin: -1.1 },
    series_b: { ps: 7.5, margin: -0.8 },
    series_c: { ps: 6.5, margin: -0.35 },
    series_d: { ps: 5.8, margin: -0.12 },
    series_e: { ps: 5.1, margin: 0.05 },
    series_f: { ps: 4.6, margin: 0.12 },
    pre_ipo: { ps: 4.2, margin: 0.19 },
    ipo: { ps: 4.1, margin: 0.2 }
  };

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

  const DummyMacroEnv = {
    getValue: () => 1,
    getMu: () => 0.06,
    ensureSector: () => { }
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
      interest_rate_annual: 0.07
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
        founders: Array.isArray(cfg.founders) ? cfg.founders.map(f => ({ ...f })) : [],
        mission: cfg.mission || '',
        founding_location: cfg.founding_location || cfg.foundingLocation || '',
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

  class VentureCompany extends Company {
    constructor(config, startDate, rngFn = random) {
      const start = startDate ? new Date(startDate) : new Date('1990-01-01T00:00:00Z');
      const publicCfg = buildPublicConfigFromVenture(config, start.getUTCFullYear());
      super(publicCfg, DummyMacroEnv, start.getUTCFullYear(), start);
      this.rng = rngFn || random;
      this.setPhase('private');
      this.showDividendColumn = false;
      this.fromVenture = true;

      this.description = config.description || '';
      this.founders = Array.isArray(config.founders) ? config.founders.map(f => ({ ...f })) : [];
      this.mission = config.mission || '';
      this.foundingLocation = config.founding_location || config.foundingLocation || '';
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
      this.listingWindow = normalizeListingWindow(
        config.private_listing_window || config.listing_window || config.listingWindow || null
      );
      // Use the defined private listing window for target date
      if (this.listingWindow && this.listingWindow.from && this.listingWindow.to) {
        this.targetListingDate = new Date(this.listingWindow.to);
      } else {
        this.targetListingDate = null;
      }
      this.status = 'raising';
      this.daysSinceRound = 0;
      this.playerEquity = 0;
      this.playerEquityMap = {};
      this.playerInvested = 0;
      this.pendingCommitment = 0;
      this.pendingCommitments = config.pendingCommitments || {}; // Map<playerId, amount>
      this.cash = Number(config.starting_cash_usd ?? 0);
      this.debt = Number(config.starting_debt_usd ?? 0);
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
      this.lastCommitPlayerId = null;
      this.revenue = 0;
      this.profit = 0;
      this.history = [];
      this.financialHistory = [];
      this.ageDays = 0;
      this.currentYearRevenue = 0;
      this.currentYearProfit = 0;
      this.startDate = new Date(start);
      this.currentDate = new Date(start);
      this.lastYearRecorded = this.startDate.getUTCFullYear();

      // Use the defined private listing window for start date
      if (this.listingWindow && this.listingWindow.from) {
        this.startDate = new Date(this.listingWindow.from);
        // Ensure currentDate respects the new start date
        if (this.currentDate < this.startDate) {
          this.currentDate = new Date(this.startDate);
        }
      }


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
      this.pmfLossProbPerYear = Number(config.pmf_loss_prob_per_year ?? config.pmfLossProbPerYear ?? 0);
      this.pmfDeclineRateRange = config.pmf_decline_rate_range || config.pmf_decline_rate || config.pmfDeclineRateRange || [-0.4, -0.25];
      this.pmfDeclineDurationYears = config.pmf_decline_duration_years || config.pmf_decline_duration || config.pmfDeclineDurationYears || [2, 3];
      this.hyperPmfState = { active: false, elapsed: 0, durationYears: 0, declineRate: 0 };

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
      this.lastRoundMargin = this.revenue > 0 ? this.profit / Math.max(this.revenue, 1) : -0.5;
    }

    syncFromSnapshot(snapshot) {
      super.syncFromSnapshot(snapshot); // Sync base properties (revenue, profit, history, etc.)

      if (!snapshot) return;

      // Sync Venture Specifics
      if (typeof snapshot.valuation === 'number') this.currentValuation = snapshot.valuation;
      if (snapshot.stageLabel) {
        // Try to find stage index from label
        const idx = this.roundDefinitions.findIndex(r => r.label === snapshot.stageLabel || r.id === snapshot.stageLabel);
        if (idx >= 0) this.stageIndex = idx;
      }
      if (snapshot.status) this.status = snapshot.status;
      if (typeof snapshot.playerEquity === 'number') this.playerEquity = snapshot.playerEquity;
      if (typeof snapshot.playerEquityPercent === 'number') this.playerEquityPercent = snapshot.playerEquityPercent; // Helper prop often sent
      if (typeof snapshot.pendingCommitment === 'number') this.pendingCommitment = snapshot.pendingCommitment;
      if (typeof snapshot.playerInvested === 'number') this.playerInvested = snapshot.playerInvested;
      if (snapshot.lastEventNote) this.lastEventNote = snapshot.lastEventNote;
      if (typeof snapshot.runwayDays === 'number') this.cachedRunwayDays = snapshot.runwayDays;
      if (typeof snapshot.daysSinceRound === 'number') this.daysSinceRound = snapshot.daysSinceRound;

      // Sync Round Info
      if (snapshot.currentRound) {
        this.currentRound = { ...snapshot.currentRound };
      } else {
        this.currentRound = null;
      }

      // Sync Player Equity Map if provided
      if (snapshot.playerEquityById) {
        this.playerEquityMap = { ...snapshot.playerEquityById };
      }
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

    recordHistory(gameDate) {
      if (!gameDate) return;
      const stamp = gameDate.getTime();
      const last = this.history[this.history.length - 1];
      if (!last || last.x !== stamp) {
        this.history.push({ x: stamp, y: this.currentValuation, stage: this.currentStage ? this.currentStage.label : 'N/A' });
      } else {
        last.y = this.currentValuation;
      }
    }

    accumulateFinancials(dtDays, currentDate) {
      const dtYears = dtDays / 365;
      const rev = this.revenue * dtYears;
      const prof = this.profit * dtYears;
      this.currentYearRevenue += rev;
      this.currentYearProfit += prof;
      this.accumulateQuarter(rev, prof, currentDate);
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
          debt: Math.max(this.debt, 0),
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
          if (product && typeof product.advance === 'function') {
            product.advance(dtDays, random, this);
          }
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
      const failDate = currentDate ? new Date(currentDate) : (this.lastTick ? new Date(this.lastTick) : new Date());
      this.failedAt = failDate;
      this.failedAtWall = Date.now();
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
      const profit = Number.isFinite(this.profit) ? this.profit : 0;
      const netIncome = profit * dtYears;
      const currentCash = Number.isFinite(this.cash) ? this.cash : 0;
      this.cash = currentCash + netIncome;
      if (!Number.isFinite(this.cash)) this.cash = 0;
      const burnPerDay = Math.max(0, -profit) / DAYS_PER_YEAR;
      this.cashBurnPerDay = burnPerDay;
      this.cachedRunwayDays = burnPerDay > 0 ? this.cash / burnPerDay : Infinity;
      if (this.cash < 0) {
        const overdraft = -this.cash;
        if (!Number.isFinite(this.debt)) this.debt = 0;
        this.debt += overdraft;
        this.cash = 0;
      } else if (this.debt > 0 && this.cash > 0) {
        const repayment = Math.min(this.debt, this.cash);
        this.debt -= repayment;
        this.cash -= repayment;
      }
      this.daysSinceLastRaise += dtDays;
    }

    shouldStartNextRound() {
      if (!this.strategy) return false;
      // If no current round and status isn't failed/exited/ipo, allow strategy to decide.
      if (this.status === 'failed' || this.status === 'exited' || this.status === 'ipo' || this.status === 'ipo_pending') {
        return false;
      }
      if (!this.isActiveOnDate()) return false;
      return this.strategy.shouldStartNextRound(this);
    }

    calculateRoundHealth() {
      if (!this.strategy) return 1;
      return this.strategy.calculateRoundHealth(this.currentStage);
    }

    syncPostGateMultiple(currentDate) {
      const nowMs = currentDate
        ? currentDate.getTime()
        : (this.postGateStartDate ? this.postGateStartDate.getTime() : 0);
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
      if (!Number.isFinite(durationDays) || durationDays <= 0) durationDays = 180;
      if (!Number.isFinite(runwayMonths) || runwayMonths <= 0) runwayMonths = Math.ceil(durationDays / 30);
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
        runwayMonths,
        playerCommitted: false,
        playerCommitments: {}, // Map<playerId, amount>
        openedOn: new Date(currentDate || this.startDate || new Date('1990-01-01T00:00:00Z')),
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

    isListableOnDate(date = null) {
      // Listing windows are used to pick a target listing year; they no longer block interactions.
      return true;
    }

    isActiveOnDate(date = null) {
      const ref = date
        ? new Date(date)
        : (this.currentDate ? new Date(this.currentDate) : null);
      if (!ref || Number.isNaN(ref.getTime())) return true;

      // Must be after start date
      if (this.startDate && ref < this.startDate) return false;
      // Keep active even after target listing date so rounds can resolve/IPO
      return true;
    }

    getPlayerValuation(playerId = null) {
      if (this.status === 'failed' || this.status === 'exited') return 0;
      if (playerId && this.playerEquityMap && Number.isFinite(this.playerEquityMap[playerId])) {
        const pct = this.playerEquityMap[playerId] || 0;
        return pct > 0 && this.currentValuation ? pct * this.currentValuation : 0;
      }
      const equityFromMap = this.playerEquityMap
        ? Object.values(this.playerEquityMap).filter(Number.isFinite).reduce((sum, val) => sum + val, 0)
        : 0;
      const equityFraction = equityFromMap > 0 ? equityFromMap : (this.playerEquity || 0);
      const equityValue = equityFraction > 0 && this.currentValuation ? equityFraction * this.currentValuation : 0;
      return equityValue > 0 ? equityValue : 0;
    }

    hasPlayerPosition() {
      if (this.playerEquity > 0 || this.pendingCommitment > 0) return true;
      if (!this.playerEquityMap) return false;
      return Object.values(this.playerEquityMap).some(v => Number.isFinite(v) && v > 0);
    }

    leadRound(playerId = null) {
      if (!this.isListableOnDate()) {
        return { success: false, reason: 'Not currently listed.' };
      }
      if (!this.currentRound || this.status !== 'raising') {
        return { success: false, reason: 'Not currently raising.' };
      }
      if (this.currentRound.playerCommitted) {
        return { success: false, reason: 'You already led this round.' };
      }
      this.currentRound.playerCommitted = true;
      this.currentRound.playerCommitAmount = this.currentRound.raiseAmount;
      this.currentRound.playerCommitEquity = this.currentRound.equityOffered;
      this.currentRound.commitPlayerId = playerId || null;
      this.lastCommitPlayerId = playerId || this.lastCommitPlayerId || null;
      this.pendingCommitment = (this.pendingCommitment || 0) + this.currentRound.raiseAmount;
      return {
        success: true,
        raiseAmount: this.currentRound.raiseAmount,
        equityOffered: this.currentRound.equityOffered,
        stageLabel: this.currentRound.stageLabel
      };
    }

    commitInvestment(equityFraction = 0, playerId = null) {
      if (!this.isListableOnDate()) {
        return { success: false, reason: 'Not currently listed.' };
      }
      if (!this.currentRound || this.status !== 'raising') {
        return { success: false, reason: 'Not currently raising.' };
      }
      const round = this.currentRound;
      const maxEquity = Math.max(0, Number(round.equityOffered) || 0);
      const preMoney = Number(round.preMoney) || 0;
      const raiseAmount = Number(round.raiseAmount) || 0;
      const postMoney = Number(round.postMoney) || (preMoney + raiseAmount);
      if (!Number.isFinite(postMoney) || postMoney <= 0 || maxEquity <= 0) {
        return { success: false, reason: 'Invalid round terms.' };
      }
      const desiredEquity = Math.max(0, equityFraction || 0);
      const existingEquity = Math.max(0, Number(round.playerCommitEquity) || 0);
      const remainingEquity = Math.max(0, maxEquity - existingEquity);
      const equityUsed = Math.min(remainingEquity, desiredEquity);
      if (equityUsed <= 0) {
        return { success: false, reason: 'Allocation full.' };
      }
      const amount = equityUsed * postMoney;
      round.playerCommitted = true;
      round.playerCommitEquity = existingEquity + equityUsed;
      round.playerCommitAmount = (round.playerCommitAmount || 0) + amount;

      // Track per-player commitment
      if (playerId) {
        round.playerCommitments = round.playerCommitments || {};
        round.playerCommitments[playerId] = (round.playerCommitments[playerId] || 0) + amount;

        this.pendingCommitments = this.pendingCommitments || {};
        this.pendingCommitments[playerId] = (this.pendingCommitments[playerId] || 0) + amount;
      }

      round.commitPlayerId = playerId || round.commitPlayerId || null;
      this.lastCommitPlayerId = playerId || this.lastCommitPlayerId || null;
      this.pendingCommitment = (this.pendingCommitment || 0) + amount;
      return {
        success: true,
        amount,
        equityFraction: equityUsed,
        stageLabel: round.stageLabel
      };
    }

    advance(dtDays, currentDate) {
      if (!this.isPrivatePhase) return [];
      if (this.status === 'failed' || this.status === 'exited') return [];
      this.stageChanged = false;
      if (currentDate) {
        const nextDate = new Date(currentDate);
        if (!Number.isNaN(nextDate.getTime())) {
          this.currentDate = nextDate;
        }
      }
      const pipelineBoost = Array.isArray(this.products)
        ? this.products.reduce((s, p) => s + (typeof p.realisedRevenuePerYear === 'function' ? p.realisedRevenuePerYear() : 0), 0)
        : 0;
      this.maybeTriggerProductHypergrowth(pipelineBoost);
      this.progressCompanyClock(dtDays, currentDate);
      this.applyProductHypergrowth(dtDays / DAYS_PER_YEAR, pipelineBoost);
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
        success = random() < successChance;
      }
      const stageWasGate = stage && stage.id === this.gateStageId;

      const preMoney = closingRound.fairValue ?? this.computeFairValue(false);
      const raiseAmount = closingRound.raiseAmount;
      const committedAmount = Number(closingRound.playerCommitAmount) || 0;
      const committedEquity = Number(closingRound.playerCommitEquity) || 0;
      const raiseAmountUsed = raiseAmount; // Assume the round is fully funded alongside the player
      const postMoney = preMoney + raiseAmountUsed;
      const equityOfferedDefault = postMoney > 0 ? (raiseAmountUsed / postMoney) : 0;
      const equityOffered = committedAmount > 0 && committedEquity > 0 ? committedEquity : equityOfferedDefault;
      const dilutedEquity = this.playerEquity * (preMoney / postMoney);

      if (!success && roundFailuresEnabled) {
        const commitments = closingRound.playerCommitments || {};
        const singlePlayerId = closingRound.commitPlayerId || this.lastCommitPlayerId;

        // Handle legacy single-player case
        if (Object.keys(commitments).length === 0 && singlePlayerId) {
          commitments[singlePlayerId] = Number(closingRound.playerCommitAmount) || 0;
        }

        const refundEvents = [];
        Object.entries(commitments).forEach(([pid, amount]) => {
          if (amount <= 0) return;

          // Update global pending (though it will be cleared)
          this.pendingCommitment = Math.max(0, this.pendingCommitment - amount);

          refundEvents.push({
            companyId: this.id,
            name: this.name,
            valuation: this.currentValuation,
            revenue: this.revenue,
            profit: this.profit,
            refund: amount,
            playerId: pid
          });
        });

        this.consecutiveFails = (this.consecutiveFails || 0) + 1;
        const collapse = this.consecutiveFails >= this.maxFailuresBeforeCollapse;

        if (collapse) {
          this.playerEquity = 0;
          this.playerEquityMap = {};
          this.currentValuation = 0;
          this.status = 'failed';
          const failDate = currentDate ? new Date(currentDate) : (this.lastTick ? new Date(this.lastTick) : new Date());
          this.failedAt = failDate;
          this.failedAtWall = Date.now();
          this.lastEventNote = `${closingRound.stageLabel} round collapsed twice. Operations halted.`;
          this.currentRound = null;
          this.stageChanged = true;
          this.playerInvested = 0;
          this.pendingCommitment = 0;
          this.pendingCommitments = {};
          this.updateFinancialsFromValuation();
          this.recordHistory(currentDate);
          this.postGateMode = false;
          this.postGatePending = false;
          this.hypergrowthActive = false;

          refundEvents.forEach(evt => {
            evt.type = 'venture_failed';
            events.push(evt);
          });
          return events;
        }

        const haircut = this.binarySuccess ? between(0.35, 0.45) : between(0.5, 0.65);
        this.currentValuation = Math.max(1, preMoney * haircut);
        this.lastEventNote = `${closingRound.stageLabel} round slipped; valuation reset to $${Math.round(this.currentValuation).toLocaleString()}.`;
        this.pendingCommitment = 0;
        this.pendingCommitments = {};
        this.currentRound = null;
        this.stageChanged = false;
        this.updateFinancialsFromValuation();
        this.recordHistory(currentDate);
        this.generateRound(currentDate);

        refundEvents.forEach(evt => {
          evt.type = 'venture_round_failed';
          events.push(evt);
        });
        return events;
      }

      this.consecutiveFails = 0;
      const dilutionFactor = preMoney > 0 ? (preMoney / postMoney) : 1;
      if (this.playerEquityMap) {
        Object.keys(this.playerEquityMap).forEach(pid => {
          this.playerEquityMap[pid] = (this.playerEquityMap[pid] || 0) * dilutionFactor;
        });
      }

      let updatedEquity = dilutedEquity;
      if (closingRound.playerCommitted) {
        // Distribute equity to all investors
        const commitments = closingRound.playerCommitments || {};
        const singlePlayerId = closingRound.commitPlayerId || this.lastCommitPlayerId;

        // Handle legacy single-player case if map is empty but flag is set
        if (Object.keys(commitments).length === 0 && singlePlayerId) {
          commitments[singlePlayerId] = Number(closingRound.playerCommitAmount) || 0;
        }

        Object.entries(commitments).forEach(([pid, amount]) => {
          if (amount <= 0) return;
          const fractionOfRound = amount / (closingRound.playerCommitAmount || 1);
          const equityShare = (committedEquity || equityOffered) * fractionOfRound;

          this.playerEquityMap[pid] = (this.playerEquityMap[pid] || 0) + equityShare;

          // Emit event for each investor
          events.push({
            type: 'venture_round_closed',
            companyId: this.id,
            name: this.name,
            valuation: this.currentValuation,
            revenue: this.revenue,
            profit: this.profit,
            equityGranted: equityShare,
            playerEquity: this.playerEquityMap[pid],
            playerId: pid,
            invested: amount,
            stageLabel: closingRound.stageLabel
          });
        });

        updatedEquity += (committedEquity || equityOffered);
        this.playerInvested += this.pendingCommitment || 0;

        // Clear pending commitments
        this.pendingCommitment = 0;
        this.pendingCommitments = {};
      }

      // Maintain legacy single-player equity tracking alongside per-player maps
      this.playerEquity = updatedEquity;

      this.currentValuation = postMoney;
      this.updateFinancialsFromValuation();
      this.recordHistory(currentDate);

      const runwayMonths = closingRound.runwayMonths || between(stage.monthsToNextRound[0], stage.monthsToNextRound[1]);
      const runwayDays = Math.max(120, Math.round(runwayMonths * 30));
      this.cash += raiseAmountUsed;
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
          playerEquityById: { ...(this.playerEquityMap || {}) },
          playerId: this.lastCommitPlayerId || null,
          revenue: this.revenue,
          profit: this.profit,
          companyRef: this
        });
        return events;
      }

      const previousStageLabel = closingRound.stageLabel;
      this.stageIndex = Math.min(this.stageIndex + 1, Math.max(0, this.roundDefinitions.length - 1));
      const displayValuation = this.currentValuation;
      const cashNote = Math.round(raiseAmountUsed).toLocaleString();
      this.stageChanged = true;
      this.generateRound(currentDate);
      const nextStageLabel = this.currentStage ? this.currentStage.label : 'Next round';
      this.lastEventNote = `${previousStageLabel} round closed; +$${cashNote} cash, valuation now $${displayValuation.toLocaleString()}. Next: ${nextStageLabel}.`;
      return events;
    }

    getSummary(currentDate = null) {
      const cash = Number.isFinite(this.cash) ? this.cash : 0;
      const debt = Number.isFinite(this.debt) ? this.debt : 0;
      const listed = this.isListableOnDate(currentDate);
      let historyStartTs = null;
      let historyThirdTs = null;
      let failedAtTs = null;
      if (Array.isArray(this.history) && this.history.length) {
        const xs = this.history
          .map(point => {
            if (!point) return NaN;
            if (Number.isFinite(point.x)) return point.x;
            if (point.x) {
              const t = new Date(point.x).getTime();
              return Number.isFinite(t) ? t : NaN;
            }
            return NaN;
          })
          .filter(Number.isFinite)
          .sort((a, b) => a - b);
        if (xs.length) {
          historyStartTs = xs[0];
          historyThirdTs = xs[Math.min(2, xs.length - 1)];
        }
      }
      if (this.failedAt instanceof Date) {
        const t = this.failedAt.getTime();
        if (Number.isFinite(t)) failedAtTs = t;
      }
      const failedAtWall = Number.isFinite(this.failedAtWall) ? this.failedAtWall : null;
      const isDoingRnd = Array.isArray(this.products) && this.products.some(p => {
        if (!p || !p.stages) return false;
        const stages = Array.isArray(p.stages) ? p.stages : [];
        return stages.length > 0 && !stages.every(s => s && s.completed);
      });
      return {
        id: this.id,
        name: this.name,
        sector: this.sector,
        sector: this.sector,
        founders: Array.isArray(this.founders) ? this.founders.map(f => ({ ...f })) : [],
        mission: this.mission || '',
        founding_location: this.foundingLocation || '',
        valuation: this.currentValuation,
        stageLabel: this.currentStage ? this.currentStage.label : 'N/A',
        status: this.getStatusLabel(),
        playerEquityPercent: this.playerEquity * 100,
        pendingCommitment: this.pendingCommitment || 0,
        lastEventNote: this.lastEventNote,
        revenue: this.revenue,
        profit: this.profit,
        debt,
        playerCommitted: !!(this.currentRound && this.currentRound.playerCommitted),
        cash,
        runwayDays: isFinite(this.cachedRunwayDays) ? this.cachedRunwayDays : null,
        daysSinceRound: this.daysSinceRound,
        daysSinceLastRaise: this.daysSinceLastRaise,
        playerEquityById: { ...(this.playerEquityMap || {}) },
        is_listed: listed,
        history_start_ts: historyStartTs,
        history_third_ts: historyThirdTs,
        failed_at: failedAtTs,
        failed_at_wall: failedAtWall,
        isDoingRnd,
        listing_window: this.listingWindow
          ? {
            from: this.listingWindow.from ? this.listingWindow.from.toISOString() : null,
            to: this.listingWindow.to ? this.listingWindow.to.toISOString() : null
          }
          : null,
        target_listing_date: this.targetListingDate ? this.targetListingDate.toISOString() : null
      };
    }

    getDetail(currentDate = null) {
      const cash = Number.isFinite(this.cash) ? this.cash : 0;
      const debt = Number.isFinite(this.debt) ? this.debt : 0;
      const round = this.currentRound;
      const stage = this.currentStage;
      const daysRemaining = round ? Math.max(0, round.durationDays - this.daysSinceRound) : 0;
      const rounds = Array.isArray(this.roundDefinitions)
        ? this.roundDefinitions.map((r, idx) => ({
          id: r.id,
          label: r.label,
          stageLabel: r.label,
          index: idx
        }))
        : [];
      const stageIndex = Math.max(
        0,
        Math.min(
          Number.isFinite(this.stageIndex) ? Math.trunc(this.stageIndex) : 0,
          Math.max(0, rounds.length - 1)
        )
      );
      const nextStage = rounds.length && stageIndex + 1 < rounds.length ? rounds[stageIndex + 1] : null;
      const listed = this.isListableOnDate(currentDate);
      return {
        id: this.id,
        name: this.name,
        sector: this.sector,
        founders: Array.isArray(this.founders) ? this.founders.map(f => ({ ...f })) : [],
        mission: this.mission || '',
        founding_location: this.foundingLocation || '',
        description: this.description,
        valuation: this.currentValuation,
        stageLabel: stage ? stage.label : 'N/A',
        status: this.getStatusLabel(),
        stageIndex,
        nextStageId: nextStage ? nextStage.id : null,
        nextStageLabel: nextStage ? nextStage.label : null,
        playerEquity: this.playerEquity,
        playerEquityPercent: this.playerEquity * 100,
        playerInvested: this.playerInvested,
        pendingCommitment: this.pendingCommitment || 0,
        pendingCommitments: this.pendingCommitments || {},
        lastEventNote: this.lastEventNote,
        revenue: this.revenue,
        profit: this.profit,
        debt: debt,
        cash: cash,
        runwayDays: isFinite(this.cachedRunwayDays) ? this.cachedRunwayDays : null,
        history: this.history.slice(),
        financialHistory: this.financialHistory.slice(),
        quarterHistory: this.quarterHistory ? this.quarterHistory.slice() : [],
        playerEquityById: { ...(this.playerEquityMap || {}) },
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
          durationDays: round.durationDays || null,
          daysRemaining,
          playerCommitted: round.playerCommitted,
          playerCommitAmount: round.playerCommitAmount || 0,
          playerCommitEquity: round.playerCommitEquity || 0
        } : null,
        rounds,
        is_listed: listed,
        startDate: this.startDate ? this.startDate.getTime() : null,
        listing_window: this.listingWindow
          ? {
            from: this.listingWindow.from ? this.listingWindow.from.toISOString() : null,
            to: this.listingWindow.to ? this.listingWindow.to.toISOString() : null
          }
          : null
      };
    }

    finalizeIPO() {
      this.status = 'ipo';
      this.playerEquity = 0;
      this.playerEquityMap = {};
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
      this.playerEquityMap = this.playerEquityMap || {};
      this.postGateMode = false;
      this.postGatePending = false;
      this.hasPipelineUpdate = true;
      this.lastEventNote = `IPO completed at $${Math.round(this.currentValuation).toLocaleString()}.`;
      this.bankrupt = false;
      this.marketCap = this.currentValuation;
      this.displayCap = this.currentValuation;

      // Preserve some revenue expectations from pipeline when entering public markets
      const unlockedPV = Array.isArray(this.products)
        ? this.products.reduce((s, p) => s + (typeof p.unlockedValue === 'function' ? p.unlockedValue() : 0), 0)
        : 0;
      const optionPV = Array.isArray(this.products)
        ? this.products.reduce((s, p) => s + (typeof p.expectedValue === 'function' ? p.expectedValue() : 0), 0)
        : 0;

      const stage = this.getStageFinancials();
      const ps = stage && stage.ps ? stage.ps : 6;
      const macroFactor = this.macroEnv ? this.macroEnv.getValue(this.sector) : 1;
      const revenueSnapshot = Math.max(1, this.revenue || this.currentValuation / Math.max(ps, 1));
      const denom = Math.max(1e-3, macroFactor * Math.max(this.micro || 1, 0.05) * Math.max(this.revMult || 1, 0.05));
      const pipelineSignal = (unlockedPV + optionPV) / Math.max(ps, 1);
      const normalizedBase = (revenueSnapshot + pipelineSignal + (this.flatRev || 0)) / denom;
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

    getTickSnapshot() {
      const cash = Number.isFinite(this.cash) ? this.cash : 0;
      const debt = Number.isFinite(this.debt) ? this.debt : 0;
      // Include last 2 years of financial history for client merging
      const recentFinancials = this.financialHistory ? this.financialHistory.slice(-12) : [];
      const recentHistory = this.history ? this.history.slice(-400) : [];
      const round = this.currentRound;

      return {
        id: this.id,
        name: this.name,
        founders: Array.isArray(this.founders) ? this.founders.map(f => ({ ...f })) : [],
        mission: this.mission || '',
        founding_location: this.foundingLocation || '',
        valuation: this.currentValuation,
        stageLabel: this.currentStage ? this.currentStage.label : 'N/A',
        status: this.getStatusLabel(),
        playerEquityPercent: this.playerEquity * 100,
        pendingCommitment: this.pendingCommitment || 0,
        lastEventNote: this.lastEventNote,
        revenue: this.revenue,
        profit: this.profit,
        debt,
        playerCommitted: !!(this.currentRound && this.currentRound.playerCommitted),
        cash,
        runwayDays: isFinite(this.cachedRunwayDays) ? this.cachedRunwayDays : null,
        daysSinceRound: this.daysSinceRound,
        daysSinceLastRaise: this.daysSinceLastRaise,
        financialHistory: recentFinancials,
        quarterHistory: this.quarterHistory ? this.quarterHistory.slice(-40) : [],
        playerEquityById: { ...(this.playerEquityMap || {}) },
        history: recentHistory,
        currentRound: round
          ? {
            stageLabel: round.stageLabel,
            raiseAmount: round.raiseAmount,
            preMoney: round.preMoney,
            postMoney: round.postMoney,
            equityOffered: round.equityOffered,
            successProb: round.successProb,
            durationDays: Number.isFinite(round.durationDays) ? round.durationDays : null,
            daysRemaining: Math.max(0, (Number.isFinite(round.durationDays) ? round.durationDays : 0) - (this.daysSinceRound || 0)),
            playerCommitted: !!round.playerCommitted,
            playerCommitAmount: round.playerCommitAmount || 0,
            playerCommitEquity: round.playerCommitEquity || 0
          }
          : null,
        is_listed: this.isListableOnDate(this.currentDate),
        listing_window: this.listingWindow
          ? {
            from: this.listingWindow.from ? this.listingWindow.from.toISOString() : null,
            to: this.listingWindow.to ? this.listingWindow.to.toISOString() : null
          }
          : null
      };
    }
  }

  class VentureSimulation {
    constructor(configs, startDate, options = {}) {
      const seed = options.seed ?? Date.now();
      this.rng = options.rng || new SeededRandom(seed);
      this.rngFn = typeof options.rng === 'function' ? options.rng : () => this.rng.random();
      this.seed = seed;
      this.companies = [];
      withRandomSource(this.rngFn, () => {
        this.companies = (configs || []).map(cfg => new VentureCompany({
          id: cfg.id,
          name: cfg.name,
          sector: cfg.sector,
          description: cfg.description,
          founders: Array.isArray(cfg.founders) ? cfg.founders : [],
          mission: cfg.mission || '',
          founding_location: cfg.founding_location || cfg.foundingLocation || '',
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
          private_listing_window: cfg.private_listing_window || cfg.listing_window || cfg.listingWindow || cfg.listing_window,
          pendingCommitments: cfg.pendingCommitments || {},
          pipeline: Array.isArray(cfg.pipeline) ? cfg.pipeline : [],
          events: Array.isArray(cfg.events) ? cfg.events : []
        }, startDate, this.rngFn));
      });
      this.lastTick = startDate ? new Date(startDate) : new Date('1990-01-01T00:00:00Z');
      this.stageUpdateFlag = false;
    }

    getCompanyById(id) {
      return this.companies.find(c => c.id === id);
    }

    tick(currentDate) {
      return withRandomSource(this.rngFn, () => this._tickInternal(currentDate));
    }

    _tickInternal(currentDate) {
      if (!currentDate) return [];
      if (!(currentDate instanceof Date)) currentDate = new Date(currentDate);
      const dtDays = Math.max(0, (currentDate - this.lastTick) / VC_DAY_MS);
      this.lastTick = new Date(currentDate);
      if (dtDays <= 0) return [];
      const events = [];
      this.companies.forEach(company => {
        if (!company.isActiveOnDate(currentDate)) {
          company.currentDate = new Date(currentDate);
          return;
        }
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

    leadRound(companyId, playerId = null) {
      const company = this.getCompanyById(companyId);
      if (!company) {
        return { success: false, reason: 'Company not found.' };
      }
      const now = this.lastTick ? new Date(this.lastTick) : null;
      if (!company.isListableOnDate(now)) {
        return { success: false, reason: 'Not currently listed.' };
      }
      return company.leadRound(playerId);
    }

    invest(companyId, equityFraction = 0, playerId = null) {
      const company = this.getCompanyById(companyId);
      if (!company) {
        return { success: false, reason: 'Company not found.' };
      }
      const now = this.lastTick ? new Date(this.lastTick) : null;
      if (!company.isListableOnDate(now)) {
        return { success: false, reason: 'Not currently listed.' };
      }
      return company.commitInvestment(equityFraction, playerId);
    }

    getCompanySummaries(currentDate = null) {
      const now = currentDate ? new Date(currentDate) : (this.lastTick ? new Date(this.lastTick) : new Date());
      const cutoffWall = Date.now() - VENTURE_FAIL_TTL_MS;

      // Prune only long-dead failures from the master list
      this.companies = this.companies.filter(company => {
        if (!company) return false;
        if (company.status === 'failed') {
          const failedAtWall = Number.isFinite(company.failedAtWall) ? company.failedAtWall : NaN;
          if (Number.isFinite(failedAtWall) && failedAtWall <= cutoffWall) {
            return false;
          }
        }
        return true;
      });

      return this.companies
        .filter(company => {
          if (!company) return false;
          if (company.exited) return false;
          if (!company.isActiveOnDate(now) && !company.hasPlayerPosition()) return false;
          return true;
        })
        .map(company => company.getSummary(now));
    }

    getCompanyDetail(companyId, currentDate = null) {
      const company = this.getCompanyById(companyId);
      if (!company) return null;
      const now = currentDate ? new Date(currentDate) : (this.lastTick ? new Date(this.lastTick) : null);
      if (!company.isActiveOnDate(now) && !company.hasPlayerPosition()) return null;
      return company.getDetail(now);
    }

    extractCompany(companyId) {
      const index = this.companies.findIndex(c => c.id === companyId);
      if (index >= 0) {
        const [company] = this.companies.splice(index, 1);
        return company;
      }
      return null;
    }

    getPlayerHoldingsValue(playerId = null) {
      return this.companies.reduce((sum, company) => sum + company.getPlayerValuation(playerId), 0);
    }

    getPendingCommitments(playerId = null) {
      return this.companies.reduce((sum, company) => {
        if (!company) return sum;
        if (playerId && company.pendingCommitments && Number.isFinite(company.pendingCommitments[playerId])) {
          return sum + company.pendingCommitments[playerId];
        }
        return sum + (company.pendingCommitment || 0);
      }, 0);
    }

    finalizeIPO(companyId) {
      const company = this.extractCompany(companyId);
      if (company) {
        company.finalizeIPO();
        return company;
      }
      return null;
    }

    exportState(options = {}) {
      const detail = options.detail || false;
      const now = this.lastTick ? new Date(this.lastTick) : null;
      return {
        seed: this.seed ?? null,
        lastTick: this.lastTick ? this.lastTick.toISOString() : null,
        companies: detail
          ? this.companies.map(c => c.getDetail(now))
          : this.companies.map(c => c.getSummary(now))
      };
    }

    getTickSnapshot() {
      return {
        seed: this.seed ?? null,
        lastTick: this.lastTick ? this.lastTick.toISOString() : null,
        companies: this.companies.map(c => c.getTickSnapshot())
      };
    }
  }

  const VentureEngineModule = {
    VentureCompany,
    VentureSimulation,
    VC_STAGE_CONFIG,
    resolveRoundDefinitions,
    buildPublicConfigFromVenture
  };

  global.VentureEngineModule = VentureEngineModule;
  global.VentureSimulation = VentureSimulation;
  global.VC_STAGE_CONFIG = VC_STAGE_CONFIG;
})(typeof globalThis !== 'undefined'
  ? globalThis
  : (typeof window !== 'undefined' ? window : this));
