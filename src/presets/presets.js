(function (global) {
    const GLOBAL_BASE_INTEREST_RATE = 0.07;
    const shared = global.SimShared || {};
    const normalizeSector = typeof shared.normalizeSector === 'function'
        ? shared.normalizeSector
        : (s) => s;
    const defaultRng = typeof shared.random === 'function' ? shared.random : Math.random;
    const buildRandomTools = (options = {}) => {
        const rng = typeof options.rng === 'function' ? options.rng : defaultRng;
        const randBetween = (min, max) => rng() * (max - min) + min;
        const randIntBetween = (min, max) => Math.floor(randBetween(min, max));
        const pickIndex = (len) => Math.floor(rng() * Math.max(len, 1));
        const makeId = (prefix, suffix = '') => {
            const randPart = Math.floor(rng() * 1e9).toString(36);
            return suffix ? `${prefix}_${randPart}_${suffix}` : `${prefix}_${randPart}`;
        };
        return { rng, randBetween, randIntBetween, pickIndex, makeId };
    };

    const basePickRange = (range, fallbackMin, fallbackMax, randBetweenFn) => {
        const rb = randBetweenFn || ((min, max) => defaultRng() * (max - min) + min);
        if (Array.isArray(range) && range.length >= 2) {
            return rb(range[0], range[1]);
        }
        if (typeof range === 'number') {
            return range;
        }
        if (typeof fallbackMin === 'number' && typeof fallbackMax === 'number') {
            return rb(fallbackMin, fallbackMax);
        }
        return fallbackMin ?? 0;
    };

    const slugify = (value) => (value || 'entry').toString().toLowerCase().replace(/\s+/g, '_');

    const DEFAULT_VC_ROUNDS = ['seed', 'series_a', 'series_b', 'series_c', 'series_d', 'series_e', 'series_f', 'pre_ipo'];
    const HARDTECH_VC_ROUNDS = ['series_b', 'series_c', 'series_d', 'pre_ipo'];

    const PRESET_JSON_CACHE = {};
    const HARDTECH_DATA_PATH = 'data/presets/hard_tech.json';
    const MEGACORP_DATA_PATH = 'data/presets/megacorp.json';
    const HYPERGROWTH_DATA_PATH = 'data/presets/hypergrowth.json';
    const TECH_DATA_PATH = 'legacy/data/presets/tech_companies.json';
    const BINARY_HARDTECH_DATA_PATH = 'data/presets/hard_tech.json';
    const BANKING_DATA_PATH = 'data/presets/banking.json';
    const CLASSIC_CORPS_DATA_PATH = 'data/presets/classic.json';

    let fs = null;
    let pathModule = null;
    if (typeof require === 'function') {
        try {
            fs = require('fs');
            pathModule = require('path');
        } catch (err) {
            fs = null;
            pathModule = null;
        }
    }

    function loadPresetJson(path, options = {}) {
        if (PRESET_JSON_CACHE[path]) {
            return PRESET_JSON_CACHE[path];
        }
        const baseDir = options.baseDir || options.rootDir || '';
        const useFs = options.forceNode || options.useFs || (typeof window === 'undefined');

        if (useFs && fs && pathModule) {
            const resolved = baseDir ? pathModule.join(baseDir, path) : path;
            PRESET_JSON_CACHE[path] = new Promise((resolve, reject) => {
                fs.readFile(resolved, 'utf8', (err, data) => {
                    if (err) {
                        PRESET_JSON_CACHE[path] = null;
                        reject(err);
                        return;
                    }
                    try {
                        resolve(JSON.parse(data));
                    } catch (parseErr) {
                        PRESET_JSON_CACHE[path] = null;
                        reject(parseErr);
                    }
                });
            });
            return PRESET_JSON_CACHE[path];
        }

        if (typeof fetch !== 'function') {
            return Promise.reject(new Error(`fetch is unavailable; cannot load preset data from ${path}`));
        }
        PRESET_JSON_CACHE[path] = fetch(path)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load preset JSON ${path}: ${response.status}`);
                }
                return response.json();
            })
            .catch(err => {
                console.error('Preset JSON load failed:', path, err);
                PRESET_JSON_CACHE[path] = null;
                throw err;
            });
        return PRESET_JSON_CACHE[path];
    }

    function pickRange(range, fallbackMin, fallbackMax, randBetweenFn) {
        return basePickRange(range, fallbackMin, fallbackMax, randBetweenFn);
    }

    // Mission strings should be present-participle (e.g., "Building...", not "Build...").
    // Keep founders to 1–3 (2–3 common, 1 rare) and use US locations for consistency.

    function clonePipelineTemplate(template = [], scale = 1, prefix = '') {
        return template.map(entry => {
            // Handle full_revenue_usd as either a number or [min, max] range
            let fullRevenueUsd;
            if (Array.isArray(entry.full_revenue_usd) && entry.full_revenue_usd.length >= 2) {
                fullRevenueUsd = [
                    Math.round(entry.full_revenue_usd[0] * scale),
                    Math.round(entry.full_revenue_usd[1] * scale)
                ];
            } else {
                fullRevenueUsd = Math.round((entry.full_revenue_usd || 0) * scale);
            }
            return {
                id: prefix ? `${prefix}_${entry.id}` : entry.id,
                label: entry.label,
                full_revenue_usd: fullRevenueUsd,
                stages: (entry.stages || []).map(stage => ({ ...stage }))
            };
        });
    }

    async function generateHypergrowthPresetCompanies(options = {}) {
        const { randBetween, randIntBetween, makeId } = buildRandomTools(options);
        const pickRangeLocal = (range, fallbackMin, fallbackMax) => pickRange(range, fallbackMin, fallbackMax, randBetween);
        const data = await loadPresetJson(HYPERGROWTH_DATA_PATH, options);
        const entries = Array.isArray(data?.companies) ? data.companies : [];
        if (entries.length === 0) return [];
        const defaults = data?.defaults || {};

        // Native hypergrowth ventures: PMF parameters and growth/margin curves are defined in hypergrowth.json.
        const defaultPmfLossProb = typeof defaults.pmf_loss_prob_per_year === 'number'
            ? defaults.pmf_loss_prob_per_year
            : 0.10;
        const defaultPmfDeclineRange = defaults.pmf_decline_rate_range || defaults.pmf_decline_rate || [-0.4, -0.25];
        const defaultPmfDeclineDuration = defaults.pmf_decline_duration_years || defaults.pmf_decline_duration || [2, 3];
        const defaultPmfTerminalMarginRange = defaults.pmf_terminal_margin_range || defaults.pmfTerminalMarginRange || [-0.40, -0.15];
        const defaultPmfRecoveryYearsRange = defaults.pmf_recovery_years_range || defaults.pmfRecoveryYearsRange || [3, 4];

        return entries.map((entry, idx) => {
            // Allow per-company overrides with sensible fallbacks to defaults.
            const initialRevenueSource = entry.initial_revenue_usd ?? defaults.initial_revenue_usd;
            const initialPsSource = entry.initial_ps_multiple ?? defaults.initial_ps_multiple;
            const windowYearsSource = entry.hypergrowth_window_years ?? defaults.hypergrowth_window_years;
            const initialGrowthSource = entry.hypergrowth_initial_growth_rate ?? defaults.hypergrowth_initial_growth_rate;
            const terminalGrowthSource = entry.hypergrowth_terminal_growth_rate ?? defaults.hypergrowth_terminal_growth_rate;
            const initialMarginSource = entry.hypergrowth_initial_margin ?? defaults.hypergrowth_initial_margin;
            const terminalMarginSource = entry.hypergrowth_terminal_margin ?? defaults.hypergrowth_terminal_margin;
            const terminalPsSource = entry.terminal_ps_multiple
                ?? defaults.terminal_ps_multiple
                ?? entry.post_gate_initial_ps_multiple
                ?? defaults.post_gate_initial_ps_multiple;
            const postGateTerminalPsSource = entry.post_gate_terminal_ps_multiple ?? defaults.post_gate_terminal_ps_multiple;
            const postGateDecayYearsSource = entry.post_gate_multiple_decay_years ?? defaults.post_gate_multiple_decay_years;

            const initialRevenue = pickRangeLocal(initialRevenueSource, 1_000_000, 4_000_000);
            const initialPs = pickRangeLocal(initialPsSource, 7, 11);
            const hypergrowthWindowYears = pickRangeLocal(windowYearsSource, 2, 4);
            const hypergrowthInitialGrowthRate = pickRangeLocal(initialGrowthSource, 0.6, 1.2);
            const hypergrowthTerminalGrowthRate = pickRangeLocal(terminalGrowthSource, 0.1, 0.25);
            const hypergrowthInitialMargin = pickRangeLocal(initialMarginSource, -0.4, -0.1);
            const hypergrowthTerminalMargin = pickRangeLocal(terminalMarginSource, 0.15, 0.3);
            const terminalPs = pickRangeLocal(terminalPsSource, 12, 20);
            const postGateTerminalPs = pickRangeLocal(postGateTerminalPsSource, 4, 7);
            const postGateDecayYears = pickRangeLocal(postGateDecayYearsSource, 5, 9);

            const pmfLossProb = entry.pmf_loss_prob_per_year ?? defaultPmfLossProb;
            const pmfDeclineRange = entry.pmf_decline_rate_range || defaultPmfDeclineRange;
            const pmfDeclineDuration = entry.pmf_decline_duration_years || defaultPmfDeclineDuration;
            const pmfTerminalMarginRange = entry.pmf_terminal_margin_range || entry.pmfTerminalMarginRange || defaultPmfTerminalMarginRange;
            const pmfRecoveryYearsRange = entry.pmf_recovery_years_range || entry.pmfRecoveryYearsRange || defaultPmfRecoveryYearsRange;

            const valuation = Math.max(1, initialRevenue * initialPs);
            return {
                id: makeId(`preset_hyper_${slugify(entry.name || `hyper_${idx}`)}`, idx),
                name: entry.name || `Hypergrowth ${idx + 1}`,
                sector: normalizeSector(entry.sector || defaults.sector || 'Web'),
                subsector: entry.subsector || null,
                founders: Array.isArray(entry.founders) ? entry.founders.map(f => ({ ...f })) : (Array.isArray(defaults.founders) ? defaults.founders.map(f => ({ ...f })) : []),
                mission: entry.mission || defaults.mission || '',
                founding_location: entry.founding_location || defaults.founding_location || '',
                valuation_usd: valuation,
                initial_revenue_usd: initialRevenue,
                initial_ps_multiple: initialPs,
                funding_round: entry.funding_round || defaults.funding_round || 'Seed',
                ipo_stage: entry.ipo_stage || defaults.ipo_stage || 'series_f',
                binary_success: entry.binary_success ?? defaults.binary_success ?? false,
                gate_stage: entry.gate_stage || defaults.gate_stage || 'series_c',
                hypergrowth_window_years: hypergrowthWindowYears,
                hypergrowth_initial_growth_rate: hypergrowthInitialGrowthRate,
                hypergrowth_terminal_growth_rate: hypergrowthTerminalGrowthRate,
                hypergrowth_initial_margin: hypergrowthInitialMargin,
                hypergrowth_terminal_margin: hypergrowthTerminalMargin,
                terminal_ps_multiple: terminalPs,
                // Back-compat for existing engine fields.
                post_gate_initial_ps_multiple: terminalPs,
                post_gate_terminal_ps_multiple: postGateTerminalPs,
                post_gate_multiple_decay_years: postGateDecayYears,
                max_failures_before_collapse: entry.max_failures_before_collapse ?? defaults.max_failures_before_collapse ?? 1,
                private_listing_window: entry.private_listing_window || defaults.private_listing_window || null,
                rounds: entry.rounds || defaults.rounds || DEFAULT_VC_ROUNDS,
                pmf_loss_prob_per_year: pmfLossProb,
                pmf_decline_rate_range: pmfDeclineRange,
                pmf_decline_duration_years: pmfDeclineDuration,
                pmf_terminal_margin_range: pmfTerminalMarginRange,
                pmf_recovery_years_range: pmfRecoveryYearsRange,
                // structural bias fields intentionally omitted for hypergrowth for now
            };
        });
    }

    async function generateTechPresetCompanies(count = 1, options = {}) {
        const { randBetween, randIntBetween, makeId } = buildRandomTools(options);
        const pickRangeLocal = (range, fallbackMin, fallbackMax) => pickRange(range, fallbackMin, fallbackMax, randBetween);
        const presetData = await loadPresetJson(TECH_DATA_PATH, options);
        const rosterSource = Array.isArray(presetData?.roster) ? presetData.roster.slice() : [];
        if (rosterSource.length === 0) return [];
        const defaults = presetData?.defaults || {};
        const structuralBiasDefaults = defaults.structural_bias || { min: 0.6, max: 3, half_life_years: 18 };
        const marginDefaults = defaults.margin_curve || {};
        const multipleDefaults = defaults.multiple_curve || {};
        const financeDefaults = defaults.finance || {};
        const costDefaults = defaults.costs || {};
        const ipoInstantDefault = defaults.ipo_instantly ?? false;

        const pickRoster = [];
        while (pickRoster.length < count && rosterSource.length > 0) {
            const idx = randIntBetween(0, rosterSource.length);
            pickRoster.push(rosterSource.splice(idx, 1)[0]);
        }

        return pickRoster.map((entry, idx) => {
            const name = entry.name || `Tech Co ${idx + 1}`;
            const baseRevenue = pickRangeLocal(defaults.base_revenue_usd, 1_500_000_000, 7_000_000_000);
            const ipoRange = entry.ipo_window || defaults.ipo_window || { from: 1984, to: 1992 };
            const ipoInstantly = entry.ipo_instantly ?? ipoInstantDefault;

            return {
                id: makeId(`preset_tech_${slugify(name)}`, idx),
                static: {
                    name,
                    sector: normalizeSector(entry.sector || defaults.sector || 'Tech'),
                    subsector: entry.subsector || defaults.subsector || null,
                    founders: (entry.founders || []).map(f => ({ ...f })),
                    mission: entry.mission || defaults.mission || '',
                    founding_location: entry.founding_location || defaults.founding_location || '',
                    ipo_window: ipoRange,
                    ipo_instantly: ipoInstantly
                },
                sentiment: {
                    structural_bias: { ...structuralBiasDefaults }
                },
                base_business: {
                    revenue_process: {
                        initial_revenue_usd: {
                            min: baseRevenue * 0.75,
                            max: baseRevenue * 1.25
                        }
                    },
                    margin_curve: {
                        start_profit_margin: pickRangeLocal(marginDefaults.start_profit_margin, 0.10, 0.16),
                        terminal_profit_margin: pickRangeLocal(marginDefaults.terminal_profit_margin, 0.22, 0.32),
                        years_to_mature: pickRangeLocal(marginDefaults.years_to_mature, 6, 10)
                    },
                    multiple_curve: {
                        initial_ps_ratio: pickRangeLocal(multipleDefaults.initial_ps_ratio, 4.5, 7.5),
                        terminal_pe_ratio: pickRangeLocal(multipleDefaults.terminal_pe_ratio, 16, 26),
                        years_to_converge: pickRangeLocal(multipleDefaults.years_to_converge, 9, 13)
                    }
                },
                finance: {
                    starting_cash_usd: baseRevenue * (financeDefaults.starting_cash_ratio ?? 0.06),
                    starting_debt_usd: baseRevenue * (financeDefaults.starting_debt_ratio ?? 0.01),
                    interest_rate_annual: financeDefaults.interest_rate_annual ?? GLOBAL_BASE_INTEREST_RATE ?? 0.07
                },
                costs: {
                    opex_fixed_usd: pickRangeLocal(costDefaults.opex_fixed_usd, 220_000_000, 480_000_000),
                    opex_variable_ratio: pickRangeLocal(costDefaults.opex_variable_ratio, 0.12, 0.22),
                    rd_base_ratio: pickRangeLocal(costDefaults.rd_base_ratio, 0.06, 0.1)
                },
                pipeline: [],
                events: []
            };
        });
    }

    async function generateClassicCompanies(options = {}) {
        const { randBetween, randIntBetween, makeId } = buildRandomTools(options);
        const pickRangeLocal = (range, fallbackMin, fallbackMax) => pickRange(range, fallbackMin, fallbackMax, randBetween);
        const data = await loadPresetJson(CLASSIC_CORPS_DATA_PATH, options);
        const groups = Array.isArray(data?.groups) ? data.groups : [];
        const globalDefaults = data?.defaults || {};
        const globalSectorDefaults = data?.sector_defaults || {};
        const companies = [];

        // Helper to get decade from ipo_window
        const getDecade = (entry, fallbackWindow) => {
            const ipoWindow = entry.ipo_window || fallbackWindow;
            const year = ipoWindow?.from || 1980;
            return Math.floor(year / 10) * 10;
        };

        groups.forEach(group => {
            const roster = Array.isArray(group?.roster) ? group.roster.slice() : [];
            if (!roster.length) return;
            const defaults = { ...(globalDefaults || {}), ...(group?.defaults || {}) };
            const ipoDefault = defaults.ipo_window || { from: 1980, to: 1990 };
            const sectorDefaultsMap = {};
            if (globalSectorDefaults && typeof globalSectorDefaults === 'object') {
                Object.entries(globalSectorDefaults).forEach(([key, val]) => {
                    const normalized = (key || '').toString().toLowerCase();
                    sectorDefaultsMap[normalized] = val || {};
                });
            }
            if (group?.sector_defaults && typeof group.sector_defaults === 'object') {
                Object.entries(group.sector_defaults).forEach(([key, val]) => {
                    const normalized = (key || '').toString().toLowerCase();
                    sectorDefaultsMap[normalized] = val || {};
                });
            }

            let picked = [];
            const getSector = (entry) => (entry.sector || defaults.sector || 'General');

            if (group.pick_by_sector && typeof group.pick_by_sector === 'object') {
                // Sector-directed picking: honor requested counts, then fill to target if pick is larger
                const rosterCopy = [...roster];
                const totalRequested = Object.values(group.pick_by_sector).reduce((sum, val) => {
                    const count = Math.max(0, Math.floor(Number(val) || 0));
                    return sum + count;
                }, 0);
                const maxAvailable = roster.length;
                const baseTarget = Math.max(totalRequested, Math.floor(Number(group.pick) || 0));
                const target = baseTarget > 0 ? Math.min(baseTarget, maxAvailable) : maxAvailable;

                Object.entries(group.pick_by_sector).forEach(([sectorKey, count]) => {
                    const normalized = (sectorKey || '').toString().toLowerCase();
                    const countInt = Math.max(0, Math.floor(Number(count) || 0));
                    for (let i = 0; i < countInt; i++) {
                        const pool = rosterCopy.filter(entry => getSector(entry).toLowerCase() === normalized);
                        if (!pool.length) break;
                        const idx = randIntBetween(0, pool.length);
                        const chosen = pool[idx];
                        const removeIndex = rosterCopy.indexOf(chosen);
                        if (removeIndex >= 0) rosterCopy.splice(removeIndex, 1);
                        picked.push(chosen);
                    }
                });

                // Fill any remaining slots (if pick exceeds the sector counts) with random entries
                while (picked.length < target && rosterCopy.length > 0) {
                    const idx = randIntBetween(0, rosterCopy.length);
                    picked.push(rosterCopy.splice(idx, 1)[0]);
                }
            } else if (group.pick_by_decade && typeof group.pick_by_decade === 'object') {
                // Group roster by decade
                const byDecade = {};
                roster.forEach(entry => {
                    const sectorKey = getSector(entry).toLowerCase();
                    // Prefer group/global IPO defaults; fall back to sector defaults if missing.
                    const fallbackWindow = ipoDefault || sectorDefaultsMap[sectorKey]?.ipo_window;
                    const decade = getDecade(entry, fallbackWindow);
                    if (!byDecade[decade]) byDecade[decade] = [];
                    byDecade[decade].push(entry);
                });

                // Pick from each decade
                Object.entries(group.pick_by_decade).forEach(([decadeStr, count]) => {
                    const decade = parseInt(decadeStr, 10);
                    const decadeRoster = byDecade[decade] ? [...byDecade[decade]] : [];
                    const pickCount = Math.min(count, decadeRoster.length);
                    for (let i = 0; i < pickCount && decadeRoster.length > 0; i++) {
                        const idx = randIntBetween(0, decadeRoster.length);
                        picked.push(decadeRoster.splice(idx, 1)[0]);
                    }
                });
            } else {
                // Original behavior: pick randomly from entire roster
                const rosterCopy = [...roster];
                const pickCount = Math.min(group.pick || roster.length, roster.length);
                while (picked.length < pickCount && rosterCopy.length > 0) {
                    const idx = randIntBetween(0, rosterCopy.length);
                    picked.push(rosterCopy.splice(idx, 1)[0]);
                }
            }
            picked.forEach((entry, idx) => {
                const sectorKey = getSector(entry).toLowerCase();
                const sectorDefaults = sectorDefaultsMap[sectorKey] || {};
                // Apply sector defaults first, then global/group defaults so group overrides win.
                const effectiveDefaults = { ...sectorDefaults, ...defaults };
                const structuralBiasDefaults = effectiveDefaults.structural_bias || { min: 0.6, max: 1.8, half_life_years: 10 };
                const marginDefaults = effectiveDefaults.margin_curve || {};
                const multipleDefaults = effectiveDefaults.multiple_curve || {};
                const financeDefaults = effectiveDefaults.finance || {};
                const laggedBudgetDefaults = effectiveDefaults.lagged_budget || { enabled: true, lookback_years: 3, time_adjustment_multiplier: 1 };
                const useLaggedBudget = !!laggedBudgetDefaults.enabled;
                const baseCostDefaults = effectiveDefaults.costs || {};
                const costDefaults = useLaggedBudget
                    ? { ...baseCostDefaults, opex_fixed_usd: 0, opex_variable_ratio: 0 }
                    : baseCostDefaults;
                const ipoFallback = effectiveDefaults.ipo_window || ipoDefault;

                const name = entry.name || `${group.label || 'Corp'} ${idx + 1}`;
                const id = makeId(`classic_${slugify(group.id || group.label || 'corp')}_${slugify(name)}`, idx);
                const baseRevenue = pickRangeLocal(effectiveDefaults.base_revenue_usd, 1_000_000_000, 5_000_000_000);
                const ipoRange = entry.ipo_window || ipoFallback;
                const startMargin = pickRangeLocal(marginDefaults.start_profit_margin, 0.05, 0.1);
                const terminalMargin = pickRangeLocal(marginDefaults.terminal_profit_margin, 0.12, 0.25);
                const initialPs = pickRangeLocal(multipleDefaults.initial_ps_ratio ?? multipleDefaults.initial_pe_ratio, 1.2, 6);
                const terminalPe = pickRangeLocal(multipleDefaults.terminal_pe_ratio, 10, 18);
                const startingCashUsd = baseRevenue * (financeDefaults.starting_cash_ratio ?? 0);
                const startingDebtUsd = baseRevenue * (financeDefaults.starting_debt_ratio ?? 0);
                const sharedInterestRate = GLOBAL_BASE_INTEREST_RATE ?? 0.07;
                companies.push({
                    id,
                    static: {
                        name,
                        sector: normalizeSector(entry.sector || effectiveDefaults.sector || 'General'),
                        subsector: entry.subsector || effectiveDefaults.subsector || null,
                        founders: (entry.founders || []).map(f => ({ ...f })),
                        mission: entry.mission || effectiveDefaults.mission || '',
                        founding_location: entry.founding_location || effectiveDefaults.founding_location || '',
                        ipo_window: ipoRange,
                        ipo_instantly: entry.ipo_instantly ?? effectiveDefaults.ipo_instantly ?? false,
                        bankruptcy_date: entry.bankruptcy_date || null
                    },
                    sentiment: {
                        structural_bias: { ...structuralBiasDefaults }
                    },
                    base_business: {
                        revenue_process: {
                            initial_revenue_usd: {
                                min: baseRevenue * 0.8,
                                max: baseRevenue * 1.2
                            }
                        },
                        margin_curve: {
                            start_profit_margin: startMargin,
                            terminal_profit_margin: terminalMargin,
                            years_to_mature: pickRangeLocal(marginDefaults.years_to_mature, 8, 12)
                        },
                        multiple_curve: {
                            initial_ps_ratio: initialPs,
                            terminal_pe_ratio: terminalPe,
                            years_to_converge: pickRangeLocal(multipleDefaults.years_to_converge, 8, 14)
                        },
                        lagged_budget: {
                            enabled: laggedBudgetDefaults.enabled ?? true,
                            lookback_years: laggedBudgetDefaults.lookback_years ?? 3,
                            time_adjustment_multiplier: laggedBudgetDefaults.time_adjustment_multiplier ?? 1
                        }
                    },
                    finance: {
                        starting_cash_usd: startingCashUsd,
                        starting_debt_usd: startingDebtUsd,
                        interest_rate_annual: sharedInterestRate
                    },
                    costs: {
                        opex_fixed_usd: pickRangeLocal(costDefaults.opex_fixed_usd, 20_000_000, 80_000_000),
                        opex_variable_ratio: pickRangeLocal(costDefaults.opex_variable_ratio, 0.1, 0.2),
                        rd_base_ratio: pickRangeLocal(costDefaults.rd_base_ratio, 0.02, 0.06)
                    },
                    pipeline: [],
                    events: []
                });
            });
        });

        return companies;
    }

    async function generatePublicHardTechPresetCompanies(count = null, options = {}) {
        const { randBetween, randIntBetween, makeId } = buildRandomTools(options);
        const pickRangeLocal = (range, fallbackMin, fallbackMax) => pickRange(range, fallbackMin, fallbackMax, randBetween);
        const data = await loadPresetJson(HARDTECH_DATA_PATH, options);
        const mergedGroups = Array.isArray(data?.groups) ? data.groups.filter(g => (g.type || '').toLowerCase() === 'public') : [];
        const useGroupPick = count == null;
        let defaults = mergedGroups.length > 0 ? (data?.defaults?.public || {}) : (data?.defaults || {});

        // Pick entries
        let picked = [];
        if (mergedGroups.length > 0) {
            if (useGroupPick) {
                mergedGroups.forEach(group => {
                    const roster = Array.isArray(group.roster) ? group.roster.map(r => ({ ...r, __group: group })) : [];
                    if (!roster.length) return;
                    const target = Math.min(
                        roster.length,
                        Math.max(0, Math.floor(Number(group.pick) || roster.length))
                    );
                    const rosterCopy = [...roster];
                    for (let i = 0; i < target && rosterCopy.length > 0; i++) {
                        const idx = randIntBetween(0, rosterCopy.length);
                        picked.push(rosterCopy.splice(idx, 1)[0]);
                    }
                });
            } else {
                let rosterSource = mergedGroups.flatMap(g => Array.isArray(g.roster) ? g.roster.map(r => ({ ...r, __group: g })) : []);
                const target = Math.min(Math.max(0, Math.floor(count)), rosterSource.length);
                while (picked.length < target && rosterSource.length > 0) {
                    const idx = randIntBetween(0, rosterSource.length);
                    picked.push(rosterSource.splice(idx, 1)[0]);
                }
            }
        } else {
            const rosterSource = Array.isArray(data?.roster) ? data.roster.slice() : [];
            if (rosterSource.length === 0) return [];
            const target = useGroupPick ? rosterSource.length : Math.min(Math.max(0, Math.floor(count)), rosterSource.length);
            while (picked.length < target && rosterSource.length > 0) {
                const idx = randIntBetween(0, rosterSource.length);
                picked.push(rosterSource.splice(idx, 1)[0]);
            }
        }
        if (picked.length === 0) return [];
        const companies = [];
        const pipelineTemplate = Array.isArray(data?.pipelineTemplate) ? data.pipelineTemplate : (defaults.pipelineTemplate || []);
        const structuralBiasDefaults = defaults.structural_bias || { min: 0.2, max: 6, half_life_years: 25 };
        const marginDefaults = defaults.margin_curve || {};
        const multipleDefaults = defaults.multiple_curve || {};
        const initialRevenueConfig = defaults.initial_revenue_usd || {};
        const pipelineScaleRange = defaults.pipeline_scale || [0.75, 1.25];
        const ipoInstantDefault = defaults.ipo_instantly ?? false;

        picked.forEach((entry, i) => {
            const name = entry.name || `Biotech Innovator ${i + 1}`;
            const founders = (entry.founders || []).map(f => ({ ...f }));
            const id = makeId(`preset_bio_${slugify(name)}`, i);
            const initialRevenueMin = pickRangeLocal(initialRevenueConfig.min, 1_000_000, 5_000_000);
            const maxMultiplier = pickRangeLocal(initialRevenueConfig.maxMultiplier, 4, 8);
            const initialRevenueMax = initialRevenueMin * maxMultiplier;
            const ipoYear = entry.ipo_window ? randIntBetween(entry.ipo_window.from, entry.ipo_window.to) : randIntBetween(1990, 1993);
            const currentPipelineScale = pickRangeLocal(pipelineScaleRange, 0.75, 1.25);
            const ipoInstantly = entry.ipo_instantly ?? ipoInstantDefault;

            let pipeline;
            if (entry.pipeline && Array.isArray(entry.pipeline)) {
                pipeline = clonePipelineTemplate(entry.pipeline, currentPipelineScale, `${id}_pipeline`);
            } else {
                pipeline = clonePipelineTemplate(pipelineTemplate, currentPipelineScale, `${id}_pipeline`);
            }
            // Keep product labels clean without company name suffix

            const valueRealizationPs = typeof entry.value_realization_ps === 'number'
                ? entry.value_realization_ps
                : (typeof defaults.value_realization_ps === 'number' ? defaults.value_realization_ps : null);
            const initialPsSample = pickRangeLocal(multipleDefaults.initial_ps_ratio, 28, 45);
            const initialPs = Number.isFinite(valueRealizationPs) ? valueRealizationPs : initialPsSample;

            const company = {
                id,
                static: {
                    name,
                    sector: normalizeSector(defaults.sector || 'Biotech'),
                    subsector: entry.subsector || defaults.subsector || null,
                    founders,
                    mission: entry.mission || defaults.mission || '',
                    founding_location: entry.founding_location || defaults.founding_location || '',
                    ipo_window: entry.ipo_window || { from: ipoYear, to: ipoYear },
                    ipo_instantly: ipoInstantly
                },
                sentiment: {
                    structural_bias: { ...structuralBiasDefaults }
                },
                base_business: {
                    revenue_process: {
                        initial_revenue_usd: {
                            min: initialRevenueMin,
                            max: initialRevenueMax
                        }
                    },
                    margin_curve: {
                        start_profit_margin: pickRangeLocal(marginDefaults.start_profit_margin, 0.08, 0.15),
                        terminal_profit_margin: pickRangeLocal(marginDefaults.terminal_profit_margin, 0.5, 0.7),
                        years_to_mature: pickRangeLocal(marginDefaults.years_to_mature, 10, 14)
                    },
                    multiple_curve: {
                        initial_ps_ratio: initialPs,
                        terminal_pe_ratio: pickRangeLocal(multipleDefaults.terminal_pe_ratio, 16, 22),
                        years_to_converge: pickRangeLocal(multipleDefaults.years_to_converge, 8, 12)
                    }
                },
                finance: {},
                pipeline,
                events: [],
                initial_valuation_realization: typeof entry.initial_valuation_realization === 'number'
                    ? entry.initial_valuation_realization
                    : (typeof defaults.initial_valuation_realization === 'number'
                        ? defaults.initial_valuation_realization
                        : null)
            };
            companies.push(company);
        });
        return companies;
    }

    async function generatePrivateHardTechCompanies(count = null, options = {}) {
        const { randBetween, randIntBetween, makeId } = buildRandomTools(options);
        const pickRangeLocal = (range, fallbackMin, fallbackMax) => pickRange(range, fallbackMin, fallbackMax, randBetween);
        const data = await loadPresetJson(HARDTECH_DATA_PATH, options);
        const defaults = data?.defaults?.private || data?.defaults || {};
        const mergedGroups = Array.isArray(data?.groups) ? data.groups.filter(g => (g.type || '').toLowerCase() === 'private') : [];
        const defaultPipelineTemplate = Array.isArray(defaults?.pipelineTemplate)
            ? defaults.pipelineTemplate
            : [];
        if (defaultPipelineTemplate.length === 0) return [];
        const useGroupPick = count == null;
        const companies = [];

        const pickFromRoster = (roster, targetCount) => {
            const rosterCopy = [...roster];
            const target = Math.min(Math.max(0, targetCount), rosterCopy.length);
            for (let i = 0; i < target && rosterCopy.length > 0; i++) {
                const idx = randIntBetween(0, rosterCopy.length);
                const entry = rosterCopy.splice(idx, 1)[0];
                const valuation = randBetween(15_000_000, 40_000_000);
                const id = makeId(`preset_hardtech_${slugify(entry.name || 'hardtech')}`, companies.length);
                const pipelineSource = Array.isArray(entry?.pipelineTemplate) && entry.pipelineTemplate.length
                    ? entry.pipelineTemplate
                    : defaultPipelineTemplate;
                const pipelineScale = Number.isFinite(entry?.pipeline_scale) ? entry.pipeline_scale : randBetween(0.8, 1.4);
                const pipelineIdPrefix = `${id}_binary`;
                // Keep product labels clean without company name suffix
                const pipeline = clonePipelineTemplate(pipelineSource, pipelineScale, pipelineIdPrefix).map(p => {
                    return { ...p };
                });
                const initialRevenue = randBetween(2_000_000, 6_000_000);
                const baseBusiness = {
                    revenue_process: {
                        initial_revenue_usd: {
                            min: initialRevenue * 0.7,
                            max: initialRevenue * 1.4
                        }
                    },
                    margin_curve: {
                        start_profit_margin: randBetween(-1.4, -0.6),
                        terminal_profit_margin: randBetween(0.18, 0.32),
                        years_to_mature: randBetween(9, 14)
                    },
                    multiple_curve: {
                        initial_ps_ratio: randBetween(14, 22),
                        terminal_pe_ratio: randBetween(20, 30),
                        years_to_converge: randBetween(10, 14)
                    }
                };
                const finance = {
                    starting_cash_usd: initialRevenue * randBetween(6, 12),
                    starting_debt_usd: 0,
                    interest_rate_annual: GLOBAL_BASE_INTEREST_RATE ?? 0.07
                };
                const costs = {
                    opex_fixed_usd: randBetween(30_000_000, 60_000_000),
                    opex_variable_ratio: randBetween(0.18, 0.32),
                    rd_base_ratio: randBetween(0.05, 0.1)
                };
                const listingWindow = entry.private_listing_window
                    || entry.listing_window
                    || defaults.private_listing_window
                    || defaults.listing_window
                    || defaults.private_listing_window;
                const roundsOverride = Array.isArray(entry.rounds_override) ? entry.rounds_override
                    : Array.isArray(entry.stage_sequence) ? entry.stage_sequence
                        : Array.isArray(entry.rounds) ? entry.rounds
                            : Array.isArray(defaults.rounds) ? defaults.rounds
                                : null;
                const rounds = Array.isArray(roundsOverride) && roundsOverride.length > 0
                    ? roundsOverride.map(r => r && r.toString ? r.toString() : r)
                    : HARDTECH_VC_ROUNDS;
                const fundingRound = entry.funding_round
                    || (Array.isArray(rounds) && rounds.length ? rounds[0] : null)
                    || 'seed';
                companies.push({
                    id,
                    name: entry.name || 'Hardtech Venture',
                    sector: normalizeSector(entry.sector || 'Deep Tech'),
                    subsector: entry.subsector || null,
                    founders: Array.isArray(entry.founders) ? entry.founders.map(f => ({ ...f })) : [],
                    mission: entry.mission || '',
                    founding_location: entry.founding_location || '',
                    valuation_usd: valuation,
                    funding_round: fundingRound,
                    ipo_stage: entry.ipo_stage || 'pre_ipo',
                    binary_success: true,
                    archetype: 'hardtech',
                    gate_stage: entry.gate_stage || 'series_f',
                    initial_valuation_realization: entry.initial_valuation_realization ?? null,
                    hypergrowth_window_years: entry.hypergrowth_window_years ?? randBetween(1.5, 3.5),
                    hypergrowth_initial_growth_rate: entry.hypergrowth_initial_growth_rate ?? randBetween(0.8, 1.8),
                    hypergrowth_terminal_growth_rate: entry.hypergrowth_terminal_growth_rate ?? randBetween(0.15, 0.35),
                    hypergrowth_initial_margin: entry.hypergrowth_initial_margin ?? randBetween(-0.5, -0.2),
                    hypergrowth_terminal_margin: entry.hypergrowth_terminal_margin ?? randBetween(0.2, 0.4),
                    long_run_revenue_ceiling_usd: valuation * randBetween(35, 70),
                    long_run_growth_rate: randBetween(0.25, 0.45),
                    long_run_growth_floor: randBetween(0.05, 0.12),
                    long_run_growth_decay: randBetween(0.08, 0.2),
                    post_gate_initial_ps_multiple: randBetween(10, 16),
                    post_gate_terminal_ps_multiple: randBetween(4, 8),
                    post_gate_multiple_decay_years: randBetween(6, 11),
                    post_gate_margin: entry.post_gate_margin ?? randBetween(0.2, 0.35),
                    max_failures_before_collapse: entry.max_failures_before_collapse ?? 1,
                    private_listing_window: listingWindow || null,
                    base_business: baseBusiness,
                    finance,
                    costs,
                    pipeline,
                    rounds,
                    post_success_mode: entry.post_success_mode || 'ramp'
                });
            }
        };

        if (mergedGroups.length > 0) {
            if (useGroupPick) {
                mergedGroups.forEach(group => {
                    const roster = Array.isArray(group.roster) ? group.roster.map(r => ({ ...r, __group: group })) : [];
                    if (!roster.length) return;
                    const target = Math.min(
                        roster.length,
                        Math.max(0, Math.floor(Number(group.pick) || roster.length))
                    );
                    pickFromRoster(roster, target);
                });
            } else {
                const rosterSource = mergedGroups.flatMap(g => Array.isArray(g.roster) ? g.roster.map(r => ({ ...r, __group: g })) : []);
                pickFromRoster(rosterSource, Math.min(Math.max(0, Math.floor(count)), rosterSource.length));
            }
        }

        return companies;
    }

    // Backwards compatibility aliases
    const generateHardTechPresetCompanies = generatePublicHardTechPresetCompanies;
    const generateBinaryHardTechCompanies = generatePrivateHardTechCompanies;

    global.PresetGenerators = {
        generatePublicHardTechPresetCompanies,
        generateHardTechPresetCompanies,
        generateHypergrowthPresetCompanies,
        generatePrivateHardTechCompanies,
        generateBinaryHardTechCompanies,
        generateClassicCompanies,
        DEFAULT_VC_ROUNDS,
        HARDTECH_VC_ROUNDS
    };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.PresetGenerators;
    }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
