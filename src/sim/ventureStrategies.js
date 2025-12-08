(function (global) {
  const shared = global.SimShared || {};
  const rng = typeof shared.random === 'function' ? shared.random : Math.random;
  const between = shared.between || ((lo, hi) => lo + rng() * (hi - lo));
  const clampValue = shared.clampValue || ((value, min, max) => Math.max(min, Math.min(max, value)));

  const sampleRange = (range, fallbackMin, fallbackMax) => {
    if (Array.isArray(range) && range.length >= 2) return between(range[0], range[1]);
    if (typeof range === 'number') return range;
    return between(fallbackMin, fallbackMax);
  };

  function getHypergrowthPSMultiple(company) {
    const initial = (Number.isFinite(company.initialPSMultiple) && company.initialPSMultiple > 0)
      ? company.initialPSMultiple
      : (company.privatePSMultiple && company.privatePSMultiple > 0 ? company.privatePSMultiple : 6);
    const terminal = (Number.isFinite(company.terminalPSMultiple) && company.terminalPSMultiple > 0)
      ? company.terminalPSMultiple
      : initial;
    const windowYears = Math.max(company.hypergrowthWindowYears || 1, 0.25);
    const elapsed = Number.isFinite(company.hypergrowthElapsedYears) ? company.hypergrowthElapsedYears : 0;
    const progress = Math.max(0, Math.min(1, elapsed / windowYears));
    return initial + (terminal - initial) * progress;
  }

  function computeHypergrowthFairValue(company, applyNoise = true) {
    if (!company) return 1;
    const revenueBase = Number.isFinite(company.revenue) && company.revenue > 0
      ? company.revenue
      : (Number.isFinite(company.initialRevenue) && company.initialRevenue > 0
        ? company.initialRevenue
        : Math.max(1, company.currentValuation || 1));
    const multiple = getHypergrowthPSMultiple(company);
    let base = revenueBase * multiple;
    if (applyNoise) {
      base *= between(0.9, 1.1);
    }
    return Math.max(1, base);
  }

  function computeHardTechFairValue(company, applyNoise = true) {
    // unlockedValue = fullVal × value_realization = unlocked REVENUE potential
    // To convert to valuation, apply the company's value_realization_ps (default 6)
    const unlockedRevenue = company.products.reduce((sum, product) => sum + (typeof product.unlockedValue === 'function' ? product.unlockedValue() : 0), 0);
    const ps = company.valueRealizationPS ?? 6;
    let base = Math.max(1, unlockedRevenue * ps);
    if (applyNoise) {
      base *= between(0.9, 1.1);
    }
    return base;
  }

  function applyPmfLoss(company, dtYears) {
    if (!company || company.archetype !== 'hypergrowth' || !Number.isFinite(dtYears) || dtYears <= 0) return false;
    const prob = company.pmfLossProbPerYear || 0;
    if (!prob || prob <= 0) return false;

    if (!company.hyperPmfState) {
      company.hyperPmfState = {
        active: false,
        elapsedYears: 0,
        durationYears: 0,
        kind: 'late',
        startRevenue: 0,
        startMargin: 0,
        terminalMargin: null
      };
    }
    const state = company.hyperPmfState;

    if (!state.active) {
      const trigger = rng() < prob * dtYears;
      if (trigger) {
        const stage = company.currentStage || null;
        const stageId = (stage && (stage.id || stage.label)) ? String(stage.id || stage.label).toLowerCase() : '';
        const earlyStages = ['seed', 'series_a', 'series a', 'series_b', 'series b'];
        const isEarly = earlyStages.includes(stageId);
        state.kind = isEarly ? 'early' : 'late';
        state.active = true;
        state.elapsedYears = 0;
        state.durationYears = Math.max(0.25, sampleRange(company.pmfDeclineDurationYears, 2, 3));
        state.startRevenue = Math.max(
          1,
          Number.isFinite(company.revenue) && company.revenue > 0 ? company.revenue
            : (Number.isFinite(company.initialRevenue) && company.initialRevenue > 0 ? company.initialRevenue : 1)
        );
        const marginNow = Number.isFinite(company.revenue) && company.revenue !== 0
          ? company.profit / company.revenue
          : (typeof company.hypergrowthInitialMargin === 'number' ? company.hypergrowthInitialMargin : -0.4);
        state.startMargin = clampValue(marginNow, -2, 0.6);
        // Sample a terminal PMF-loss margin and trend toward it over the PMF window.
        const terminalMarginSample = sampleRange(
          company.pmfTerminalMarginRange,
          -0.26,
          -0.15
        );
        state.terminalMargin = clampValue(terminalMarginSample, -1.0, 0.4);

        // TEMP: debug PMF loss triggers
        if (typeof console !== 'undefined' && console && typeof console.log === 'function') {
          console.log('[PMF LOSS TRIGGERED]', {
            id: company.id,
            name: company.name,
            stage: stageId || 'unknown',
            kind: state.kind
          });
        }

        // Enter PMF phase: end hypergrowth so post-hypergrowth drift can take over later.
        company.hypergrowthFinished = true;
        if (Number.isFinite(company.hypergrowthWindowYears) && company.hypergrowthWindowYears > 0) {
          company.hypergrowthElapsedYears = company.hypergrowthWindowYears;
        }
      }
    }

    if (!state.active) return false;

    const years = dtYears;
    const dur = Math.max(0.25, state.durationYears || 1);
    state.elapsedYears += years;
    const rawProgress = state.elapsedYears / dur;
    const progress = clampValue(rawProgress, 0, 1);

    const startRev = state.startRevenue || Math.max(1, company.revenue || 1);
    let targetFactor;

    if (state.kind === 'early') {
      // Seed–Series B/C: more severe decline.
      targetFactor = 1 - 0.8 * progress; // 1.0 -> 0.2 over PMF window
    } else {
      // Series C–IPO: plateau then decline.
      const plateauFrac = 0.25;
      if (progress < plateauFrac) {
        const plateauProg = progress / plateauFrac;
        targetFactor = 1 + 0.05 * plateauProg; // up to +5% then down
      } else {
        const declineProg = (progress - plateauFrac) / Math.max(1 - plateauFrac, 1e-3);
        targetFactor = 1.05 - 0.65 * declineProg; // 1.05 -> ~0.4
      }
    }
    targetFactor = clampValue(targetFactor, 0.05, 1.1);

    const targetRevenue = startRev * targetFactor;
    const smoothing = 1 - Math.exp(-3 * Math.max(years, 0));
    company.revenue = company.revenue > 0
      ? company.revenue + (targetRevenue - company.revenue) * smoothing
      : targetRevenue;

    const fallbackBadMargin = state.kind === 'early' ? -0.6 : -0.25;
    const targetMargin = clampValue(
      Number.isFinite(state.terminalMargin) ? state.terminalMargin : fallbackBadMargin,
      -2,
      0.6
    );
    const margin = clampValue(
      state.startMargin + (targetMargin - state.startMargin) * progress,
      -2,
      0.6
    );
    company.profit = company.revenue * margin;

    if (state.elapsedYears >= state.durationYears) {
      state.active = false;
      // Start a smooth margin recovery back toward a healthier long-run level.
      const recoveryDuration = sampleRange(company.pmfRecoveryYearsRange, 3, 4);
      const currentMargin = company.revenue !== 0 ? (company.profit / company.revenue) : targetMargin;
      const safeCurrent = clampValue(currentMargin, -2, 0.6);
      const baseTarget = typeof company.hypergrowthTerminalMargin === 'number'
        ? company.hypergrowthTerminalMargin
        : (typeof company.hypergrowthInitialMargin === 'number' ? company.hypergrowthInitialMargin : 0.18);
      const safeTarget = clampValue(baseTarget, -0.1, 0.4);
      state.recoveryActive = true;
      state.recoveryElapsedYears = 0;
      state.recoveryDurationYears = Math.max(0.25, recoveryDuration);
      state.recoveryStartMargin = safeCurrent;
      state.recoveryTargetMargin = safeTarget;
    }
    return true;
  }

  function advanceHypergrowthPreGate(company, dtYears) {
    if (company.binarySuccess) {
      company.revenue = 0;
      company.profit = 0;
      return;
    }
    // Ensure a sensible starting revenue
    const ps = company.privatePSMultiple && company.privatePSMultiple > 0 ? company.privatePSMultiple : 6;
    if (!Number.isFinite(company.revenue) || company.revenue <= 0) {
      const baseFromInitial = Number.isFinite(company.initialRevenue) && company.initialRevenue > 0
        ? company.initialRevenue
        : 0;
      const baseFromVal = company.currentValuation > 0 ? company.currentValuation / Math.max(ps, 1e-3) : 0;
      company.revenue = Math.max(1, baseFromInitial, baseFromVal);
    }

    if (!Number.isFinite(company.hypergrowthElapsedYears)) {
      company.hypergrowthElapsedYears = 0;
    }
    const windowYears = Math.max(company.hypergrowthWindowYears || 1, 0.25);
    const elapsed = company.hypergrowthElapsedYears;
    const startFactor = company.hypergrowthInitialGrowthRate || 1.6;
    const endFactor = company.hypergrowthTerminalGrowthRate || 1.15;

    let growthFactor = 1.0;
    if (elapsed < windowYears && dtYears > 0) {
      const progress = Math.min(1, elapsed / windowYears);
      const currentFactor = startFactor + (endFactor - startFactor) * progress;
      growthFactor = Math.pow(Math.max(currentFactor, 1.0), dtYears);
    }
    company.revenue *= growthFactor;
    company.hypergrowthElapsedYears = elapsed + dtYears;
    if (company.hypergrowthElapsedYears >= windowYears) {
      company.hypergrowthFinished = true;
    }

    const marginStart = typeof company.hypergrowthInitialMargin === 'number' ? company.hypergrowthInitialMargin : -0.4;
    const marginEnd = typeof company.hypergrowthTerminalMargin === 'number' ? company.hypergrowthTerminalMargin : marginStart;
    const marginProgress = Math.min(1, company.hypergrowthElapsedYears / windowYears);
    const margin = clampValue(marginStart + (marginEnd - marginStart) * marginProgress, -2, 0.6);
    company.profit = company.revenue * margin;
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
        if (company.raiseOnProgress) {
          company.pendingRaiseFromProgress = true;
        }
        if (company.currentRound) {
          const lastStage = company.getLastCompletedHardTechStage();
          if (lastStage) {
            company.currentRound.pipelineStage = lastStage.name || lastStage.id || company.currentRound.pipelineStage;
          }
          company.currentRound.stageReadyToResolve = true;
          // Reprice the current round now that pipeline value has unlocked, so we don't use a stale pre-money.
          if (typeof company.repriceCurrentRoundAfterProgress === 'function') {
            company.repriceCurrentRoundAfterProgress();
          }
        }
        if (stats.totalStages > 0 && stats.completedStages >= stats.totalStages) {
          company.stageIndex = company.targetStageIndex;
          company.hardTechReadyForIPO = true;
        }
    }
  }

  function advancePostHypergrowthDrift(company, dtYears) {
    if (!Number.isFinite(dtYears) || dtYears <= 0) return;
    if (!Number.isFinite(company.revenue) || company.revenue <= 0) return;

    const windowYears = Math.max(company.hypergrowthWindowYears || 1, 0.25);
    const elapsed = Number.isFinite(company.hypergrowthElapsedYears) ? company.hypergrowthElapsedYears : 0;
    const yearsSinceHyper = Math.max(0, elapsed - windowYears);

    const baseRate = Number.isFinite(company.longRunGrowthRate) ? company.longRunGrowthRate : 0.15;
    const floor = Number.isFinite(company.longRunGrowthFloor) ? company.longRunGrowthFloor : 0.05;
    const decay = Number.isFinite(company.longRunGrowthDecay) ? company.longRunGrowthDecay : 0.3;

    const span = Math.max(0, baseRate - floor);
    const mu = floor + span * Math.exp(-decay * yearsSinceHyper);
    const sigma = Math.max(mu * 0.6, 0.02);
    const shock = between(-1, 1);
    const effRate = clampValue(mu + sigma * shock, -0.5, 0.6);
    const growthFactor = Math.pow(1 + effRate, dtYears);

    const ceiling = Number.isFinite(company.longRunRevenueCeiling) && company.longRunRevenueCeiling > 0
      ? company.longRunRevenueCeiling
      : company.revenue * 50;
    const nextRevenue = Math.min(Math.max(1, company.revenue * growthFactor), ceiling);
    company.revenue = nextRevenue;

    const marginBaseTarget = typeof company.hypergrowthTerminalMargin === 'number'
      ? company.hypergrowthTerminalMargin
      : (typeof company.hypergrowthInitialMargin === 'number' ? company.hypergrowthInitialMargin : 0.18);

    let margin;
    const state = company.hyperPmfState;
    if (state && state.recoveryActive) {
      const dur = Math.max(0.25, state.recoveryDurationYears || 1);
      state.recoveryElapsedYears = (state.recoveryElapsedYears || 0) + dtYears;
      const prog = clampValue(state.recoveryElapsedYears / dur, 0, 1);
      const start = Number.isFinite(state.recoveryStartMargin) ? state.recoveryStartMargin : marginBaseTarget;
      const target = Number.isFinite(state.recoveryTargetMargin) ? state.recoveryTargetMargin : marginBaseTarget;
      margin = clampValue(start + (target - start) * prog, -0.5, 0.6);
      if (state.recoveryElapsedYears >= dur) {
        state.recoveryActive = false;
      }
    } else {
      margin = clampValue(marginBaseTarget, -0.5, 0.6);
    }
    company.profit = company.revenue * margin;
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
      if (company.binarySuccess) {
        base *= 0.9;
      }
      return clampValue(base, 0, 1);
    }

    advancePreGate(dtYears, dtDays, currentDate) {
      const pmfActive = applyPmfLoss(this.company, dtYears);
      if (pmfActive) {
        // While PMF loss is active, revenue and margin are driven by the PMF path.
        return;
      }
      if (!this.company.hypergrowthFinished) {
        advanceHypergrowthPreGate(this.company, dtYears);
      } else {
        advancePostHypergrowthDrift(this.company, dtYears);
      }
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
      if (company.raiseOnProgress && !company.pendingRaiseFromProgress) return false;
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
      if (company.raiseOnProgress) {
        return !!round.stageReadyToResolve;
      }
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
