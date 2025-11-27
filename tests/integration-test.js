const path = require('path');

// Load shared simulation modules (they attach to globals in Node).
require('../src/sim/simShared.js');
require('../src/sim/ventureStrategies.js');
require('../src/sim/publicCompanies.js');
require('../src/sim/macroEvents.js');
require('../src/sim/ventureEngineCore.js');
require('../src/sim/simEngine.js');
require('../src/presets/presets.js');

const macroEvents = require('../data/macroEvents.json');

const { SeededRandom } = global.SimShared || {};
const { Simulation } = global;
const { VentureSimulation } = global.VentureEngineModule || {};
const Presets = global.PresetGenerators || {};

if (!SeededRandom || !Simulation || !VentureSimulation || !Presets.generateHardTechPresetCompanies) {
  throw new Error('Simulation modules failed to load; ensure preset and sim files are required first.');
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function assertFinite(value, label, id) {
  if (!Number.isFinite(value)) {
    throw new Error(`[${id}] ${label} is not finite`);
  }
}

function checkPublicCompany(company) {
  const numericFields = {
    marketCap: company.marketCap,
    cash: company.cash,
    debt: company.debt,
    pendingDividend: company.pendingDividendRemaining
  };
  Object.entries(numericFields).forEach(([key, val]) => {
    assertFinite(val, `public.${key}`, company.id);
  });
  const lastPoint = company.history && company.history[company.history.length - 1];
  if (lastPoint) {
    assertFinite(lastPoint.y, 'public.history', company.id);
  }
}

function checkVentureCompany(company) {
  const numericFields = {
    valuation: company.currentValuation,
    cash: company.cash,
    debt: company.debt,
    revenue: company.revenue,
    profit: company.profit
  };
  Object.entries(numericFields).forEach(([key, val]) => {
    assertFinite(val, `venture.${key}`, company.id);
  });
}

async function main() {
  const seed = Number(process.env.SIM_SEED || 4242);
  const years = Number(process.env.SMOKE_YEARS || 12);
  const rng = new SeededRandom(seed);
  const rngFn = () => rng.random();
  const presetOpts = { rng: rngFn, baseDir: path.join(__dirname, '..') };

  const publicCompanies = [
    ...(await Presets.generateHardTechPresetCompanies(2, presetOpts)),
    ...(await Presets.generateSteadyMegacorpCompanies(2, presetOpts))
  ];
  const ventureCompanies = [
    ...(await Presets.generateHypergrowthPresetCompanies(presetOpts)),
    ...await Presets.generateBinaryHardTechCompanies(1, presetOpts)
  ];

  const sim = new Simulation(publicCompanies, { seed, rng: rngFn, macroEvents: macroEvents || [] });
  const ticks = Math.ceil((years * 365) / sim.dtDays);
  let tickDate = new Date(sim.lastTick);
  for (let i = 0; i < ticks; i++) {
    tickDate = new Date(tickDate.getTime() + sim.dtDays * MS_PER_DAY);
    sim.tick(tickDate);
  }

  let bankruptcies = 0;
  const publicIssues = [];
  sim.companies.forEach(company => {
    if (company.bankrupt) bankruptcies += 1;
    try {
      checkPublicCompany(company);
    } catch (err) {
      publicIssues.push({ id: company.id, name: company.name, issue: err.message });
    }
  });

  const ventureSim = new VentureSimulation(ventureCompanies, tickDate, { seed, rng: rngFn });
  let ventureDate = new Date(tickDate);
  const ventureEvents = [];
  // Run venture ticks for another ~2 years to shake out gate/IPO flows.
  const ventureTicks = Math.ceil((2 * 365) / sim.dtDays);
  for (let i = 0; i < ventureTicks; i++) {
    ventureDate = new Date(ventureDate.getTime() + sim.dtDays * MS_PER_DAY);
    ventureEvents.push(...(ventureSim.tick(ventureDate) || []));
  }

  const ventureIssues = [];
  ventureSim.companies.forEach(company => {
    try {
      checkVentureCompany(company);
    } catch (err) {
      ventureIssues.push({ id: company.id, name: company.name, issue: err.message });
    }
  });

  const summary = {
    seed,
    years,
    tickCount: ticks,
    publicCount: sim.companies.length,
    bankruptcies,
    ventureCount: ventureSim.companies.length,
    ventureEvents: ventureEvents.length,
    publicIssues,
    ventureIssues
  };

  if (publicIssues.length || ventureIssues.length) {
    console.error('Smoke sim failed:', JSON.stringify(summary, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error('Smoke sim crashed:', err);
  process.exit(1);
});
