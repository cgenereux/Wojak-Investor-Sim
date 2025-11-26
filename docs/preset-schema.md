# Preset Schema (Authoring Guide)

This repo prefers authored presets over bespoke company JSON. All new companies should be added via the preset JSONs in `data/presets/`. This document explains the expected shape and allowed fields so you can add entries confidently.

## Files
- `data/presets/hardtech.json` – Biotech / hard-tech public IPOs with pipelines.
- `data/presets/megacorp.json` – Steady megacorps.
- `data/presets/product_rotator.json` – Companies with managed product catalogs.
- `data/presets/hypergrowth.json` – Venture roster (private) that can IPO.

## Common Structure
Each preset file has:
- `defaults`: baseline values used when a roster entry omits a field.
- `roster`: array of entries. Each entry describes one authored company.
- Optional `pipelineTemplate` (hardtech/product_rotator) or `structural_bias`/`margin_curve`/`multiple_curve` defaults that are merged with roster-specific overrides.

### Required per roster entry
- `name` (string): Display name.
- `mission` (string): Brief present-participle tagline (“Building…”, “Scaling…”).
- `founders` (array of 1–3 objects `{ "name": string }`).
- `founding_location` (string): City, Country (US preferred for consistency).
- `ipo_window` (object): `{ "from": number, "to": number }` year range (inclusive).

### Optional per roster entry
- `sector` (string): Overrides the default sector in `defaults.sector`.
- `mission` (string): Overrides defaults.mission.
- `founders` / `founding_location`: Overrides defaults.
- `structural_bias` (object): `{ "min": number, "max": number, "half_life_years": number }`.
- `margin_curve` (object): `{ "start_profit_margin": number, "terminal_profit_margin": number, "years_to_mature": number }`.
- `multiple_curve` (object): `{ "initial_ps_ratio": number, "terminal_pe_ratio": number, "years_to_converge": number }`.
- `initial_revenue_usd` (object): `{ "min": number, "maxMultiplier": number }` (hardtech/megacorp/product_rotator).
- `pipeline` (array): Custom pipeline stages (hardtech/product_rotator). If omitted, the preset’s `pipelineTemplate` is cloned and scaled.
- `ipo_instantly` (bool): Force IPO at start year.

### Product / Pipeline (hardtech, product_rotator)
Each stage entry: `{ "id": string, "label": string, "duration_days": number, "success_probability": number, "commercialises_revenue": bool, "cost_usd": number, "max_retries": number }`.

### Venture presets (hypergrowth)
- Similar roster shape but focused on private rounds. Use `sector`, `mission`, `founders`, `founding_location`, and stage labels. Rounds and valuation ranges are defined in the defaults; roster overrides are rarely needed beyond identity/mission/sector/location.

## How generators apply data
- Defaults are merged with roster entries; RNG fills ranges (`min/max`, curves, IPO year within window).
- Pipelines are cloned from `pipelineTemplate` and optionally scaled by `pipeline_scale`.
- IPO year is sampled from `ipo_window` (unless `ipo_instantly`).
- Margin/multiple curves are sampled within provided ranges; structural bias is sampled within its min/max.

## Validation (lightweight)
Until a formal JSON Schema is wired, keep entries consistent:
- Required: `name`, `mission`, `founders` (1–3 with names), `founding_location`, `ipo_window.from`, `ipo_window.to`.
- Strings are non-empty; years are integers; percentages are decimals (0–1).
- Pipelines: unique stage ids per company; `duration_days` > 0; `success_probability` between 0 and 1.

## Adding a new company
1. Pick the appropriate preset file.
2. Add a roster entry with the required fields; override sector/mission/location if needed.
3. For hardtech/product_rotator, ensure `ipo_window` years fit the era you want.
4. Run `npm run lint` or your usual checks; consider adding a validation step once schema is in place.

## Future (optional)
- Add a JSON Schema + validation script to enforce the above automatically.
- Expand overrides for fine-tuned curves or pipelines per entry.

Questions? Look at existing entries in `data/presets/*.json` for examples.***
