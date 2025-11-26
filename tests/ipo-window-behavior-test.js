const assert = require('assert');

// Load shared simulation modules in Node.
require('../src/sim/simShared.js');
require('../src/sim/ventureStrategies.js');
require('../src/sim/publicCompanies.js');
require('../src/sim/macroEvents.js');
require('../src/sim/ventureEngineCore.js');
require('../src/sim/simEngine.js');

const { Simulation } = global;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function makeCompany(id, ipoWindow, ipoInstantly) {
  return {
    id,
    static: {
      name: id,
      sector: 'Test',
      founders: [{ name: 'Tester McTest' }],
      mission: 'Testing IPO timing.',
      founding_location: 'Test City, USA',
      ipo_window: ipoWindow,
      ipo_instantly: ipoInstantly
    },
    base_business: {
      revenue_process: {
        initial_revenue_usd: { min: 1_000_000, max: 1_000_000 }
      },
      margin_curve: {
        start_profit_margin: 0.1,
        terminal_profit_margin: 0.2,
        years_to_mature: 5
      },
      multiple_curve: {
        initial_ps_ratio: 5,
        terminal_pe_ratio: 12,
        years_to_converge: 8
      }
    },
    finance: {
      starting_cash_usd: 500_000,
      starting_debt_usd: 0,
      interest_rate_annual: 0.05
    },
    costs: {
      opex_fixed_usd: 100_000,
      opex_variable_ratio: 0.1,
      rd_base_ratio: 0.02
    },
    pipeline: [],
    events: []
  };
}

(function run() {
  const startYear = 1990;
  const companies = [
    makeCompany('pastCo', { from: 1985, to: 1985 }, false),
    makeCompany('futureCo', { from: 1995, to: 1995 }, false),
    makeCompany('instantCo', { from: 2010, to: 2010 }, true)
  ];

  const sim = new Simulation(companies, { startYear });
  const liveAtStart = sim.companies.map(c => c.id);

  assert(liveAtStart.includes('pastCo'), 'pastCo should IPO before the start year and be live immediately');
  assert(liveAtStart.includes('instantCo'), 'instantCo should respect ipo_instantly=true at the game start');
  assert(!liveAtStart.includes('futureCo'), 'futureCo should wait to IPO until its window is reached');

  let current = new Date(sim.lastTick);
  let futureIpoSeen = false;
  for (let i = 0; i < 200; i++) {
    current = new Date(current.getTime() + sim.dtDays * MS_PER_DAY);
    sim.tick(current);
    if (sim.companies.some(c => c.id === 'futureCo')) {
      futureIpoSeen = true;
      break;
    }
  }
  assert(futureIpoSeen, 'futureCo should IPO once the timeline crosses its ipo_window');

  console.log('IPO window behavior test passed.');
})();
