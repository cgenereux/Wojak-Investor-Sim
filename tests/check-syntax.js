const { spawnSync } = require('child_process');
const path = require('path');

const FILES = [
  'server/server.js',
  'src/sim/simEngine.js',
  'src/sim/ventureEngineCore.js',
  'src/ui/main.js',
  'tests/run-integration-test.js',
  'tests/run-simulation-test.js',
  'tests/compare-dual-simulation-test.js'
];

let failures = 0;
for (const rel of FILES) {
  const full = path.join(__dirname, '..', rel);
  const res = spawnSync(process.execPath, ['--check', full], { stdio: 'inherit' });
  if (res.status !== 0) {
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`Syntax check failed for ${failures} file(s).`);
  process.exit(1);
}

console.log(`Syntax check passed for ${FILES.length} file(s).`);
