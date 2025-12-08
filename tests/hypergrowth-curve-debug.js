const path = require('path');

// Load shared simulation modules (attach to globals)
require('../src/sim/simShared.js');
require('../src/sim/ventureStrategies.js');
require('../src/sim/publicCompanies.js');
require('../src/sim/macroEvents.js');
require('../src/sim/ventureEngineCore.js');
require('../src/sim/simEngine.js');
require('../src/presets/presets.js');

const { SeededRandom } = global.SimShared || {};
const { VentureSimulation, VentureCompany } = global.VentureEngineModule || {};
const Presets = global.PresetGenerators || {};

async function main() {
  if (!SeededRandom || !VentureCompany || !Presets.generateHypergrowthPresetCompanies) {
    throw new Error('Simulation modules failed to load for hypergrowth debug.');
  }

  const seed = Number(process.env.SIM_SEED || 999);
  const years = Number(process.env.HYPERGROWTH_YEARS || 15);
  const rng = new SeededRandom(seed);
  const rngFn = () => rng.random();
  const presetOpts = { rng: rngFn, baseDir: path.join(__dirname, '..') };

  const ventures = await Presets.generateHypergrowthPresetCompanies(presetOpts);
  if (!ventures.length) {
    throw new Error('No hypergrowth ventures generated.');
  }

  const simStart = new Date('1990-01-01T00:00:00Z');
  const company = new VentureCompany(ventures[0], simStart, rngFn);
  const dtDays = 90; // roughly quarterly
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  let currentDate = new Date(simStart);

  const points = [];
  const totalTicks = Math.ceil((years * 365) / dtDays);

  for (let i = 0; i < totalTicks; i++) {
    currentDate = new Date(currentDate.getTime() + dtDays * MS_PER_DAY);
    company.advance(dtDays, currentDate);
    points.push({
      year: currentDate.getUTCFullYear(),
      tYears: company.hypergrowthElapsedYears || 0,
      finished: !!company.hypergrowthFinished,
      revenue: Math.round(company.revenue || 0),
      profit: Math.round(company.profit || 0),
      valuation: Math.round(company.currentValuation || 0)
    });
  }

  console.log(JSON.stringify({
    seed,
    years,
    company: {
      id: company.id,
      name: company.name,
      initialRevenue: company.initialRevenue,
      initialPSMultiple: company.initialPSMultiple,
      hypergrowthWindowYears: company.hypergrowthWindowYears,
      hypergrowthInitialGrowthRate: company.hypergrowthInitialGrowthRate,
      hypergrowthTerminalGrowthRate: company.hypergrowthTerminalGrowthRate,
      hypergrowthInitialMargin: company.hypergrowthInitialMargin,
      hypergrowthTerminalMargin: company.hypergrowthTerminalMargin
    },
    curve: points
  }, null, 2));
}

main().catch(err => {
  console.error('Hypergrowth curve debug failed:', err);
  process.exit(1);
});
