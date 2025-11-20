(function (global) {
  const shared = global.SimShared || {};
  const companyModule = global.CompanyModule || {};
  const ventureModule = global.VentureEngineModule || {};
  const macroModule = global.MacroEventModule || {};
  if (!shared.MacroEnvironment || !companyModule.Company) {
    throw new Error('SimShared and CompanyModule must load before simEngine.js');
  }
  const { MacroEnvironment, between, SIM_DAY_MS, SeededRandom, withRandomSource } = shared;
  const { Company, HypergrowthCompany } = companyModule;
  const { VentureSimulation } = ventureModule;
  const { MacroEventManager } = macroModule;
  if (!VentureSimulation) {
    throw new Error('Venture engine module failed to load.');
  }
  if (!MacroEventManager) {
    throw new Error('MacroEventModule must load before simEngine.js.');
  }

  class Simulation {
    constructor(cfg, options = {}) {
      const startYear = options.startYear ?? 1990;
      const dt = options.dt ?? 14;
      const macroEvents = Array.isArray(options.macroEvents) ? options.macroEvents : [];
      const seed = options.seed ?? Date.now();
      this.rng = options.rng || new SeededRandom(seed);
      this.rngFn = typeof options.rng === 'function' ? options.rng : () => this.rng.random();
      this.seed = seed;
      this.dtDays = dt;
      this.startYear = startYear;
      this.macroEventManager = null;
      this.companyConfigs = [];
      this.companies = [];
      this.lastTick = new Date(startYear, 0, 1);

      withRandomSource(this.rngFn, () => {
        this.macroEventManager = new MacroEventManager(macroEvents, this.startYear);
        // build a set of sectors we will need macros for
        const sectorSet = new Set(cfg.map(c => c.static.sector));
        this.macroEnv = new MacroEnvironment(sectorSet, this.macroEventManager);
        this.companyConfigs = cfg.map(c => ({ ...c, isLive: false, ipoDate: null }));
        this.tick(new Date(this.lastTick));
      });
    }

    tick(gameDate) {
      if (!gameDate) return;
      return withRandomSource(this.rngFn, () => this._tickInternal(gameDate));
    }

    _tickInternal(gameDate) {
      const tickDate = gameDate instanceof Date ? new Date(gameDate) : new Date(gameDate);
      this.lastTick = tickDate;
      const dtYears = this.dtDays / 365;

      if (this.macroEventManager) {
        this.macroEventManager.tick(tickDate);
      }

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
            const ipoDay = Math.floor(between(1, 366));
            const d = new Date(ipoYear, 0, 1);
            d.setDate(ipoDay);
            config.ipoDate = d;
          }
        }

        if (tickDate >= config.ipoDate) {
          let co;
          if (config.preset === 'hypergrowth_web_1990') {
            co = new HypergrowthCompany(config, this.macroEnv, this.startYear, config.ipoDate);
          } else {
            co = new Company(config, this.macroEnv, this.startYear, config.ipoDate);
          }
          co.rng = this.rngFn;
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
      this.companies.forEach(c => c.step(this.dtDays, tickDate));
    }

    adoptVentureCompany(company, ipoDate) {
      if (!company) return;
      const effectiveDate = ipoDate ? new Date(ipoDate) : new Date();
      company.promoteToPublic(this.macroEnv, effectiveDate);
      this.companies.push(company);
    }

    getActiveMacroEvents() {
      return this.macroEventManager ? this.macroEventManager.getActiveEvents(this.lastTick) : [];
    }

    triggerMacroEvent(eventId) {
      if (!this.macroEventManager) return null;
      return this.macroEventManager.forceTrigger(eventId, this.lastTick || new Date());
    }

    exportState(options = {}) {
      const detail = options.detail || false;
      const includeCompanies = options.includeCompanies !== false;
      const state = {
        seed: this.seed ?? null,
        startYear: this.startYear,
        dtDays: this.dtDays,
        lastTick: this.lastTick ? this.lastTick.toISOString() : null,
        macroEvents: this.getActiveMacroEvents()
      };
      if (includeCompanies) {
        state.companies = this.companies.map(c => {
          if (detail && typeof c.getDetail === 'function') {
            return c.getDetail();
          }
          if (typeof c.toSnapshot === 'function') {
            return c.toSnapshot(options);
          }
          return { id: c.id, name: c.name, marketCap: c.marketCap };
        });
      }
      return state;
    }
  }

  global.Simulation = Simulation;
})(typeof globalThis !== 'undefined'
  ? globalThis
  : (typeof window !== 'undefined' ? window : this));
