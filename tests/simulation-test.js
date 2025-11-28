const path = require('path');

// Load shared simulation modules in Node.
require('../src/sim/simShared.js');
require('../src/sim/ventureStrategies.js');
require('../src/sim/publicCompanies.js');
require('../src/sim/macroEvents.js');
require('../src/sim/ventureEngineCore.js');
require('../src/sim/simEngine.js');
require('../src/presets/presets.js');

const { SeededRandom } = global.SimShared;
const {
  generateHardTechPresetCompanies,
  generateClassicCorpsCompanies,
  generateHypergrowthPresetCompanies,
  generateBinaryHardTechCompanies
} = global.PresetGenerators || {};
const { VentureSimulation } = (global.VentureEngineModule || {});

(async function runHeadless() {
  const seed = Number(process.env.SIM_SEED || 0) || 1337;
  const rng = new SeededRandom(seed);
  const rngFn = () => rng.random();

  const presetOptions = { rng: rngFn, baseDir: path.join(__dirname, '..') };

  const publicCompanies = [
    ...(await generateClassicCorpsCompanies(presetOptions)),
    ...(await generateHardTechPresetCompanies(1, presetOptions))
  ];
  const ventureCompanies = [
    ...(await generateHypergrowthPresetCompanies(presetOptions)),
    ...await generateBinaryHardTechCompanies(1, presetOptions)
  ];

  const sim = new global.Simulation(publicCompanies, { seed, macroEvents: [] });
  let currentDate = new Date('1990-01-01T00:00:00Z');

  for (let i = 0; i < 12; i++) {
    currentDate = new Date(currentDate.getTime() + sim.dtDays * 24 * 60 * 60 * 1000);
    sim.tick(currentDate);
  }

  const ventureSummary = { companies: ventureCompanies.length, tickEvents: 0 };
  if (VentureSimulation && ventureCompanies.length > 0) {
    const vcSim = new VentureSimulation(ventureCompanies, currentDate, { rng: rngFn, seed });
    const events = vcSim.tick(currentDate) || [];
    ventureSummary.tickEvents = events.length;
  }

  const caps = sim.companies.slice(0, 3).map(c => ({
    name: c.name,
    cap: Math.round(c.marketCap)
  }));

  console.log(JSON.stringify({
    seed,
    publicCount: sim.companies.length,
    ventureCount: ventureSummary.companies,
    samplePublicCaps: caps,
    ventureTickEvents: ventureSummary.tickEvents
  }, null, 2));
})().catch(err => {
  console.error('Headless sim failed:', err);
  process.exit(1);
});
