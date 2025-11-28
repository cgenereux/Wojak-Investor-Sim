  Architecture

  - Frontend is vanilla JS/HTML/CSS with Chart.js for charts and js-confetti for flair (index.html, src/main.js plus src/ui/*).
  - Backend is Fastify + WebSocket (server/server.js); it instantiates the same sim modules as the client (src/sim/*) and pushes ticks to connected clients.
  - Game timeline runs from 1990 to 2050 with 14-day ticks; server ticks every 500ms in multiplayer and stops on idle or year 2050.
  - Data/presets live under data/ and are generated at runtime via src/presets/presets.js (hard tech, megacorp, product rotators, hypergrowth ventures, binary hard tech ventures) plus macro events (data/
    macroEvents.json).

  Player & Economy

  - Each player starts with $3,000 cash, zero debt, and a character (wojak/grug/zoomer/bloomer); state includes cash, debt, holdings, venture equity, commitments, invested cash, drip flag (server/
    server.js:createPlayer, src/main.js).
  - Net worth = cash + public equity + venture equity + pending commitments − debt; bankruptcy triggers when net worth < 0 and debt > 0 (single-player shows restart popup; multiplayer liquidates your
    positions).
  - Borrowing: up to 5× net worth cap at 7% APR; borrow/repay commands and UI in the banking modal (server/server.js, src/main.js).
  - Dividends accrue quarterly; optional DRIP reinvests payouts into more shares (server/server.js:distributeDividends, src/main.js).
  - Cosmetic states: suits unlock at millionaire/billionaire/trillionaire, “malding” Wojak on >50% drawdowns (single-player), favicon/avatar swaps (src/main.js, src/ui/wojakManager.js).

  Public Market Simulation (single-player local and server-side)

  - Companies model revenue growth, margins, valuation multiples, debt/cash, dividends, and bankruptcy (src/sim/publicCompanies.js).
  - Margin and multiple curves mature over time; structural sentiment bias and cyclical micro factors add noise; sector-specific micro stats shape volatility.
  - Product pipelines use staged R&D with costs, success/failure, and commercialisation flags; unlocked value and option value feed into valuation.
  - Product manager can spawn/retire products over time (replacement/gap windows); scheduled company events and macro environment multipliers impact revenue.
  - Dividends start after three profitable years with no debt and pay in installments; bankrupt firms drop to the bottom of lists and stop trading.

  Macro Events

  - Pandemic, rate shock, and “Bogdanov manipulation” scenarios affect revenue multipliers, valuation compression, drift, and volatility (sector-specific impacts) (data/macroEvents.json, src/sim/
    macroEvents.js).
  - Active macro events show as pills above the header (src/main.js:updateMacroEventsDisplay).

  Venture/VC Layer

  - Separate private-market sim (src/sim/ventureEngineCore.js) with stage config Seed→Pre-IPO, runway/cash-burn, and fair-value calculations.
  - Strategies: Hypergrowth (revenue-driven) vs HardTech (pipeline-driven with gate stage, binary success option); hard tech uses product stages to unlock revenue and can collapse on repeated failures (src/
    sim/ventureStrategies.js).
  - Rounds have pre-money, raise amount, dilution, success probability, and timers; players can lead (commit full raise) or invest fractions. Health scores consider growth, margins, runway, or pipeline
    progress.
  - Events: round closed (equity assigned, commitments consumed), round failed (refund), venture failed (equity wiped), IPO (promotes to public sim; converts venture equity to public units; clears
    commitments) (server/server.js:handleVentureEventsSession).
  - Venture value and pending commitments contribute to net worth and borrowing caps.

  UI & UX

  - Playable avatars: Four selectable characters (Wojak, Grug, Zoomer, Bloomer) chosen via the character overlay in the multiplayer modal; avatar selection syncs to the server so others see your character.
    Party avatars stack in the header; the current lead avatar name sits beside your Wojak art.
  - Mood/appearance states: Wojak malds on >50% drawdowns in single-player; malding auto-clears after recovery or time cap. Cosmetic suits unlock as your net worth climbs: suit Wojak (millionaire), red suit
    (billionaire), glowing suit (trillionaire). Malding is disabled in multiplayer to avoid noisy swaps.
  - Celebrations: Confetti triggers at millionaire/billionaire/trillionaire milestones; DRIP toggle and banking actions give toasts for feedback. Timeline-end and bankruptcy popups swap in the current avatar
    for flavor.
  - Charts & tooltips: Net-worth chart overlays all players in multiplayer; tooltip shows every player at the hovered date with their avatar (or color chip) and net worth. Company and VC charts have custom
    HTML tooltips (date + market cap/valuation) for readability.
  - HUD & layout: Header shows net worth, current date, macro-event pills, and multiplayer status/session ID. Market grid supports sort/filter; bankrupt firms are visually demoted. Detail panels include
    pipeline visualization, financial tables with dividend yield/P-S/P-E, buy/sell (with max buttons), and mission/founder/location badges. Portfolio lists both public and private stakes/commitments with
    stage/context labels. VC view has round timers/dilution, lead CTA, and preset buy fractions; VC and main views have back buttons to swap contexts. Multiplayer lobby shows player chips at the top and
    validates unique names; host/guest cues are reflected in the UI.

  Multiplayer Flow

  - Party modal lets you set a display name, pick a character, create a session code, copy it, or join by code; host vs guest role tracked in URLs and WS params (src/ui/multiplayer.js, src/main.js).
  - Host must send start_game; guests blocked once started. Server enforces unique names per session, max connections, and rejects late joins.
  - Server is authoritative: ticks, trades, borrowing, venture actions run server-side; clients receive tick snapshots + resync buffers (50 cached ticks) to recover.
  - Idle guards: 2-minute inactivity warning/kill, and session cleanup after clients leave (server/server.js).

  Server Commands & Tick Payloads

  - Commands: start_game (host), buy/sell, borrow/repay, liquidate_assets, set_drip, set_character, vc_lead/vc_invest, debug_set_cash, kill_session, resync, ping (server/server.js).
  - Tick broadcast includes tick seq, lastTick, companies (light snapshots), venture snapshot and events, dividend events, and serialized players (cash, debt, holdings, venture stakes/commitments, net worth,
    bankrupt flag).

  Content/Preset Generation

  - Public presets: hard tech (biotech-style pipelines), steady megacorps, product rotators (managed product catalog), each with sector defaults and IPO windows (data/presets/*.json, src/presets/presets.js).
  - Venture presets: 1990s hypergrowth web companies, binary hard-tech ventures; product catalogs in data/productCatalogs/core.json.
  - Legacy company JSONs are archived under legacy/data/legacy-companies and no longer load in the main flow (src/main.js:loadCompaniesData).

  Analytics & Debug

  - PostHog instrumentation for match start/end and decade net-worth checkpoints; frontend includes the PostHog SDK (index.html, src/main.js).
  - Debug helpers: manual macro trigger window.triggerMacroEvent(id), set cash to M/B/T buttons, and server-side debug_set_cash command.

  TODO

    1. Flush out company roster and eras of company types VERY IMPORTANT -- we want about 80 companies over 75 years
    2. Preset Helpers & Rosters: Formalize the API, migrate existing companies to preset + overrides, and document the schema so new entries are easy to author.
    3. Polish & test & improve macro events -- this needs a lot of testing and polish
    4. Need to test that the game works with 8 players
    6. Pause button + time slider on company pages
    8. Fix those couple PostHog analytics that don't work currently
    10. Monthly incomes in multiplayer (maybe $100/month) -- optional for players to enable -- maybe won't have this in v1.0
    11. Log curve option for multiplayer
    12. Make game start at 1985
  Complete:
    9. Some kind of UI that tells the player "the back end is currently warming up -- give it 20 seconds or so" if party creation doesn't work within 3 seconds -- *done*

  Venture Capital (what’s in-game)

  - Unlock: VC tab turns on at $1M net worth; grid lists private startups from the current venture roster.
  - Archetypes: Hypergrowth (revenue-driven) and Hard-Tech/Binary (pipeline-driven); archetype sticks through IPO.
  - Round flow: Seed → A → … → Pre-IPO. Each round has pre-money, raise, dilution %, success odds, and a timer. After a close, the next round opens; failed rounds refund commitments.
  - Health gates: Hypergrowth scores growth/margin/runway; hard-tech scores pipeline progress + runway. Rounds resolve on timer or pipeline readiness (hard-tech).
  - Statuses: Raising, IPO Ready (target stage reached), IPO (promoted into public sim), Failed (equity/commitments wiped).
  - IPO handling: Same object is promoted to public; player venture equity converts to public shares; commitments cleared.
  - Player actions: Lead (full raise for posted dilution) or fractional invest (full/1⁄10/1⁄100/1⁄1000 or arbitrary pct). Server clamps to allocation and cash. Commitments hit cash immediately; on close they
    become equity; failed rounds refund. Commitments and venture equity count toward net worth and borrowing caps.
  - UI notes: VC grid shows valuation/stage/stake; detail shows valuation chart, pipeline view, financial table, timer, dilution label, lead CTA, fraction buttons; portfolio shows stage labels and “in-flight”
    commitments.

   Future Company Roster Plan

  - Era slates: Curate per decade (e.g., 1990s web/bio, 2000s mobile/cloud/retail, 2020s gene therapy/space-adjacent, 2030–2050 space/BMI/nanotech); each run spawns a subset for variety while staying
    authored.
  - Preset + metadata: Each company = preset key + flavor (name, founders, mission, location, IPO window, optional overrides). No bespoke curve data in JSON; balance stays in presets.
  - Ventures first: Venture rosters (hypergrowth + hard-tech) seed each era and IPO into the public sim with their live state; late-era public-only names fill gaps (industrial/space megacorps).
  - Sector catalogs: Expand product catalogs per sector and enforce uniqueness per run so two companies don’t share the same pipeline in a playthrough.
  - Size target: Grow toward ~80 public companies across 1990–2050 plus a rotating bench of private ventures each decade; replace placeholders with curated names as the list fills out.
  - Current Roster: public 26 companies (Biotech 5, Retail 2, Consumer Staples 1, Airlines 3, Automotive 1, Real Estate 1, Defense 1, Aerospace 1, Tech 7, Industrial 1, Banking 3); private 6 companies (Web 3, Energy 1, Aerospace 1, BioTech 1).
