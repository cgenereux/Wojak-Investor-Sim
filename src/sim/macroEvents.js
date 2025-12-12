(function (global) {
  const shared = global.SimShared || {};
  const normalizeSector = typeof shared.normalizeSector === 'function'
    ? shared.normalizeSector
    : (s) => s;
  const getRng = () => (typeof shared.random === 'function' ? shared.random : Math.random);
  const randBetween = (min, max, rngFn = getRng()) => rngFn() * (max - min) + min;
  const randIntBetween = (min, max) => Math.floor(randBetween(min, max + 1));
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MIN_MACRO_EVENT_GAP_DAYS = 120;

  const pickFromRange = (range, fallback) => {
    if (Array.isArray(range) && range.length >= 2) {
      const [min, max] = range;
      return randBetween(min, max);
    }
    if (typeof range === 'number') return range;
    return fallback;
  };

  const pickDescription = (def, rngFn = getRng()) => {
    if (Array.isArray(def.descriptions) && def.descriptions.length > 0) {
      const idx = Math.floor(rngFn() * def.descriptions.length);
      const entry = def.descriptions[idx];
      if (typeof entry === 'string') return entry;
    }
    return def.description || def.notes || '';
  };

  const applyTemplate = (text, vars = {}) => {
    if (typeof text !== 'string' || !text) return text;
    let out = text;
    Object.entries(vars).forEach(([key, value]) => {
      const needle = `{${key}}`;
      const replacement = value == null ? '' : String(value);
      // Use split/join for broad compatibility.
      out = out.split(needle).join(replacement);
    });
    return out;
  };

  const pickFromValues = (values, rngFn = getRng()) => {
    if (!Array.isArray(values) || values.length === 0) return null;
    const filtered = values.filter(v => typeof v === 'number' && Number.isFinite(v));
    if (filtered.length === 0) return null;
    const idx = Math.floor(rngFn() * filtered.length);
    return filtered[Math.max(0, Math.min(filtered.length - 1, idx))];
  };

  class MacroEventManager {
    constructor(definitions = [], baseYear = 1990) {
      this.baseYear = baseYear;
      this.events = [];
      this.activeEvents = [];
      this.definitionMap = {};
      this.currentDate = new Date(baseYear, 0, 1);
      this.globalInterestShift = 0;
      (definitions || []).forEach(def => {
        if (!def || !def.id) return;
        this.definitionMap[def.id] = def;
        const instance = this.createInstance(def);
        if (instance) this.events.push(instance);
      });
      this.enforceEventSpacing();
    }

    createInstance(def = {}, options = {}) {
      const chance = typeof def.chance === 'number' ? def.chance : 1;
      const force = !!options.force;
      const rngFn = getRng();
      if (!force && rngFn() > chance) return null;
      const id = def.id || `macro_event_${Math.floor(rngFn() * 1e9).toString(36)}`;
      const rawLabel = def.label || 'Macro Event';
      const rawDescription = pickDescription(def, rngFn);
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
          const rawSector = entry.sector || 'ALL';
          const canonical = normalizeSector(rawSector) || rawSector;
          return {
            sector: canonical,
            minMultiplier: typeof min === 'number' ? min : globalMinMultiplier
          };
        })
        : [];
      const state = options.forceActive ? 'active' : 'scheduled';
      const polarity = typeof def.polarity === 'string' ? def.polarity.toLowerCase() : '';
      const isPositive = def.good === true || def.positive === true || polarity === 'positive' || polarity === 'good';
      const isNegative = def.bad === true || def.negative === true || polarity === 'negative' || polarity === 'bad';
      const resolvedEffects = (Array.isArray(def.effects) ? def.effects : []).map(effect => {
        if (!effect || typeof effect !== 'object') return effect;
        const copy = { ...effect };
        if (copy.type === 'interest_rate_shift') {
          if (Array.isArray(copy.delta_range) && copy.delta_range.length >= 2) {
            const [min, max] = copy.delta_range;
            if (typeof min === 'number' && typeof max === 'number' && Number.isFinite(min) && Number.isFinite(max)) {
              copy.delta = randBetween(Math.min(min, max), Math.max(min, max), rngFn);
            }
            delete copy.delta_range;
          }
        }
        if (copy.type === 'interest_rate_annual') {
          if (Array.isArray(copy.values)) {
            const picked = pickFromValues(copy.values, rngFn);
            if (typeof picked === 'number') {
              copy.value = picked;
            }
            delete copy.values;
          } else if (Array.isArray(copy.value_range) && copy.value_range.length >= 2) {
            const [min, max] = copy.value_range;
            if (typeof min === 'number' && typeof max === 'number' && Number.isFinite(min) && Number.isFinite(max)) {
              copy.value = randBetween(Math.min(min, max), Math.max(min, max), rngFn);
            }
            delete copy.value_range;
          }
        }
        return copy;
      });
      const annualRateEffect = resolvedEffects.find(e => e && e.type === 'interest_rate_annual' && typeof e.value === 'number' && Number.isFinite(e.value));
      const annualRate = annualRateEffect ? annualRateEffect.value : null;
      const ratePct = Number.isFinite(annualRate) ? Math.round(annualRate * 100) : null;
      const templateVars = Number.isFinite(ratePct)
        ? { rate: `${ratePct}%`, rate_pct: String(ratePct) }
        : {};
      const label = applyTemplate(rawLabel, templateVars);
      const description = applyTemplate(rawDescription, templateVars);
      return {
        id,
        label,
        description,
        effects: resolvedEffects,
        startDate,
        endDate,
        impactDays,
        recoveryDays,
        totalDays,
        globalMinMultiplier: typeof globalMinMultiplier === 'number' ? globalMinMultiplier : 1,
        valuationMinMultiplier: typeof valuationMinMultiplier === 'number' ? valuationMinMultiplier : 1,
        sectorImpacts,
        state,
        polarity: isPositive ? 'positive' : (isNegative ? 'negative' : 'neutral'),
        isPositive,
        isNegative
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
        polarity: evt.polarity || 'neutral',
        isPositive: !!evt.isPositive,
        isNegative: !!evt.isNegative,
        interestRateAnnual: (() => {
          if (!Array.isArray(evt.effects)) return null;
          for (let i = 0; i < evt.effects.length; i++) {
            const effect = evt.effects[i];
            if (effect && effect.type === 'interest_rate_annual' && typeof effect.value === 'number' && Number.isFinite(effect.value)) {
              return effect.value;
            }
          }
          return null;
        })(),
        interestRateShift: Array.isArray(evt.effects)
          ? evt.effects.reduce((acc, effect) => {
              if (effect && effect.type === 'interest_rate_shift' && typeof effect.delta === 'number' && Number.isFinite(effect.delta)) {
                acc += effect.delta;
              }
              return acc;
            }, 0)
          : 0,
        totalDays: evt.totalDays || Math.max(1, Math.ceil((evt.endDate - evt.startDate) / DAY_MS)),
        progress: (() => {
          const elapsed = Math.max(0, (ref - evt.startDate) / DAY_MS);
          const total = evt.totalDays || Math.max(1, (evt.endDate - evt.startDate) / DAY_MS);
          return Math.max(0, Math.min(1, elapsed / total));
        })(),
        daysRemaining: Math.max(0, Math.ceil((evt.endDate - ref) / DAY_MS))
      }));
    }

    getInterestRateAnnual(baseAnnualRate = 0) {
      const base = (typeof baseAnnualRate === 'number' && Number.isFinite(baseAnnualRate)) ? baseAnnualRate : 0;
      const shift = this.getInterestRateShift();
      const shifted = Math.max(0, base + shift);
      if (!this.activeEvents.length) return shifted;
      const ref = this.currentDate || new Date();
      let chosen = null;
      let chosenStart = null;
      this.activeEvents.forEach(evt => {
        if (!evt || !Array.isArray(evt.effects)) return;
        const rateEffect = evt.effects.find(e => e && e.type === 'interest_rate_annual' && typeof e.value === 'number' && Number.isFinite(e.value));
        if (!rateEffect) return;
        const start = evt.startDate instanceof Date ? evt.startDate : null;
        if (!start) return;
        if (start > ref) return;
        if (!chosenStart || start > chosenStart) {
          chosenStart = start;
          chosen = rateEffect.value;
        }
      });
      if (typeof chosen === 'number' && Number.isFinite(chosen)) {
        return Math.max(0, chosen);
      }
      return shifted;
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

    getInterestRateShift() {
      if (!this.activeEvents.length) return 0;
      return this.activeEvents.reduce((acc, event) => {
        event.effects.forEach(effect => {
          if (effect.type === 'interest_rate_shift' && typeof effect.delta === 'number') {
            acc += effect.delta;
          }
        });
        return acc;
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
      const canonicalSector = sector ? normalizeSector(sector) : null;
      return this.activeEvents.reduce((mult, event) => {
        return mult * this.computeEventMultiplier(event, {
          sector: canonicalSector,
          referenceDate: ref,
          baseMin: event.globalMinMultiplier,
          sectorImpacts: event.sectorImpacts
        });
      }, 1);
    }

    getValuationMultiplier(sector) {
      if (!this.activeEvents.length) return 1;
      const ref = this.currentDate || new Date();
      const canonicalSector = sector ? normalizeSector(sector) : null;
      return this.activeEvents.reduce((mult, event) => {
        return mult * this.computeEventMultiplier(event, {
          sector: canonicalSector,
          referenceDate: ref,
          baseMin: event.valuationMinMultiplier || 1,
          sectorImpacts: []
        });
      }, 1);
    }

    getRevenueBiasMultiplier(sector) {
      if (!this.activeEvents.length) return 1;
      const ref = this.currentDate || new Date();
      const canonicalSector = sector ? normalizeSector(sector) : null;
      return this.activeEvents.reduce((mult, event) => {
        return mult * this.computeEventMultiplier(event, {
          sector: canonicalSector,
          referenceDate: ref,
          baseMin: event.globalMinMultiplier,
          sectorImpacts: event.sectorImpacts
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
      const targetSector = sector ? String(sector).toLowerCase() : 'all';
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

    enforceEventSpacing(minGapDays = MIN_MACRO_EVENT_GAP_DAYS) {
      if (!Array.isArray(this.events) || this.events.length < 2) return;
      const gapMs = Math.max(0, minGapDays) * DAY_MS;
      const sorted = [...this.events].sort((a, b) => a.startDate - b.startDate);
      let lastEnd = null;
      sorted.forEach(evt => {
        if (!evt || !evt.startDate || !evt.endDate) return;
        if (lastEnd) {
          const earliestStart = new Date(lastEnd.getTime() + gapMs);
          if (evt.startDate < earliestStart) {
            const durationDays = evt.totalDays || Math.max(1, Math.ceil((evt.endDate - evt.startDate) / DAY_MS));
            evt.startDate = earliestStart;
            evt.endDate = new Date(evt.startDate.getTime() + durationDays * DAY_MS);
            evt.totalDays = durationDays;
          }
        }
        lastEnd = evt.endDate;
      });
      this.events = sorted;
    }
  }

  global.MacroEventModule = {
    MacroEventManager
  };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
