(function (global) {
    const shared = global.SimShared || {};
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

    const DEFAULT_VC_ROUNDS = ['seed','series_a','series_b','series_c','series_d','series_e','series_f','pre_ipo'];
    const HARDTECH_VC_ROUNDS = ['series_b','series_c','series_d','pre_ipo'];

    const PRESET_JSON_CACHE = {};
    const HARDTECH_DATA_PATH = 'data/presets/hardtech.json';
    const MEGACORP_DATA_PATH = 'data/presets/megacorp.json';
    const HYPERGROWTH_DATA_PATH = 'data/presets/hypergrowth.json';
    const PRODUCT_ROTATOR_DATA_PATH = 'data/presets/product_rotator.json';
    const PRODUCT_CATALOG_DATA_PATH = 'data/productCatalogs/core.json';

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

    function clonePipelineTemplate(template = [], scale = 1, prefix = '') {
        return template.map(entry => ({
            id: prefix ? `${prefix}_${entry.id}` : entry.id,
            label: entry.label,
            full_revenue_usd: Math.round((entry.full_revenue_usd || 0) * scale),
            stages: (entry.stages || []).map(stage => ({ ...stage }))
        }));
    }

    async function generateHardTechPresetCompanies(count = 1, options = {}) {
        const { randBetween, randIntBetween, makeId } = buildRandomTools(options);
        const pickRangeLocal = (range, fallbackMin, fallbackMax) => pickRange(range, fallbackMin, fallbackMax, randBetween);
        const data = await loadPresetJson(HARDTECH_DATA_PATH, options);
        const rosterSource = Array.isArray(data?.roster) ? data.roster.slice() : [];
        if (rosterSource.length === 0) return [];
        const picked = [];
        while (picked.length < count && rosterSource.length > 0) {
            const idx = randIntBetween(0, rosterSource.length);
            picked.push(rosterSource.splice(idx, 1)[0]);
        }
        const companies = [];
        const defaults = data?.defaults || {};
        const pipelineTemplate = Array.isArray(data?.pipelineTemplate) ? data.pipelineTemplate : [];
        const structuralBiasDefaults = defaults.structural_bias || { min: 0.2, max: 6, half_life_years: 25 };
        const marginDefaults = defaults.margin_curve || {};
        const multipleDefaults = defaults.multiple_curve || {};
        const initialRevenueConfig = defaults.initial_revenue_usd || {};
        const pipelineScaleRange = defaults.pipeline_scale || [0.75, 1.25];

        picked.forEach((entry, i) => {
            const name = entry.name || `Biotech Innovator ${i + 1}`;
            const founders = (entry.founders || []).map(f => ({ ...f }));
            const id = makeId(`preset_bio_${slugify(name)}`, i);
            const initialRevenueMin = pickRangeLocal(initialRevenueConfig.min, 1_000_000, 5_000_000);
            const maxMultiplier = pickRangeLocal(initialRevenueConfig.maxMultiplier, 4, 8);
            const initialRevenueMax = initialRevenueMin * maxMultiplier;
            const ipoYear = entry.ipo_window ? randIntBetween(entry.ipo_window.from, entry.ipo_window.to) : randIntBetween(1990, 1993);
            const currentPipelineScale = pickRangeLocal(pipelineScaleRange, 0.75, 1.25);

            const company = {
                id,
                static: {
                    name,
                    sector: defaults.sector || 'Biotech',
                    founders,
                    mission: entry.mission || defaults.mission || '',
                    founding_location: entry.founding_location || defaults.founding_location || '',
                    ipo_window: entry.ipo_window || { from: ipoYear, to: ipoYear },
                    ipo_instantly: true
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
                        initial_ps_ratio: pickRangeLocal(multipleDefaults.initial_ps_ratio, 28, 45),
                        terminal_pe_ratio: pickRangeLocal(multipleDefaults.terminal_pe_ratio, 16, 22),
                        years_to_converge: pickRangeLocal(multipleDefaults.years_to_converge, 8, 12)
                    }
                },
                finance: {},
                pipeline: clonePipelineTemplate(pipelineTemplate, currentPipelineScale, `${id}_pipeline`),
                events: []
            };
            companies.push(company);
        });
        return companies;
    }

    async function generateSteadyMegacorpCompanies(count = 1, options = {}) {
        const { randBetween, randIntBetween, makeId } = buildRandomTools(options);
        const pickRangeLocal = (range, fallbackMin, fallbackMax) => pickRange(range, fallbackMin, fallbackMax, randBetween);
        const data = await loadPresetJson(MEGACORP_DATA_PATH, options);
        const rosterSource = Array.isArray(data?.roster) ? data.roster.slice() : [];
        if (rosterSource.length === 0) return [];
        const defaults = data?.defaults || {};
        const structuralBiasDefaults = defaults.structural_bias || { min: 0.5, max: 3, half_life_years: 15 };
        const marginDefaults = defaults.margin_curve || {};
        const multipleDefaults = defaults.multiple_curve || {};
        const financeDefaults = defaults.finance || {};
        const picked = [];
        while (picked.length < count && rosterSource.length > 0) {
            const idx = randIntBetween(0, rosterSource.length);
            picked.push(rosterSource.splice(idx, 1)[0]);
        }
        const companies = [];
        picked.forEach((entry, i) => {
            const name = entry.name || `MegaMart ${i + 1}`;
            const founders = (entry.founders || []).map(f => ({ ...f }));
            const id = makeId(`preset_megacorp_${slugify(name)}`, i);
            const baseRevenue = pickRangeLocal(defaults.base_revenue_usd, 60_000_000_000, 200_000_000_000);
            const ipoRange = entry.ipo_window || { from: 1980, to: 1985 };
            const startingCashRatio = financeDefaults.starting_cash_ratio ?? 0.03;
            const startingDebtRatio = financeDefaults.starting_debt_ratio ?? 0.05;
            const company = {
                id,
                static: {
                    name,
                    sector: entry.sector || 'Retail',
                    founders,
                    mission: entry.mission || defaults.mission || '',
                    founding_location: entry.founding_location || defaults.founding_location || '',
                    ipo_window: ipoRange,
                    ipo_instantly: true
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
                        start_profit_margin: pickRangeLocal(marginDefaults.start_profit_margin, 0.025, 0.04),
                        terminal_profit_margin: pickRangeLocal(marginDefaults.terminal_profit_margin, 0.05, 0.08),
                        years_to_mature: pickRangeLocal(marginDefaults.years_to_mature, 7, 10)
                    },
                    multiple_curve: {
                        initial_ps_ratio: pickRangeLocal(multipleDefaults.initial_ps_ratio, 0.7, 1.1),
                        terminal_pe_ratio: pickRangeLocal(multipleDefaults.terminal_pe_ratio, 12, 15),
                        years_to_converge: pickRangeLocal(multipleDefaults.years_to_converge, 6, 9)
                    }
                },
                finance: {
                    starting_cash_usd: baseRevenue * startingCashRatio,
                    starting_debt_usd: baseRevenue * startingDebtRatio,
                    interest_rate_annual: financeDefaults.interest_rate_annual ?? 0.05
                },
                pipeline: [],
                events: []
            };
            companies.push(company);
        });
        return companies;
    }

    async function generateHypergrowthPresetCompanies(options = {}) {
        const { randBetween, makeId } = buildRandomTools(options);
        const pickRangeLocal = (range, fallbackMin, fallbackMax) => pickRange(range, fallbackMin, fallbackMax, randBetween);
        const data = await loadPresetJson(HYPERGROWTH_DATA_PATH, options);
        const entries = Array.isArray(data?.companies) ? data.companies : [];
        if (entries.length === 0) return [];
        const defaults = data?.defaults || {};
        const results = entries.map((entry, idx) => {
            const valuation = pickRangeLocal(defaults.valuation_usd, 6_000_000, 18_000_000);
            const longRunRevenueMultiplier = pickRangeLocal(defaults.long_run_revenue_ceiling_multiplier, 20, 40);
            return {
                id: makeId(`preset_web_vc_${slugify(entry.name || `hyper_${idx}`)}`, idx),
                name: entry.name || `Hypergrowth ${idx + 1}`,
                sector: entry.sector || defaults.sector || 'Web',
                description: entry.description || defaults.description || 'Hypergrowth preset',
                founders: Array.isArray(entry.founders) ? entry.founders.map(f => ({ ...f })) : (Array.isArray(defaults.founders) ? defaults.founders.map(f => ({ ...f })) : []),
                mission: entry.mission || defaults.mission || '',
                founding_location: entry.founding_location || defaults.founding_location || '',
                valuation_usd: valuation,
                funding_round: entry.funding_round || defaults.funding_round || 'Seed',
                ipo_stage: entry.ipo_stage || defaults.ipo_stage || 'series_f',
                binary_success: entry.binary_success ?? defaults.binary_success ?? false,
                gate_stage: entry.gate_stage || defaults.gate_stage || 'series_c',
                hypergrowth_window_years: pickRangeLocal(defaults.hypergrowth_window_years, 2, 4),
                hypergrowth_total_multiplier: pickRangeLocal(defaults.hypergrowth_total_multiplier, 6, 12),
                long_run_revenue_ceiling_usd: valuation * longRunRevenueMultiplier,
                long_run_growth_rate: pickRangeLocal(defaults.long_run_growth_rate, 0.45, 0.7),
                long_run_growth_floor: pickRangeLocal(defaults.long_run_growth_floor, 0.08, 0.18),
                long_run_growth_decay: pickRangeLocal(defaults.long_run_growth_decay, 0.25, 0.5),
                post_gate_initial_multiple: pickRangeLocal(defaults.post_gate_initial_multiple, 12, 20),
                post_gate_baseline_multiple: pickRangeLocal(defaults.post_gate_baseline_multiple, 4, 7),
                post_gate_multiple_decay_years: pickRangeLocal(defaults.post_gate_multiple_decay_years, 5, 9),
                post_gate_margin: pickRangeLocal(defaults.post_gate_margin, 0.18, 0.3),
                max_failures_before_collapse: entry.max_failures_before_collapse ?? defaults.max_failures_before_collapse ?? 2,
                rounds: entry.rounds || defaults.rounds || DEFAULT_VC_ROUNDS
            };
        });
        return results;
    }

    async function generateProductRotatorCompanies(count = 1, options = {}) {
        const { randBetween, randIntBetween, makeId } = buildRandomTools(options);
        const pickRangeLocal = (range, fallbackMin, fallbackMax) => pickRange(range, fallbackMin, fallbackMax, randBetween);
        const [presetData, catalogData] = await Promise.all([
            loadPresetJson(PRODUCT_ROTATOR_DATA_PATH, options),
            loadPresetJson(PRODUCT_CATALOG_DATA_PATH, options)
        ]);
        const rosterSource = Array.isArray(presetData?.roster) ? presetData.roster.slice() : [];
        const catalog = Array.isArray(catalogData?.products) ? catalogData.products : [];
        if (rosterSource.length === 0 || catalog.length === 0) return [];
        const defaults = presetData?.defaults || {};
        const structuralBiasDefaults = defaults.structural_bias || { min: 0.6, max: 2.5, half_life_years: 18 };
        const marginDefaults = defaults.margin_curve || {};
        const multipleDefaults = defaults.multiple_curve || {};
        const financeDefaults = defaults.finance || {};
        const costDefaults = defaults.costs || {};
        const planDefaults = defaults.product_plan || {};

        const pickRoster = [];
        while (pickRoster.length < count && rosterSource.length > 0) {
            const idx = randIntBetween(0, rosterSource.length);
            pickRoster.push(rosterSource.splice(idx, 1)[0]);
        }

        return pickRoster.map((entry, idx) => {
            const name = entry.name || `Product Rotator ${idx + 1}`;
            const baseRevenue = pickRangeLocal(defaults.base_revenue_usd, 2_000_000_000, 8_000_000_000);
            const ipoRange = entry.ipo_window || defaults.ipo_window || { from: 1990, to: 1995 };
            const pipelineProductPlan = {
                catalog,
                initial: planDefaults.initial ?? 2,
                max_active: planDefaults.max_active ?? 2,
                replacement_years: planDefaults.replacement_years || [8, 12],
                gap_years: planDefaults.gap_years || [1, 3],
                allow_duplicates: planDefaults.allow_duplicates ?? false
            };

            return {
                id: makeId(`preset_product_rotator_${slugify(name)}`, idx),
                static: {
                    name,
                    sector: entry.sector || defaults.sector || 'Tech',
                    founders: (entry.founders || []).map(f => ({ ...f })),
                    mission: entry.mission || defaults.mission || '',
                    founding_location: entry.founding_location || defaults.founding_location || '',
                    ipo_window: ipoRange,
                    ipo_instantly: true
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
                        start_profit_margin: pickRangeLocal(marginDefaults.start_profit_margin, 0.08, 0.14),
                        terminal_profit_margin: pickRangeLocal(marginDefaults.terminal_profit_margin, 0.18, 0.26),
                        years_to_mature: pickRangeLocal(marginDefaults.years_to_mature, 6, 10)
                    },
                    multiple_curve: {
                        initial_ps_ratio: pickRangeLocal(multipleDefaults.initial_ps_ratio, 2.8, 4.2),
                        terminal_pe_ratio: pickRangeLocal(multipleDefaults.terminal_pe_ratio, 12, 18),
                        years_to_converge: pickRangeLocal(multipleDefaults.years_to_converge, 8, 12)
                    }
                },
                finance: {
                    starting_cash_usd: baseRevenue * (financeDefaults.starting_cash_ratio ?? 0.04),
                    starting_debt_usd: baseRevenue * (financeDefaults.starting_debt_ratio ?? 0.02),
                    interest_rate_annual: financeDefaults.interest_rate_annual ?? 0.05
                },
                costs: {
                    opex_fixed_usd: pickRangeLocal(costDefaults.opex_fixed_usd, 200_000_000, 400_000_000),
                    opex_variable_ratio: pickRangeLocal(costDefaults.opex_variable_ratio, 0.12, 0.22),
                    rd_base_ratio: pickRangeLocal(costDefaults.rd_base_ratio, 0.05, 0.08)
                },
                pipeline: [],
                events: [],
                product_plan: pipelineProductPlan
            };
        });
    }

    const hardTechRoster = [
        {
            name: 'Apex Fusion Works',
            sector: 'Energy',
            description: 'Building compact fusion cores for terrestrial grids.',
            funding_round: 'Series B',
            gate_stage: 'series_f',
            founders: [{ name: 'E. Rahman' }, { name: 'J. Cooper' }],
            mission: 'Delivering compact fusion cores that drop into existing grids.',
            founding_location: 'Austin, TX'
        },
        {
            name: 'Odin Launch Systems',
            sector: 'Aerospace',
            description: 'Reusable heavy-lift platform for deep space industry.',
            funding_round: 'Series C',
            gate_stage: 'series_f',
            founders: [{ name: 'H. Svensson' }, { name: 'P. Li' }],
            mission: 'Making heavy-lift launches routine for deep-space infrastructure.',
            founding_location: 'Long Beach, CA'
        },
        {
            name: 'NeuraForge Interfaces',
            sector: 'BioTech',
            description: 'High-bandwidth BMI hardware for clinical and defense.',
            funding_round: 'Series B',
            gate_stage: 'series_e',
            founders: [{ name: 'C. Alvarez' }, { name: 'R. Yoon' }],
            mission: 'Building reliable high-bandwidth brain-computer interfaces.',
            founding_location: 'Seattle, WA'
        }
    ];

    const hardTechPipelineTemplate = [
        {
            id: 'deeptech_flagship',
            label: 'Flagship Hard-Tech Program',
            full_revenue_usd: 30_000_000_000,
            stages: [
                { id: 'concept_validation', name: 'Concept Validation', duration_days: 720, success_prob: 0.55, value_realization: 0.1, cost_usd: 120_000_000, max_retries: 2 },
                { id: 'prototype_build', name: 'Prototype Build', duration_days: 900, depends_on: 'concept_validation', success_prob: 0.5, value_realization: 0.2, cost_usd: 180_000_000, max_retries: 2 },
                { id: 'pilot_demo', name: 'Pilot Demonstration', duration_days: 720, depends_on: 'prototype_build', success_prob: 0.6, value_realization: 0.25, cost_usd: 220_000_000, max_retries: 1 },
                { id: 'regulatory_clearance', name: 'Regulatory Clearance', duration_days: 540, depends_on: 'pilot_demo', success_prob: 0.7, value_realization: 0.25, cost_usd: 150_000_000, max_retries: 1 },
                { id: 'commercial_ramp', name: 'Commercial Ramp', duration_days: 540, depends_on: 'regulatory_clearance', success_prob: 0.85, value_realization: 0.2, cost_usd: 120_000_000, max_retries: 1, commercialises_revenue: true }
            ]
        }
    ];

    const cloneHardTechPipeline = (scale = 1, prefix = '') => {
        return hardTechPipelineTemplate.map(entry => ({
            id: prefix ? `${prefix}_${entry.id}` : entry.id,
            label: entry.label,
            full_revenue_usd: Math.round(entry.full_revenue_usd * scale),
            stages: entry.stages.map(stage => ({ ...stage }))
        }));
    };

    function generateBinaryHardTechCompanies(count = 1, options = {}) {
        const { randBetween, randIntBetween, makeId } = buildRandomTools(options);
        const roster = [...hardTechRoster];
        const companies = [];
        while (companies.length < count && roster.length > 0) {
            const idx = randIntBetween(0, roster.length);
            const entry = roster.splice(idx, 1)[0];
            const valuation = randBetween(15_000_000, 40_000_000);
            const id = makeId(`preset_hardtech_${slugify(entry.name)}`, companies.length);
            const pipelineScale = randBetween(0.8, 1.4);
            const pipelineIdPrefix = `${id}_binary`;
            const pipeline = cloneHardTechPipeline(pipelineScale, pipelineIdPrefix);
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
                interest_rate_annual: 0.06
            };
            const costs = {
                opex_fixed_usd: randBetween(30_000_000, 60_000_000),
                opex_variable_ratio: randBetween(0.18, 0.32),
                rd_base_ratio: randBetween(0.05, 0.1)
            };
            companies.push({
                id,
                name: entry.name,
                sector: entry.sector || 'Deep Tech',
                description: entry.description || 'Binary hard-tech preset (private)',
                founders: Array.isArray(entry.founders) ? entry.founders.map(f => ({ ...f })) : [],
                mission: entry.mission || '',
                founding_location: entry.founding_location || '',
                valuation_usd: valuation,
                funding_round: entry.funding_round || 'Series B',
                ipo_stage: 'pre_ipo',
                binary_success: true,
                archetype: 'hardtech',
                gate_stage: entry.gate_stage || 'series_f',
                hypergrowth_window_years: randBetween(1.5, 3.5),
                hypergrowth_total_multiplier: randBetween(10, 25),
                long_run_revenue_ceiling_usd: valuation * randBetween(35, 70),
                long_run_growth_rate: randBetween(0.25, 0.45),
                long_run_growth_floor: randBetween(0.05, 0.12),
                long_run_growth_decay: randBetween(0.08, 0.2),
                post_gate_initial_multiple: randBetween(10, 16),
                post_gate_baseline_multiple: randBetween(4, 8),
                post_gate_multiple_decay_years: randBetween(6, 11),
                post_gate_margin: randBetween(0.2, 0.35),
                max_failures_before_collapse: 1,
                base_business: baseBusiness,
                finance,
                costs,
                pipeline,
                rounds: HARDTECH_VC_ROUNDS
            });
        }
        return companies;
    }

    global.PresetGenerators = {
        generateHardTechPresetCompanies,
        generateSteadyMegacorpCompanies,
        generateHypergrowthPresetCompanies,
        generateBinaryHardTechCompanies,
        generateProductRotatorCompanies,
        DEFAULT_VC_ROUNDS,
        HARDTECH_VC_ROUNDS
    };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.PresetGenerators;
    }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
