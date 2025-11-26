const fs = require('fs');
const path = require('path');

const PUBLIC_PRESETS = [
  'data/presets/hardtech.json',
  'data/presets/megacorp.json',
  'data/presets/product_rotator.json',
  'data/presets/tech.json',
  'data/presets/banking.json'
];
const PRIVATE_PRESETS = [
  'data/presets/hypergrowth.json',
  'data/presets/binary_hardtech.json'
];

function readJson(relPath) {
  const full = path.join(__dirname, '..', relPath);
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function tallyPublic(file) {
  const data = readJson(file);
  const roster = Array.isArray(data.roster) ? data.roster : [];
  return roster.reduce((acc, entry) => {
    const sector = entry.sector || data?.defaults?.sector || 'Unknown';
    acc.total += 1;
    acc.bySector[sector] = (acc.bySector[sector] || 0) + 1;
    return acc;
  }, { total: 0, bySector: {} });
}

function tallyPrivate(file) {
  const data = readJson(file);
  const companies = Array.isArray(data.companies) ? data.companies : [];
  return companies.reduce((acc, entry) => {
    const sector = entry.sector || 'Unknown';
    acc.total += 1;
    acc.bySector[sector] = (acc.bySector[sector] || 0) + 1;
    return acc;
  }, { total: 0, bySector: {} });
}

function mergeCounts(target, addition) {
  target.total += addition.total;
  for (const [sector, count] of Object.entries(addition.bySector)) {
    target.bySector[sector] = (target.bySector[sector] || 0) + count;
  }
}

function main() {
  const publicCounts = { total: 0, bySector: {} };
  const privateCounts = { total: 0, bySector: {} };

  PUBLIC_PRESETS.forEach(file => mergeCounts(publicCounts, tallyPublic(file)));
  PRIVATE_PRESETS.forEach(file => mergeCounts(privateCounts, tallyPrivate(file)));

  console.log(JSON.stringify({ public: publicCounts, private: privateCounts }, null, 2));
}

main();
