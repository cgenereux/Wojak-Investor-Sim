(function (global) {
  const shared = global.SimShared || {};
  const rng = typeof shared.random === 'function' ? shared.random : Math.random;
  const between = shared.between || ((lo, hi) => lo + rng() * (hi - lo));
  const clampValue = shared.clampValue || ((value, min, max) => Math.max(min, Math.min(max, value)));

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
    const fin = company.getStageFinancials(stage);
    const targetRevenue = Math.max(company.currentValuation / Math.max(fin.ps || 1, 1e-3), 0);
    const smoothing = 1 - Math.exp(-5 * dtYears);
    company.revenue += (targetRevenue - company.revenue) * smoothing;
    company.profit = company.revenue * fin.margin;
  }

  function advanceHardTechPreGate(company, dtYears, dtDays, currentDate) {
    const days = typeof dtDays === 'number' ? dtDays : dtYears * 365;
    const years = days / 365;
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
    advancePreGate(dtYears, dtDays, currentDate) {}
    computeFairValue(applyNoise = true) { return 1; }
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
      if (!round) return false;
      if (round.stageReadyToResolve) return true;
      if (Number.isFinite(round.durationDays) && company.daysSinceRound >= round.durationDays) {
        return true;
      }
      return false;
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

  global.VentureStrategyModule = {
    computeHypergrowthFairValue,
    computeHardTechFairValue,
    advanceHypergrowthPreGate,
    advanceHardTechPreGate,
    VentureStrategy,
    HypergrowthStrategy,
    HardTechStrategy,
    createVentureStrategy,
    clampValue,
    between
  };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
