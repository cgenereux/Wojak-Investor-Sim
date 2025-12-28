const fs = require('fs');
const path = require('path');

const PRESETS = [
  'data/presets/classic.json',
  'data/presets/hard_tech.json',
  'data/presets/hypergrowth.json',
];

function readJson(relPath) {
  const full = path.join(__dirname, '..', relPath);
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function makeCounts() {
  return { total: 0, bySector: {} };
}

function addEntry(acc, sectorRaw) {
  const sector = sectorRaw || 'Unknown';
  acc.total += 1;
  acc.bySector[sector] = (acc.bySector[sector] || 0) + 1;
}

function mergeCounts(target, addition) {
  target.total += addition.total;
  for (const [sector, count] of Object.entries(addition.bySector)) {
    target.bySector[sector] = (target.bySector[sector] || 0) + count;
  }
}

function extractPublicRosterEntries(data) {
  const entries = [];
  if (Array.isArray(data.roster)) {
    entries.push(...data.roster);
  }
  if (Array.isArray(data.groups)) {
    data.groups.forEach(group => {
      if (!group || !Array.isArray(group.roster)) return;
      const type = (group.type || '').toLowerCase();
      // Classic presets don't have group.type, so treat missing type as public.
      if (!type || type === 'public') {
        entries.push(...group.roster);
      }
    });
  }
  return entries;
}

function extractVentureEntries(data) {
  const entries = [];
  if (Array.isArray(data.companies)) {
    entries.push(...data.companies);
  }
  if (Array.isArray(data.groups)) {
    data.groups.forEach(group => {
      if (!group || !Array.isArray(group.roster)) return;
      const type = (group.type || '').toLowerCase();
      if (type === 'private') {
        entries.push(...group.roster);
      }
    });
  }
  return entries;
}

function tallyPublicFromPreset(data) {
  const out = makeCounts();
  const defaultsSector = data?.defaults?.sector || null;
  extractPublicRosterEntries(data).forEach(entry => addEntry(out, entry?.sector || defaultsSector));
  return out;
}

function tallyVentureFromPreset(data) {
  const out = makeCounts();
  extractVentureEntries(data).forEach(entry => addEntry(out, entry?.sector));
  return out;
}

function sortSectors(bySector) {
  return Object.fromEntries(
    Object.entries(bySector).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  );
}

function main() {
  const publicCounts = makeCounts();
  const ventureCounts = makeCounts();
  const byFile = {};

  PRESETS.forEach(file => {
    const data = readJson(file);
    const pub = tallyPublicFromPreset(data);
    const vc = tallyVentureFromPreset(data);
    byFile[file] = {
      public: { ...pub, bySector: sortSectors(pub.bySector) },
      venture: { ...vc, bySector: sortSectors(vc.bySector) }
    };
    mergeCounts(publicCounts, pub);
    mergeCounts(ventureCounts, vc);
  });

  publicCounts.bySector = sortSectors(publicCounts.bySector);
  ventureCounts.bySector = sortSectors(ventureCounts.bySector);

  const asJson = process.argv.includes('--json');
  const payload = {
    totals: {
      public: publicCounts,
      venture: ventureCounts,
      overall: publicCounts.total + ventureCounts.total
    },
    byFile
  };

  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log('Preset counts');
  console.log(`- Public templates: ${publicCounts.total}`);
  console.log(`- Venture templates: ${ventureCounts.total}`);
  console.log(`- Overall templates: ${payload.totals.overall}`);
  console.log('\nPublic by sector:', publicCounts.bySector);
  console.log('\nVenture by sector:', ventureCounts.bySector);
  console.log('\nPer file breakdown (use --json for full):');
  Object.entries(byFile).forEach(([file, counts]) => {
    console.log(`- ${file}: public=${counts.public.total}, venture=${counts.venture.total}`);
  });
}

main();
