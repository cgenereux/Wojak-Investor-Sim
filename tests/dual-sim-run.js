// ensure two simulations with different seeds in one process stay isolated.
require('../src/sim/simShared.js');
require('../src/sim/ventureStrategies.js');
require('../src/sim/publicCompanies.js');
require('../src/sim/macroEvents.js');
require('../src/sim/ventureEngineCore.js');
require('../src/sim/simEngine.js');
require('../src/presets/presets.js');

const { SeededRandom } = global.SimShared || {};
const {
  generateHardTechPresetCompanies,
  generateSteadyMegacorpCompanies
} = global.PresetGenerators || {};

async function buildSim(seed) {
  const rng = new SeededRandom(seed);
  const rngFn = () => rng.random();
  const presetOpts = { rng: rngFn, baseDir: require('path').join(__dirname, '..') };
  const companies = [
    ...(await generateHardTechPresetCompanies(1, presetOpts)),
    ...(await generateSteadyMegacorpCompanies(1, presetOpts))
  ];
  const sim = new global.Simulation(companies, { seed, rng: rngFn, macroEvents: [] });
  return { sim, rngFn };
}

(async function main() {
  const aSeed = 111;
  const bSeed = 222;
  const a = await buildSim(aSeed);
  const b = await buildSim(bSeed);

  const tickDate = new Date('1990-02-01T00:00:00Z');
  a.sim.tick(tickDate);
  b.sim.tick(tickDate);

  const aCap = Math.round(a.sim.companies[0].marketCap);
  const bCap = Math.round(b.sim.companies[0].marketCap);
  const isolated = aCap !== bCap;

  console.log(JSON.stringify({
    aSeed,
    bSeed,
    aCap,
    bCap,
    isolated
  }, null, 2));
})().catch(err => {
  console.error('Dual-sim sanity failed:', err);
  process.exit(1);
});
