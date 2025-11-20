(function (global) {
  const shared = global.SimShared || {};
  const getRng = () => (typeof shared.random === 'function' ? shared.random : Math.random);
  const randBetween = (min, max, rngFn = getRng()) => rngFn() * (max - min) + min;
  const randIntBetween = (min, max) => Math.floor(randBetween(min, max + 1));
  const DAY_MS = 24 * 60 * 60 * 1000;

  const pickFromRange = (range, fallback) => {
    if (Array.isArray(range) && range.length >= 2) {
      const [min, max] = range;
      return randBetween(min, max);
    }
    if (typeof range === 'number') return range;
    return fallback;
  };

  class MacroEventManager {
    constructor(definitions = [], baseYear = 1990) {
      this.baseYear = baseYear;
      this.events = [];
      this.activeEvents = [];
      this.definitionMap = {};
      this.currentDate = new Date(baseYear, 0, 1);
      (definitions || []).forEach(def => {
        if (!def || !def.id) return;
        this.definitionMap[def.id] = def;
        const instance = this.createInstance(def);
        if (instance) this.events.push(instance);
      });
    }

    createInstance(def = {}, options = {}) {
      const chance = typeof def.chance === 'number' ? def.chance : 1;
      const force = !!options.force;
      const rngFn = getRng();
      if (!force && rngFn() > chance) return null;
      const id = def.id || `macro_event_${Math.floor(rngFn() * 1e9).toString(36)}`;
      const label = def.label || 'Macro Event';
      const description = def.description || def.notes || '';
      const startRange = Array.isArray(def.start_year_range) && def.start_year_range.length === 2
        ? def.start_year_range
        : [def.start_year || this.baseYear + 2, def.start_year || this.baseYear + 2];
      const startYear = randIntBetween(startRange[0], startRange[1]);
      const startDay = def.start_day || randIntBetween(1, 365);
      const startDate = options.startDate
        ? new Date(options.startDate)
        : (() => {
            const date = new Date(startYear, 0, 1);
            date.setDate(startDay);
            return date;
          })();
      const impactDays = Math.max(30, Math.floor(pickFromRange(def.impact_days_range, def.impact_days || 180)));
      const recoveryDays = Math.max(30, Math.floor(pickFromRange(def.recovery_days_range, def.recovery_days || impactDays)));
      const totalDays = impactDays + recoveryDays;
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + totalDays);
      const globalMinMultiplier = pickFromRange(def.global_multiplier_range, def.global_multiplier ?? 1);
      const valuationMinMultiplier = pickFromRange(def.valuation_compression_range, def.valuation_compression ?? 1);
      const sectorImpacts = Array.isArray(def.sector_impacts)
        ? def.sector_impacts.map(entry => {
            const min = pickFromRange(entry.min_multiplier, entry.multiplier ?? entry.value ?? globalMinMultiplier);
            return {
              sector: entry.sector || 'ALL',
              minMultiplier: typeof min === 'number' ? min : globalMinMultiplier
            };
          })
        : [];
      const state = options.forceActive ? 'active' : 'scheduled';
      return {
        id,
        label,
        description,
        effects: Array.isArray(def.effects) ? def.effects : [],
        startDate,
        endDate,
        impactDays,
        recoveryDays,
        totalDays,
        globalMinMultiplier: typeof globalMinMultiplier === 'number' ? globalMinMultiplier : 1,
        valuationMinMultiplier: typeof valuationMinMultiplier === 'number' ? valuationMinMultiplier : 1,
        sectorImpacts,
        state
      };
    }

    tick(currentDate) {
      if (!currentDate) return;
      const dateObj = currentDate instanceof Date ? new Date(currentDate) : new Date(currentDate);
      this.currentDate = dateObj;
      this.events.forEach(event => {
        if (event.state === 'scheduled' && dateObj >= event.startDate) {
          event.state = 'active';
        }
        if (event.state === 'active' && dateObj >= event.endDate) {
          event.state = 'ended';
        }
      });
      this.activeEvents = this.events.filter(evt => evt.state === 'active');
    }

    getActiveEvents(referenceDate) {
      const ref = referenceDate instanceof Date ? referenceDate : (this.currentDate || new Date());
      return this.activeEvents.map(evt => ({
        id: evt.id,
        label: evt.label,
        description: evt.description,
        daysRemaining: Math.max(0, Math.ceil((evt.endDate - ref) / DAY_MS))
      }));
    }

    getMacroMuDelta() {
      if (!this.activeEvents.length) return 0;
      return this.activeEvents.reduce((delta, event) => {
        event.effects.forEach(effect => {
          if (effect.type === 'macro_mu_delta') {
            const value = typeof effect.value === 'number' ? effect.value : effect.delta;
            if (typeof value === 'number') delta += value;
          }
        });
        return delta;
      }, 0);
    }

    getVolatilityMultiplier() {
      if (!this.activeEvents.length) return 1;
      return this.activeEvents.reduce((mult, event) => {
        event.effects.forEach(effect => {
          if (effect.type === 'volatility_multiplier') {
            const value = typeof effect.value === 'number' ? effect.value : effect.multiplier;
            if (typeof value === 'number' && value > 0) mult *= value;
          }
        });
        return mult;
      }, 1);
    }

    getRevenueMultiplier(sector) {
      if (!this.activeEvents.length) return 1;
      const ref = this.currentDate || new Date();
      return this.activeEvents.reduce((mult, event) => {
        return mult * this.computeEventMultiplier(event, {
          sector,
          referenceDate: ref,
          baseMin: event.globalMinMultiplier,
          sectorImpacts: event.sectorImpacts
        });
      }, 1);
    }

    getValuationMultiplier(sector) {
      if (!this.activeEvents.length) return 1;
      const ref = this.currentDate || new Date();
      return this.activeEvents.reduce((mult, event) => {
        return mult * this.computeEventMultiplier(event, {
          sector,
          referenceDate: ref,
          baseMin: event.valuationMinMultiplier || 1,
          sectorImpacts: []
        });
      }, 1);
    }

    computeEventMultiplier(event, options = {}) {
      const referenceDate = options.referenceDate || this.currentDate || new Date();
      const sector = options.sector;
      const defaultMin = typeof options.baseMin === 'number' ? options.baseMin : 1;
      const sectorImpacts = Array.isArray(options.sectorImpacts) ? options.sectorImpacts : [];
      const elapsed = (referenceDate - event.startDate) / DAY_MS;
      if (elapsed < 0) return 1;
      if (elapsed >= event.totalDays) return 1;
      const targetSector = sector ? sector.toLowerCase() : 'all';
      const sectorImpact = sectorImpacts.find(entry => {
        const entrySector = (entry.sector || 'all').toLowerCase();
        return entrySector === 'all' || entrySector === targetSector;
      });
      const minMultiplier = sectorImpact ? sectorImpact.minMultiplier : defaultMin;
      if (event.impactDays <= 0 || event.recoveryDays <= 0) {
        return typeof minMultiplier === 'number' && minMultiplier > 0 ? minMultiplier : 1;
      }
      if (elapsed <= event.impactDays) {
        const progress = elapsed / event.impactDays;
        return 1 - (1 - minMultiplier) * progress;
      }
      const recoveryProgress = (elapsed - event.impactDays) / event.recoveryDays;
      return minMultiplier + (1 - minMultiplier) * recoveryProgress;
    }

    forceTrigger(eventId, currentDate) {
      if (!eventId || !this.definitionMap[eventId]) return null;
      const now = currentDate instanceof Date ? new Date(currentDate) : (this.currentDate || new Date());
      const def = this.definitionMap[eventId];
      const instance = this.createInstance(def, { startDate: now, forceActive: true, force: true });
      if (!instance) return null;
      this.events.push(instance);
      this.activeEvents.push(instance);
      return instance;
    }
  }

  global.MacroEventModule = {
    MacroEventManager
  };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
