(function (global) {
    const randBetween = (min, max) => Math.random() * (max - min) + min;
    const randIntBetween = (min, max) => Math.floor(randBetween(min, max));

    const DEFAULT_VC_ROUNDS = ['seed','series_a','series_b','series_c','series_d','series_e','series_f','pre_ipo'];
    const HARDTECH_VC_ROUNDS = ['series_b','series_c','series_d','pre_ipo'];

    const PRESET_JSON_CACHE = {};
    const RISKY_BIOTECH_DATA_PATH = 'data/presets/risky_biotech.json';

    function loadPresetJson(path) {
        if (PRESET_JSON_CACHE[path]) {
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

    function pickRange(range, fallbackMin, fallbackMax) {
        if (Array.isArray(range) && range.length >= 2) {
            return randBetween(range[0], range[1]);
        }
        if (typeof range === 'number') {
            return range;
        }
        if (typeof fallbackMin === 'number' && typeof fallbackMax === 'number') {
            return randBetween(fallbackMin, fallbackMax);
        }
        return fallbackMin ?? 0;
    }

    function clonePipelineTemplate(template = [], scale = 1, prefix = '') {
        return template.map(entry => ({
            id: prefix ? `${prefix}_${entry.id}` : entry.id,
            label: entry.label,
            full_revenue_usd: Math.round((entry.full_revenue_usd || 0) * scale),
            stages: (entry.stages || []).map(stage => ({ ...stage }))
        }));
    }

    async function generateRiskyBiotechCompanies(count = 1) {
        const data = await loadPresetJson(RISKY_BIOTECH_DATA_PATH);
        const rosterSource = Array.isArray(data?.roster) ? data.roster.slice() : [];
        if (rosterSource.length === 0) return [];
        const picked = [];
        while (picked.length < count && rosterSource.length > 0) {
            const idx = Math.floor(Math.random() * rosterSource.length);
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
            const id = `preset_bio_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}_${i}`;
            const initialRevenueMin = pickRange(initialRevenueConfig.min, 1_000_000, 5_000_000);
            const maxMultiplier = pickRange(initialRevenueConfig.maxMultiplier, 4, 8);
            const initialRevenueMax = initialRevenueMin * maxMultiplier;
            const ipoYear = entry.ipo_window ? randIntBetween(entry.ipo_window.from, entry.ipo_window.to) : randIntBetween(1990, 1993);
            const currentPipelineScale = pickRange(pipelineScaleRange, 0.75, 1.25);

            const company = {
                id,
                static: {
                    name,
                    sector: defaults.sector || 'Biotech',
                    founders,
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
                        start_profit_margin: pickRange(marginDefaults.start_profit_margin, 0.08, 0.15),
                        terminal_profit_margin: pickRange(marginDefaults.terminal_profit_margin, 0.5, 0.7),
                        years_to_mature: pickRange(marginDefaults.years_to_mature, 10, 14)
                    },
                    multiple_curve: {
                        initial_ps_ratio: pickRange(multipleDefaults.initial_ps_ratio, 28, 45),
                        terminal_pe_ratio: pickRange(multipleDefaults.terminal_pe_ratio, 16, 22),
                        years_to_converge: pickRange(multipleDefaults.years_to_converge, 8, 12)
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

    const megacorpRoster = [
        {
            name: 'SmartCart Holdings',
            founders: [{ name: 'Linda Harris', degree: 'MBA', school: 'Harvard' }],
            sector: 'Retail',
            ipo_window: { from: 1979, to: 1981 }
        },
        {
            name: 'UrbanShop Group',
            founders: [{ name: 'Marco Viteri', degree: 'MBA', school: 'Columbia' }],
            sector: 'Consumer Staples',
            ipo_window: { from: 1981, to: 1983 }
        },
        {
            name: 'GlobalMart Logistics',
            founders: [{ name: 'Sandra Osei', degree: 'MBA', school: 'Wharton' }],
            sector: 'Retail',
            ipo_window: { from: 1980, to: 1982 }
        }
    ];

    function generateSteadyMegacorpCompanies(count = 1) {
        const roster = [...megacorpRoster];
        const picked = [];
        while (picked.length < count && roster.length > 0) {
            const idx = Math.floor(Math.random() * roster.length);
            picked.push(roster.splice(idx, 1)[0]);
        }
        const companies = [];
        picked.forEach((entry, i) => {
            const name = entry.name || `MegaMart ${i + 1}`;
            const founders = (entry.founders || []).map(f => ({ ...f }));
            const id = `preset_megacorp_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}_${i}`;
            const baseRevenue = randBetween(60_000_000_000, 200_000_000_000);
            const ipoRange = entry.ipo_window || { from: 1980, to: 1985 };
            const company = {
                id,
                static: {
                    name,
                    sector: entry.sector || 'Retail',
                    founders,
                    ipo_window: ipoRange,
                    ipo_instantly: true
                },
                sentiment: {
                    structural_bias: { min: 0.5, max: 3, half_life_years: 15 }
                },
                base_business: {
                    revenue_process: {
                        initial_revenue_usd: {
                            min: baseRevenue * 0.8,
                            max: baseRevenue * 1.2
                        }
                    },
                    margin_curve: {
                        start_profit_margin: randBetween(0.025, 0.04),
                        terminal_profit_margin: randBetween(0.05, 0.08),
                        years_to_mature: randBetween(7, 10)
                    },
                    multiple_curve: {
                        initial_ps_ratio: randBetween(0.7, 1.1),
                        terminal_pe_ratio: randBetween(12, 15),
                        years_to_converge: randBetween(6, 9)
                    }
                },
                finance: {
                    starting_cash_usd: baseRevenue * 0.03,
                    starting_debt_usd: baseRevenue * 0.05,
                    interest_rate_annual: 0.05
                },
                pipeline: [],
                events: []
            };
            companies.push(company);
        });
        return companies;
    }

    function generateHypergrowthPresetCompanies() {
        const companies = [];
        const names = ['ViaWave', 'LinkPulse', 'HyperLoom'];
        names.forEach((name, idx) => {
            const valuation = randBetween(6_000_000, 18_000_000);
            companies.push({
                id: `preset_web_vc_${idx}_${Date.now()}`,
                name,
                sector: 'Web',
                description: '1990s hypergrowth web preset (private)',
                valuation_usd: valuation,
                funding_round: 'Seed',
                ipo_stage: 'series_f',
                binary_success: false,
                gate_stage: 'series_c',
                hypergrowth_window_years: randBetween(2, 4),
                hypergrowth_total_multiplier: randBetween(6, 12),
                long_run_revenue_ceiling_usd: valuation * randBetween(20, 40),
                long_run_growth_rate: randBetween(0.45, 0.7),
                long_run_growth_floor: randBetween(0.08, 0.18),
                long_run_growth_decay: randBetween(0.25, 0.5),
                post_gate_initial_multiple: randBetween(12, 20),
                post_gate_baseline_multiple: randBetween(4, 7),
                post_gate_multiple_decay_years: randBetween(5, 9),
                post_gate_margin: randBetween(0.18, 0.3),
                max_failures_before_collapse: 2,
                rounds: DEFAULT_VC_ROUNDS
            });
        });
        return companies;
    }

    const hardTechRoster = [
        {
            name: 'Apex Fusion Works',
            sector: 'Energy',
            description: 'Building compact fusion cores for terrestrial grids.',
            funding_round: 'Series B',
            gate_stage: 'series_f'
        },
        {
            name: 'Odin Launch Systems',
            sector: 'Aerospace',
            description: 'Reusable heavy-lift platform for deep space industry.',
            funding_round: 'Series C',
            gate_stage: 'series_f'
        },
        {
            name: 'NeuraForge Interfaces',
            sector: 'BioTech',
            description: 'High-bandwidth BMI hardware for clinical and defense.',
            funding_round: 'Series B',
            gate_stage: 'series_e'
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

    function generateBinaryHardTechCompanies(count = 1) {
        const roster = [...hardTechRoster];
        const companies = [];
        while (companies.length < count && roster.length > 0) {
            const idx = Math.floor(Math.random() * roster.length);
            const entry = roster.splice(idx, 1)[0];
            const valuation = randBetween(15_000_000, 40_000_000);
            const id = `preset_hardtech_${entry.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}_${companies.length}`;
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
        generateRiskyBiotechCompanies,
        generateSteadyMegacorpCompanies,
        generateHypergrowthPresetCompanies,
        generateBinaryHardTechCompanies,
        DEFAULT_VC_ROUNDS,
        HARDTECH_VC_ROUNDS
    };
})(window);
