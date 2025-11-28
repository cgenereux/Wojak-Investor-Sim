const fs = require('fs');
const path = require('path');

const PRESET_FILES = [
  { path: 'data/presets/hard_tech.json', kind: 'public' },
  { path: 'data/presets/classic.json', kind: 'public' },
  { path: 'data/presets/hypergrowth.json', kind: 'venture' }
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function validateFounder(f, ctx) {
  assert(f && typeof f.name === 'string' && f.name.trim(), `${ctx}: founder.name required`);
}

function validateIpoWindow(win, ctx) {
  assert(win && Number.isFinite(win.from) && Number.isFinite(win.to), `${ctx}: ipo_window.from/to required`);
}

function validatePipelineStage(stage, ctx) {
  assert(stage && typeof stage.id === 'string' && stage.id.trim(), `${ctx}: pipeline stage id required`);
  assert(stage.label && stage.label.trim(), `${ctx}: pipeline stage label required`);
  assert(Number.isFinite(stage.duration_days) && stage.duration_days > 0, `${ctx}: pipeline stage duration_days must be > 0`);
  if (stage.success_probability != null) {
    assert(stage.success_probability >= 0 && stage.success_probability <= 1, `${ctx}: pipeline success_probability must be 0..1`);
  }
}

function validateRosterEntry(entry, idx, file) {
  const ctx = `${file} roster[${idx}]`;
  assert(entry && typeof entry.name === 'string' && entry.name.trim(), `${ctx}: name required`);
  assert(entry.mission && entry.mission.trim(), `${ctx}: mission required`);
  assert(entry.founding_location && entry.founding_location.trim(), `${ctx}: founding_location required`);
  assert(Array.isArray(entry.founders) && entry.founders.length >= 1 && entry.founders.length <= 3, `${ctx}: founders 1-3 required`);
  entry.founders.forEach((f, i) => validateFounder(f, `${ctx}.founders[${i}]`));
  validateIpoWindow(entry.ipo_window, ctx);
  if (Array.isArray(entry.pipeline)) {
    entry.pipeline.forEach((stage, i) => validatePipelineStage(stage, `${ctx}.pipeline[${i}]`));
  }
}

function validateVentureEntry(entry, idx, file) {
  const ctx = `${file} companies[${idx}]`;
  assert(entry && typeof entry.name === 'string' && entry.name.trim(), `${ctx}: name required`);
  assert(entry.mission && entry.mission.trim(), `${ctx}: mission required`);
  assert(entry.founding_location && entry.founding_location.trim(), `${ctx}: founding_location required`);
  assert(Array.isArray(entry.founders) && entry.founders.length >= 1, `${ctx}: founders required`);
  entry.founders.forEach((f, i) => validateFounder(f, `${ctx}.founders[${i}]`));
  if (entry.pipeline) {
    assert(Array.isArray(entry.pipeline), `${ctx}: pipeline must be array if present`);
    entry.pipeline.forEach((stage, i) => validatePipelineStage(stage, `${ctx}.pipeline[${i}]`));
  }
}

function validateDefaults(defaults, file) {
  if (!defaults) return;
  if (Array.isArray(defaults.pipelineTemplate)) {
    defaults.pipelineTemplate.forEach((stage, i) => validatePipelineStage(stage, `${file} defaults.pipelineTemplate[${i}]`));
  }
}

function main() {
  let errors = 0;
  PRESET_FILES.forEach(({ path: file, kind }) => {
    const full = path.join(__dirname, '..', file);
    let data;
    try {
      data = readJson(full);
    } catch (err) {
      console.error(`Failed to read ${file}:`, err.message);
      errors++;
      return;
    }
    try {
      validateDefaults(data.defaults, file);
      const roster = Array.isArray(data.roster) ? data.roster : null;
      const companies = Array.isArray(data.companies) ? data.companies : null;
      if (kind === 'venture') {
        assert(companies, `${file}: companies must be an array`);
        companies.forEach((entry, idx) => validateVentureEntry(entry, idx, file));
      } else {
        assert(roster, `${file}: roster must be an array`);
        roster.forEach((entry, idx) => validateRosterEntry(entry, idx, file));
      }
    } catch (err) {
      console.error(err.message);
      errors++;
    }
  });
  if (errors > 0) {
    console.error(`Preset validation failed with ${errors} issue(s).`);
    process.exit(1);
  } else {
    console.log('Preset validation passed.');
  }
}

main();
