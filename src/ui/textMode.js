(function () {
    // Local-only text benchmark mode. Toggle locally by setting this to true.
    const ENABLE_TEXT_MODE = true;
    // When a new yearly snapshot is produced, replace the output box instead of appending forever.
    const CLEAR_OUTPUT_ON_SNAPSHOT = true;
    // Optional: when available, POST the run log to a local server to be written into `runs/`.
    const ENABLE_SERVER_LOG_EXPORT = true;
    const DEFAULT_SERVER_ORIGIN = 'http://localhost:4000';
    const DEFAULT_OPENAI_MODEL = 'gpt-5-mini';

    const isLocalhost = typeof window !== 'undefined'
        ? ['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.hostname.endsWith('.local')
        : false;

    if (!ENABLE_TEXT_MODE || !isLocalhost) return;

    const toISODate = (d) => {
        if (!(d instanceof Date) || Number.isNaN(d.getTime())) return 'Invalid Date';
        return d.toISOString().split('T')[0];
    };

	    const formatUSD = (n) => {
	        const num = Number(n) || 0;
	        const absNum = Math.abs(num);
	        const sign = num < 0 ? '-' : '';
	        const fmt = (v, suffix, digits) => `${sign}$${v.toFixed(digits)}${suffix}`;
	        if (absNum >= 1e15) return fmt(absNum / 1e15, 'Q', 2);
	        if (absNum >= 1e12) return fmt(absNum / 1e12, 'T', 2);
	        if (absNum >= 1e9) return fmt(absNum / 1e9, 'B', 2);
	        if (absNum >= 1e6) return fmt(absNum / 1e6, 'M', 2);
	        if (absNum >= 1e3) return fmt(absNum / 1e3, 'K', 1);
	        return `${sign}$${absNum.toFixed(0)}`;
	    };
	
	    const usdExactFormatter = new Intl.NumberFormat('en-US', {
	        style: 'currency',
	        currency: 'USD',
	        minimumFractionDigits: 2,
	        maximumFractionDigits: 2
	    });
	
	    const formatUSDExact = (n) => usdExactFormatter.format(Number(n) || 0);

    const formatRatio = (v) => {
        const num = Number(v);
        if (!Number.isFinite(num) || num <= 0) return 'N/A';
        return `${num.toFixed(1)}x`;
    };

    const missionShort = (mission) => {
        const text = String(mission || '').trim().replace(/\s+/g, ' ');
        if (!text) return '';
        return text.length > 90 ? `${text.slice(0, 87)}…` : text;
    };

    const safeJsonClone = (value) => {
        try { return JSON.parse(JSON.stringify(value)); } catch (err) { return null; }
    };

	    const parseAmount = (input) => {
	        const raw = String(input ?? '');
	        const cleaned = raw.replace(/[^0-9.\-]/g, '');
	        const parts = cleaned.split('.');
	        const normalized = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
	        const num = Number(normalized);
	        return Number.isFinite(num) ? num : NaN;
	    };
	
	    const toCents = (value) => {
	        const num = Number(value);
	        if (!Number.isFinite(num)) return 0;
	        return Math.round(num * 100);
	    };
	
	    const toCentsFloor = (value) => {
	        const num = Number(value);
	        if (!Number.isFinite(num)) return 0;
	        // Only used for positive budget/value caps to avoid rounding up past what the underlying sim allows.
	        if (num <= 0) return 0;
	        return Math.floor(num * 100 + 1e-6);
	    };
	
		    const centsToMoneyString = (cents) => (Math.max(0, Number(cents) || 0) / 100).toFixed(2);
		
		    const sanitizeNotebookNote = (note) => {
		        const raw = String(note ?? '').replace(/\r?\n/g, ' ').trim().replace(/\s+/g, ' ');
		        if (!raw) return '';
		        const safe = raw.startsWith('/') ? raw.replace(/^\/+/, '') : raw;
		        if (safe.length <= 180) return safe;
		        return safe.slice(0, 180);
		    };
		
		    const buildStrategyNotebookText = () => {
		        const notes = Array.isArray(state?.strategyNotebook) ? state.strategyNotebook : [];
		        const lines = ['Strategy Notebook (0-6):'];
		        for (let i = 0; i < 7; i++) {
		            const note = sanitizeNotebookNote(notes[i] ?? '');
		            lines.push(`${i}: ${note || '(empty)'}`);
		        }
		        return lines.join('\n');
		    };
		
		    const normalizeNameKey = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
	
	    const cleanupPortfolio = () => {
	        if (typeof portfolio === 'undefined' || !Array.isArray(portfolio)) return;
	        const list = portfolio;
	        const publicList = (typeof companies !== 'undefined' && Array.isArray(companies)) ? companies : [];
	
	        const merged = new Map(); // key -> { companyName, unitsOwned }
	        for (const h of list) {
	            if (!h) continue;
	            const rawName = String(h.companyName || '').trim();
	            if (!rawName) continue;
	            const key = normalizeNameKey(rawName);
	            const units = Number(h.unitsOwned) || 0;
	            if (!Number.isFinite(units) || units <= 0) continue;
	            const existing = merged.get(key);
	            if (existing) {
	                existing.unitsOwned += units;
	            } else {
	                merged.set(key, { companyName: rawName, unitsOwned: units });
	            }
	        }
	
	        const cleaned = [];
	        for (const [key, holding] of merged.entries()) {
	            const matchCompany = publicList.find(c => normalizeNameKey(c?.name) === key);
	            if (!matchCompany) {
	                // If the company is no longer in the active universe, its value is effectively 0 in netWorth calc.
	                // Drop it to avoid confusing $0.00 zombie holdings.
	                continue;
	            }
	            const units = Number(holding.unitsOwned) || 0;
	            if (!Number.isFinite(units) || units <= 1e-15) continue;
	            const mc = Number(matchCompany.marketCap) || 0;
	            const valueCents = toCentsFloor(mc * units);
	            if (valueCents <= 1) {
	                // Dust/zero-value position; drop it.
	                continue;
	            }
	            cleaned.push({ companyName: matchCompany.name, unitsOwned: units });
	        }
	
	        // Mutate in-place to preserve any references (stateStore keeps a direct portfolio reference).
	        list.splice(0, list.length, ...cleaned);
	    };

    const tokenize = (input) => {
        const s = String(input || '').trim();
        const out = [];
        let i = 0;
        while (i < s.length) {
            while (i < s.length && /\s/.test(s[i])) i++;
            if (i >= s.length) break;
            const quote = (s[i] === '"' || s[i] === "'") ? s[i] : null;
            let token = '';
            if (quote) i++;
            while (i < s.length) {
                const ch = s[i];
                if (quote) {
                    if (ch === '\\' && i + 1 < s.length) {
                        token += s[i + 1];
                        i += 2;
                        continue;
                    }
                    if (ch === quote) { i++; break; }
                    token += ch;
                    i++;
                } else {
                    if (/\s/.test(ch)) break;
                    token += ch;
                    i++;
                }
            }
            out.push(token);
            while (i < s.length && /\s/.test(s[i])) i++;
        }
        return out;
    };

    const splitCommandSequence = (input) => {
        const s = String(input || '').trim();
        if (!s) return [];
        // Allow batching multiple slash commands in one line, e.g.:
        // "/buy Apple $1000 /drip on /sell Apple $250"
        // Split on "/" that begins a new command (start of string or preceded by whitespace),
        // while respecting simple quote strings.
        const cmds = [];
        let start = null;
        let quote = null;
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (quote) {
                if (ch === '\\' && i + 1 < s.length) { i++; continue; }
                if (ch === quote) quote = null;
                continue;
            }
            if (ch === '"' || ch === "'") { quote = ch; continue; }
            if (ch === '/' && (i === 0 || /\s/.test(s[i - 1]))) {
                if (start != null) {
                    const seg = s.slice(start, i).trim();
                    if (seg) cmds.push(seg);
                }
                start = i;
            }
        }
        if (start != null) {
            const seg = s.slice(start).trim();
            if (seg) cmds.push(seg);
        }
        // If the input didn't start with a slash, treat it as a single command string.
        if (!cmds.length) return [s];
        return cmds;
    };

    const extractRationale = (text) => {
        const raw = String(text || '');
        const lines = raw.split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (/^rationale\s*:/i.test(trimmed)) {
                return trimmed.replace(/^rationale\s*:\s*/i, '').trim();
            }
        }
        return '';
    };

	    const extractSlashCommandsFromText = (text) => {
	        const raw = String(text || '');
	        const lines = raw.split(/\r?\n/);
	        const cmds = [];
	        for (const line of lines) {
	            const trimmed = String(line || '').trim();
	            if (!trimmed.startsWith('/')) continue;
	            const parts = splitCommandSequence(trimmed);
	            for (const part of parts) {
	                const p = String(part || '').trim();
	                if (p.startsWith('/')) cmds.push(p);
	            }
	        }
	        return cmds;
	    };

	    const filterAllowedAiCommands = (cmds) => {
	        const allowed = new Set(['/peek', '/strategy', '/buy', '/sell', '/buymax', '/sellmax', '/borrow', '/repay', '/drip', '/vcbuy', '/endyear']);
	        const out = [];
	        for (const c of cmds) {
	            const t = tokenize(c);
	            const head = String(t[0] || '').toLowerCase();
            if (allowed.has(head)) out.push(c);
        }
        return out;
    };

    const resolveByName = (name, list, getName) => {
        const raw = String(name || '').trim();
        if (!raw) return { ok: false, error: 'Missing company name.' };
        const n = raw.toLowerCase();
        const items = Array.isArray(list) ? list : [];
        const exact = items.filter(item => String(getName(item) || '').trim().toLowerCase() === n);
        if (exact.length >= 1) return { ok: true, item: exact[0] };
        const starts = items.filter(item => String(getName(item) || '').trim().toLowerCase().startsWith(n));
        if (starts.length >= 1) return { ok: true, item: starts[0] };
        const contains = items.filter(item => String(getName(item) || '').trim().toLowerCase().includes(n));
        if (contains.length >= 1) return { ok: true, item: contains[0] };
        return { ok: false, error: `Company not found: "${raw}".` };
    };

    const getActivePlayerId = () => {
        if (typeof serverPlayer === 'object' && serverPlayer && serverPlayer.id) return serverPlayer.id;
        if (typeof clientPlayerId !== 'undefined' && clientPlayerId) return clientPlayerId;
        return 'local_player';
    };

    const isVentureUnlocked = () => {
        const nw = (typeof netWorth !== 'undefined') ? Number(netWorth) : 0;
        const reached = (typeof isMillionaire !== 'undefined' && isMillionaire) || (Number.isFinite(nw) && nw >= 1_000_000);
        return !!reached;
    };

    const ensureVentureSim = () => {
        try {
            if (typeof ensureVentureSimulation === 'function') ensureVentureSimulation();
        } catch (err) {
            // ignore
        }
        return (typeof ventureSim !== 'undefined') ? ventureSim : null;
    };

    const getActiveMacroEvents = () => {
        try {
            if (typeof sim !== 'undefined' && sim && typeof sim.getActiveMacroEvents === 'function') {
                return sim.getActiveMacroEvents() || [];
            }
        } catch (err) {
            // ignore
        }
        return [];
    };

    const getSeed = () => {
        const seed = (typeof matchSeed !== 'undefined' && Number.isFinite(Number(matchSeed)))
            ? Number(matchSeed)
            : (typeof sim !== 'undefined' && sim && Number.isFinite(Number(sim.seed)) ? Number(sim.seed) : null);
        return seed;
    };

    const getVentureSummaries = () => {
        try {
            if (typeof getVentureCompanySummaries === 'function') return getVentureCompanySummaries() || [];
        } catch (err) {
            // ignore
        }
        const vs = ensureVentureSim();
        if (vs && typeof vs.getCompanySummaries === 'function') return vs.getCompanySummaries() || [];
        if (typeof ventureCompanies !== 'undefined') return ventureCompanies || [];
        return [];
    };

    const getVentureDetail = (companyId) => {
        try {
            if (typeof getVentureCompanyDetail === 'function') return getVentureCompanyDetail(companyId);
        } catch (err) {
            // ignore
        }
        const vs = ensureVentureSim();
        if (vs && typeof vs.getCompanyDetail === 'function') return vs.getCompanyDetail(companyId);
        return null;
    };

    const computeVenturePackageAmount = (detail, pct) => {
        if (!detail || !detail.round) return 0;
        const preMoney = Number(detail.round.preMoney) || 0;
        const raiseAmount = Number(detail.round.raiseAmount) || 0;
        const postMoney = Number(detail.round.postMoney) || (preMoney + raiseAmount);
        const equityFraction = Math.max(0, pct) / 100;
        if (!Number.isFinite(postMoney) || postMoney <= 0 || equityFraction <= 0) return 0;
        return equityFraction * postMoney;
    };

    const buildVenturePackages = (detail) => {
        if (!detail?.round || typeof detail.round.equityOffered !== 'number' || detail.round.equityOffered <= 0) return [];
        const basePct = detail.round.equityOffered * 100;
        const options = [
            { key: 'full', label: 'Full Offer', pct: basePct },
            { key: 'tenth', label: '1/10 Offer', pct: basePct / 10 },
            { key: 'hundredth', label: '1/100 Offer', pct: basePct / 100 },
            { key: 'thousandth', label: '1/1000 Offer', pct: basePct / 1000 }
        ];
        return options
            .map(opt => ({
                ...opt,
                amount: computeVenturePackageAmount(detail, opt.pct)
            }))
            .filter(opt => opt.amount > 0 && opt.pct > 0);
    };

    const buildPublicLine = (company) => {
        const mc = Number(company?.marketCap) || 0;
        const rev = Number(company?.revenue) || 0;
        const prof = Number(company?.profit) || 0;
        const ps = rev > 0 ? mc / rev : 0;
        const pe = prof > 0 ? mc / prof : 0;
        const history = Array.isArray(company?.financialHistory) ? company.financialHistory : [];
        const lastAnnual = history.length ? history[history.length - 1] : null;
        const dividend = Number(lastAnnual?.dividend) || 0;
        const divYield = mc > 0 ? (dividend / mc) * 100 : 0;
        const status = company?.bankrupt ? 'Bankrupt' : 'OK';
        return [
            String(company?.name || 'Unknown'),
            String(company?.sector || ''),
            `Val:${formatUSD(mc)}`,
            `Rev:${formatUSD(rev)}`,
            `Prof:${formatUSD(prof)}`,
            `P/S:${formatRatio(ps)}`,
            `P/E:${formatRatio(pe)}`,
            `DivY:${Number.isFinite(divYield) && divYield > 0 ? `${divYield.toFixed(2)}%` : '0.00%'}`,
            status,
            `"${missionShort(company?.mission)}"`
        ].join(' | ');
    };

    const buildVentureLine = (summary) => {
        const stage = summary?.stageLabel || summary?.stage || summary?.label || 'N/A';
        const status = summary?.status || '';
        return [
            String(summary?.name || 'Unknown'),
            String(summary?.sector || ''),
            String(stage),
            status,
            `"${missionShort(summary?.mission)}"`
        ].join(' | ');
    };

	    const getPublicHoldingsSnapshot = () => {
	        cleanupPortfolio();
	        const holdings = (typeof portfolio !== 'undefined' && Array.isArray(portfolio)) ? portfolio : [];
	        const list = [];
	        for (const h of holdings) {
	            const name = String(h?.companyName || '');
	            const pct = Number(h?.unitsOwned) || 0;
            const company = (typeof companies !== 'undefined' && Array.isArray(companies)) ? companies.find(c => c?.name === name) : null;
            const mc = Number(company?.marketCap) || 0;
            const value = mc * pct;
            const fin = Array.isArray(company?.financialHistory) ? company.financialHistory : [];
            const lastAnnual = fin.length ? fin[fin.length - 1] : null;
            list.push({
                name,
                stakePct: pct * 100,
                positionValue: value,
                sector: company?.sector || '',
                annual: lastAnnual
                    ? {
                        year: lastAnnual.year,
                        revenue: Number(lastAnnual.revenue) || 0,
                        profit: Number(lastAnnual.profit) || 0,
                        marketCap: Number(lastAnnual.marketCap) || 0,
                        ps: Number(lastAnnual.ps) || 0,
                        pe: Number(lastAnnual.pe) || 0,
                        dividend: Number(lastAnnual.dividend) || 0
                    }
                    : null,
                bankrupt: !!company?.bankrupt
            });
        }
        return list;
    };

    const getVenturePositionsSnapshot = () => {
        if (!isVentureUnlocked()) return { holdings: [], commitments: [] };
        const vs = ensureVentureSim();
        if (!vs || !Array.isArray(vs.companies)) return { holdings: [], commitments: [] };
        const playerId = getActivePlayerId();
        const holdings = [];
        const commitments = [];
        for (const vc of vs.companies) {
            if (!vc) continue;
            const pct = (vc.playerEquityMap && Number.isFinite(vc.playerEquityMap[playerId])) ? vc.playerEquityMap[playerId] : 0;
            const commit = (vc.pendingCommitments && Number.isFinite(vc.pendingCommitments[playerId])) ? vc.pendingCommitments[playerId] : 0;
            const val = Number(vc.currentValuation) || Number(vc.valuation) || 0;
            const fin = Array.isArray(vc.financialHistory) ? vc.financialHistory : [];
            const lastAnnual = fin.length ? fin[fin.length - 1] : null;
            const stage = vc.currentStage ? vc.currentStage.label : (vc.stageLabel || vc.stage || 'N/A');
            const status = (typeof vc.getStatusLabel === 'function') ? vc.getStatusLabel() : (vc.status || '');
            if (pct > 0) {
                holdings.push({
                    name: vc.name || vc.id || 'VentureCo',
                    stakePct: pct * 100,
                    positionValue: val * pct,
                    sector: vc.sector || '',
                    stageLabel: stage,
                    status,
                    annual: lastAnnual
                        ? {
                            year: lastAnnual.year,
                            revenue: Number(lastAnnual.revenue) || 0,
                            profit: Number(lastAnnual.profit) || 0,
                            valuation: Number(lastAnnual.marketCap) || Number(lastAnnual.valuation) || 0
                        }
                        : null
                });
            }
            if (commit > 0) {
                commitments.push({
                    name: vc.name || vc.id || 'VentureCo',
                    dollarsCommitted: commit,
                    sector: vc.sector || '',
                    stageLabel: stage,
                    status
                });
            }
        }
        return { holdings, commitments };
    };

    const buildPortfolioText = () => {
        const publicHoldings = getPublicHoldingsSnapshot();
        const venture = getVenturePositionsSnapshot();
        const hasAnything = publicHoldings.length || venture.holdings.length || venture.commitments.length;
        if (!hasAnything) return 'Portfolio: (empty)';
        const lines = ['Portfolio:'];
	        if (publicHoldings.length) {
	            lines.push('Public Holdings:');
	            for (const h of publicHoldings) {
	                lines.push(`- ${h.name} | Stake:${h.stakePct.toFixed(6)}% | Value:${formatUSDExact(h.positionValue)}`);
	            }
	        } else {
	            lines.push('Public Holdings: (none)');
	        }
	        if (isVentureUnlocked()) {
	            if (venture.holdings.length) {
	                lines.push('Venture Holdings:');
	                for (const h of venture.holdings) {
	                    lines.push(`- ${h.name} | Stage:${h.stageLabel} | Stake:${h.stakePct.toFixed(6)}% | Value:${formatUSDExact(h.positionValue)}`);
	                }
	            } else {
	                lines.push('Venture Holdings: (none)');
	            }
	            if (venture.commitments.length) {
	                lines.push('Venture Commitments:');
	                for (const c of venture.commitments) {
	                    lines.push(`- ${c.name} | Stage:${c.stageLabel} | Committed:${formatUSDExact(c.dollarsCommitted)}`);
	                }
	            } else {
	                lines.push('Venture Commitments: (none)');
            }
        } else {
            lines.push('Venture: (locked until $1M net worth)');
        }
        return lines.join('\n');
    };

    const buildSnapshotText = () => {
        const date = (typeof currentDate !== 'undefined') ? currentDate : new Date();
        const cashVal = (typeof cash !== 'undefined') ? cash : 0;
        const debtVal = (typeof totalBorrowed !== 'undefined') ? totalBorrowed : 0;
        const nw = (typeof netWorth !== 'undefined') ? netWorth : 0;
        const drip = (typeof dripEnabled !== 'undefined') ? dripEnabled : false;
        const activeMacroEvents = getActiveMacroEvents();
        const macroToasts = Array.isArray(state?.macroToastsSinceSnapshot) ? state.macroToastsSinceSnapshot : [];
        const seed = getSeed();

        const publicList = (typeof companies !== 'undefined' && Array.isArray(companies)) ? companies : [];
        const ventureList = isVentureUnlocked() ? getVentureSummaries() : [];

		        const header = [
		            `=== TEXT MODE SNAPSHOT ===`,
		            `Date: ${toISODate(date)}`,
		            `Seed: ${seed == null ? 'N/A' : String(seed)}`,
		            `NetWorth: ${formatUSDExact(nw)} | Cash: ${formatUSDExact(cashVal)} | Debt: ${formatUSDExact(debtVal)} | DRIP: ${drip ? 'ON' : 'OFF'}`,
		            buildStrategyNotebookText(),
		            `NetWorthHistoryPoints: ${Array.isArray(netWorthHistory) ? netWorthHistory.length : 0} (use /history to dump)`,
		            buildPortfolioText(),
	            '',
            `Macro Alerts (since last snapshot) (${macroToasts.length}):`,
            ...(macroToasts.length
                ? macroToasts.map(entry => `- ${entry.date ? `${entry.date} | ` : ''}${entry.message}`)
                : ['- (none)']),
            '',
            `Macro Events Active (${activeMacroEvents.length}):`,
            ...(activeMacroEvents.length
                ? activeMacroEvents.map(evt => {
                    const label = evt.label || evt.id || 'Macro event';
                    const desc = evt.description || '';
                    return `- ${desc ? `${label}: ${desc}` : label}`;
                })
                : ['- (none)']),
            '',
            `Public Companies (${publicList.length}):`,
            ...publicList.map(c => `- ${buildPublicLine(c)}`),
            '',
            isVentureUnlocked()
                ? `Venture Companies (${ventureList.length}):`
                : 'Venture Companies: (locked until $1M net worth)',
            ...(isVentureUnlocked() ? ventureList.map(v => `- ${buildVentureLine(v)}`) : [])
        ];
        return header.join('\n');
    };

    const buildCompactTurnSnapshot = () => {
        const date = (typeof currentDate !== 'undefined') ? currentDate : new Date();
        const seed = getSeed();
        const cashVal = (typeof cash !== 'undefined') ? Number(cash) || 0 : 0;
        const debtVal = (typeof totalBorrowed !== 'undefined') ? Number(totalBorrowed) || 0 : 0;
        const nw = (typeof netWorth !== 'undefined') ? Number(netWorth) || 0 : 0;
        const drip = (typeof dripEnabled !== 'undefined') ? !!dripEnabled : false;
        const venture = getVenturePositionsSnapshot();
        return {
            year: date instanceof Date ? date.getFullYear() : null,
            date: toISODate(date),
            seed,
            player: {
                netWorth: nw,
                cash: cashVal,
                debt: debtVal,
                dripEnabled: drip,
                publicHoldings: getPublicHoldingsSnapshot(),
                ventureHoldings: venture.holdings,
                ventureCommitments: venture.commitments
            }
        };
    };

    const buildPublicPeekText = (company) => {
        const snap = (company && typeof company.toSnapshot === 'function') ? company.toSnapshot({ historyLimit: 10, quarterLimit: 0 }) : null;
        const name = String(company?.name || 'Unknown');
        const sector = String(company?.sector || '');
        const sub = String(company?.subsector || '');
        const mission = String(company?.mission || '').trim();
        const founders = Array.isArray(snap?.founders) ? snap.founders : (Array.isArray(company?.founders) ? company.founders : []);
        const foundingLoc = String(snap?.founding_location || company?.foundingLocation || '');

        const mc = Number(company?.marketCap) || 0;
        const rev = Number(company?.revenue) || 0;
        const prof = Number(company?.profit) || 0;
        const ps = rev > 0 ? mc / rev : 0;
        const pe = prof > 0 ? mc / prof : 0;

        const history = Array.isArray(company?.financialHistory) ? company.financialHistory : [];
        const last = history.slice(Math.max(0, history.length - 5));
        const histLines = last.length
            ? [
                'Last 5y (annual): Year | Valuation | Revenue | Profit | P/S | P/E | Dividend',
                ...last.map(row => {
                    const y = row?.year ?? '';
                    const v = Number(row?.marketCap) || 0;
                    const r = Number(row?.revenue) || 0;
                    const p = Number(row?.profit) || 0;
                    const psRow = Number(row?.ps) || (r > 0 ? v / r : 0);
                    const peRow = Number(row?.pe) || (p > 0 ? v / p : 0);
                    const div = Number(row?.dividend) || 0;
                    return `- ${y} | ${formatUSD(v)} | ${formatUSD(r)} | ${formatUSD(p)} | ${formatRatio(psRow)} | ${formatRatio(peRow)} | ${formatUSD(div)}`;
                })
            ]
            : ['Last 5y (annual): (no history yet)'];

        const pipe = Array.isArray(snap?.products) ? snap.products : (Array.isArray(company?.products) ? company.products : []);
        const pipeLines = pipe.length
            ? [
                'Pipeline:',
                ...pipe.map(prod => {
                    const label = prod?.label || prod?.id || 'Product';
                    const stages = Array.isArray(prod?.stages) ? prod.stages : [];
                    const stageText = stages.map(s => {
                        const nm = s?.name || s?.id || '';
                        const done = s?.completed ? (s?.succeeded ? '✓' : '✗') : '…';
                        return `${nm}${done ? `:${done}` : ''}`;
                    }).join(' > ');
                    return `- ${label}${stageText ? ` | ${stageText}` : ''}`;
                })
            ]
            : ['Pipeline: (none)'];

        const holding = (typeof portfolio !== 'undefined' && Array.isArray(portfolio))
            ? portfolio.find(h => h?.companyName === name)
            : null;
        const units = Number(holding?.unitsOwned) || 0;
        const value = mc * units;

        const lines = [
            `=== PEEK (Public) ===`,
            `Name: ${name}`,
            `Sector: ${sector}${sub ? ` / ${sub}` : ''}`,
            foundingLoc ? `Location: ${foundingLoc}` : null,
            founders.length ? `Founders: ${founders.map(f => f?.name || f?.fullName || '').filter(Boolean).join(', ')}` : null,
            mission ? `Mission: ${mission}` : null,
            `Valuation: ${formatUSD(mc)} | Revenue: ${formatUSD(rev)} | Profit: ${formatUSD(prof)} | P/S: ${formatRatio(ps)} | P/E: ${formatRatio(pe)}`,
            `Your Holding: Stake:${(units * 100).toFixed(6)}% | Value:${formatUSD(value)}`,
            '',
            ...histLines,
            '',
            ...pipeLines
        ].filter(Boolean);

        return lines.join('\n');
    };

    const buildVenturePeekText = (detail) => {
        const name = String(detail?.name || 'Unknown');
        const sector = String(detail?.sector || '');
        const sub = String(detail?.subsector || '');
        const mission = String(detail?.mission || '').trim();
        const founders = Array.isArray(detail?.founders) ? detail.founders : [];
        const foundingLoc = String(detail?.founding_location || '');
        const stage = String(detail?.stageLabel || 'N/A');
        const status = String(detail?.status || '');
        const valuation = Number(detail?.valuation) || 0;
        const rev = Number(detail?.revenue) || 0;
        const prof = Number(detail?.profit) || 0;

        const history = Array.isArray(detail?.financialHistory) ? detail.financialHistory : [];
        const last = history.slice(Math.max(0, history.length - 5));
        const histLines = last.length
            ? [
                'Last 5y (annual): Year | Valuation | Revenue | Profit | P/S | P/E',
                ...last.map(row => {
                    const y = row?.year ?? '';
                    const v = Number(row?.marketCap) || Number(row?.valuation) || 0;
                    const r = Number(row?.revenue) || 0;
                    const p = Number(row?.profit) || 0;
                    const psRow = Number(row?.ps) || (r > 0 ? v / r : 0);
                    const peRow = Number(row?.pe) || (p > 0 ? v / p : 0);
                    return `- ${y} | ${formatUSD(v)} | ${formatUSD(r)} | ${formatUSD(p)} | ${formatRatio(psRow)} | ${formatRatio(peRow)}`;
                })
            ]
            : ['Last 5y (annual): (no history yet)'];

        const packages = buildVenturePackages(detail);
        const packageLines = packages.length
            ? [
                'Packages (use /vcbuy "<name>" full|tenth|hundredth|thousandth):',
                ...packages.map(p => `- ${p.key} | ${p.label} | ${p.pct.toFixed(2)}% | Cost:${formatUSD(p.amount)}`)
            ]
            : ['Packages: (none / not raising)'];

        const pipe = Array.isArray(detail?.products) ? detail.products : [];
        const pipeLines = pipe.length
            ? [
                'Pipeline:',
                ...pipe.map(prod => {
                    const label = prod?.label || 'Product';
                    const stages = Array.isArray(prod?.stages) ? prod.stages : [];
                    const stageText = stages.map(s => {
                        const nm = s?.name || s?.id || '';
                        const done = s?.completed ? (s?.succeeded ? '✓' : '✗') : '…';
                        return `${nm}${done ? `:${done}` : ''}`;
                    }).join(' > ');
                    return `- ${label}${stageText ? ` | ${stageText}` : ''}`;
                })
            ]
            : ['Pipeline: (none)'];

        const round = detail?.round || null;
        const roundLines = round
            ? [
                'Round:',
                `- Stage: ${round.stageLabel || ''}`
            ]
            : ['Round: (none / not raising)'];

        const lines = [
            `=== PEEK (Venture) ===`,
            `Name: ${name}`,
            `Sector: ${sector}${sub ? ` / ${sub}` : ''}`,
            `Stage: ${stage} | Status: ${status}`,
            foundingLoc ? `Location: ${foundingLoc}` : null,
            founders.length ? `Founders: ${founders.map(f => f?.name || f?.fullName || '').filter(Boolean).join(', ')}` : null,
            mission ? `Mission: ${mission}` : null,
            `Valuation: ${formatUSD(valuation)} | Revenue: ${formatUSD(rev)} | Profit: ${formatUSD(prof)}`,
            `Your Equity: ${(Number(detail?.playerEquityPercent) || 0).toFixed(3)}% | Invested: ${formatUSD(detail?.playerInvested || 0)} | Pending: ${formatUSD(detail?.pendingCommitment || 0)}`,
            '',
            ...histLines,
            '',
            ...roundLines,
            '',
            ...packageLines,
            '',
            ...pipeLines
        ].filter(Boolean);

        return lines.join('\n');
    };

    const dumpHistory = () => {
        const points = Array.isArray(netWorthHistory) ? netWorthHistory : [];
        const byYear = new Map();
        for (const pt of points) {
            const d = new Date(pt?.x);
            if (Number.isNaN(d.getTime())) continue;
            byYear.set(d.getUTCFullYear(), Number(pt?.y) || 0);
        }
        const years = Array.from(byYear.keys()).sort((a, b) => a - b);
        const lines = [
            `=== NET WORTH HISTORY (yearly) ===`,
            ...years.map(y => `${y}: ${formatUSD(byYear.get(y))}`)
        ];
        return lines.join('\n');
    };

    const dumpHistoryJson = () => {
        const points = Array.isArray(netWorthHistory) ? netWorthHistory : [];
        const byYear = new Map();
        for (const pt of points) {
            const d = new Date(pt?.x);
            if (Number.isNaN(d.getTime())) continue;
            byYear.set(d.getUTCFullYear(), Number(pt?.y) || 0);
        }
        const years = Array.from(byYear.keys()).sort((a, b) => a - b);
        const arr = years.map(year => ({ year, netWorth: byYear.get(year) }));
        return JSON.stringify(arr);
    };

	    const panel = {
	        root: null,
	        logEl: null,
	        inputEl: null,
	        statusEl: null
	    };
	
	    const getTextModeToken = () => {
	        try { return String(localStorage.getItem('wojak_textmode_token') || '').trim(); } catch (err) { return ''; }
	    };

		    const state = {
		        enabled: true,
		        initialized: false,
		        lastPromptYear: null,
		        lastSnapshot: '',
		        awaitingCommands: false,
		        macroToastsSinceSnapshot: [],
		        macroToastKeys: new Set(),
		        __textModePausing: false,
		        strategyNotebook: Array.from({ length: 7 }, () => ''),
		        runLog: {
		            meta: {
		                seed: null,
		                startedAt: null,
		                endedAt: null
            },
            turns: [],
            netWorthHistory: []
        },
        activeTurn: null
    };

			    state.ai = {
			        enabled: false,
			        busy: false,
			        provider: 'openai',
			        model: DEFAULT_OPENAI_MODEL,
			        maxCallsPerYear: 3,
			        autoEndYear: true,
			        autoplay: false,
			        temperature: 1,
			        reasoningEffort: 'low'
			    };

	    const appendOutput = (text) => {
	        const msg = String(text || '');
	        if (panel.logEl) {
	            panel.logEl.value = `${panel.logEl.value}${panel.logEl.value ? '\n\n' : ''}${msg}`;
            panel.logEl.scrollTop = panel.logEl.scrollHeight;
        }
        try { console.log(msg); } catch (err) { /* ignore */ }
    };

    const setOutput = (text) => {
        const msg = String(text || '');
        if (panel.logEl) {
            panel.logEl.value = msg;
            panel.logEl.scrollTop = 0;
        }
        try { console.log(msg); } catch (err) { /* ignore */ }
    };

    const setStatus = (text) => {
        if (panel.statusEl) panel.statusEl.textContent = String(text || '');
    };

    const copyToClipboard = async (text) => {
        const value = String(text || '');
        try {
            await navigator.clipboard.writeText(value);
            if (typeof showToast === 'function') showToast('Copied.', { tone: 'success', duration: 1500 });
        } catch (err) {
            // Fallback for older browsers / insecure contexts.
            const ta = document.createElement('textarea');
            ta.value = value;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            try { document.execCommand('copy'); } catch (err2) { /* ignore */ }
            document.body.removeChild(ta);
            if (typeof showToast === 'function') showToast('Copied.', { tone: 'success', duration: 1500 });
        }
    };

	    const downloadJson = (filename, obj) => {
	        const json = JSON.stringify(obj, null, 2);
	        const blob = new Blob([json], { type: 'application/json' });
	        const url = URL.createObjectURL(blob);
	        const a = document.createElement('a');
	        a.href = url;
	        a.download = filename;
	        document.body.appendChild(a);
	        a.click();
	        a.remove();
	        URL.revokeObjectURL(url);
	    };
	
	    const downloadText = (filename, text) => {
	        const content = String(text ?? '');
	        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
	        const url = URL.createObjectURL(blob);
	        const a = document.createElement('a');
	        a.href = url;
	        a.download = filename;
	        document.body.appendChild(a);
	        a.click();
	        a.remove();
	        URL.revokeObjectURL(url);
	    };

	    const saveRunLogToServer = async (runLog) => {
	        if (!ENABLE_SERVER_LOG_EXPORT) return { ok: false, error: 'disabled' };
	        const origin = DEFAULT_SERVER_ORIGIN;
	        try {
	            const token = getTextModeToken();
	            const res = await fetch(`${origin}/api/textmode/save`, {
	                method: 'POST',
	                headers: {
	                    'Content-Type': 'application/json',
	                    ...(token ? { 'X-TextMode-Token': token } : {})
	                },
	                body: JSON.stringify({ run: runLog })
	            });
            if (!res.ok) {
                const msg = await res.text().catch(() => '');
                return { ok: false, error: `http_${res.status}`, message: msg };
            }
            const data = await res.json().catch(() => ({}));
            return { ok: true, ...data };
        } catch (err) {
            return { ok: false, error: 'network', message: String(err?.message || err) };
        }
    };

		    const helpText = () => [
		        '=== TEXT MODE HELP ===',
		        'Commands:',
	        '- /seed',
	        '- /snapshot',
	        '- /strategy update <0-6> <note>',
	        '- /strategy clear <0-6>',
	        '- /peek <company name>',
	        '- /buy <company name> $<amount>',
	        '- /sell <company name> $<amount>',
        '- /buymax <company name>',
        '- /sellmax <company name>',
        '- /borrow $<amount>',
        '- /repay $<amount>',
        '- /drip on|off',
		        '- /vcbuy <venture name> full|tenth|hundredth|thousandth',
		        '- /ai on|off | /ai step | /ai auto on|off | /ai provider openai|google | /ai model <id> | /ai temp <0-2> | /ai effort low|medium|high',
		        '- /history',
		        '- /historyjson',
		        '- /exportlog',
		        '- /exporttxt',
		        '- /endyear',
	        '- /clear',
        '',
        'Notes:',
        '- Names are case-insensitive; quotes optional unless you have weird spacing.',
        '- Replays: add ?seed=123 to the URL before starting the match.',
	        '- You can batch commands: "/buy X $100 /drip on /sell Y $50"',
	        '- In DevTools you can also call: cmd("/peek Apple")'
	    ].join('\n');
	
		    const isErrorOutput = (text) => {
		        const msg = String(text || '').trim();
		        if (!msg) return false;
		        const head = msg.split('\n')[0].trim();
		        if (head.startsWith('ERROR:')) return true;
		        if (head.startsWith('Company not found:')) return true;
		        if (head.startsWith('Unknown command:')) return true;
		        if (head.startsWith('Usage:')) return true;
		        if (head.startsWith('Ambiguous:')) return true;
		        return false;
		    };
	
	    const executeCommandsSequential = (commands, options = {}) => {
	        const list = Array.isArray(commands) ? commands : [];
	        const stopOnError = !!options.stopOnError;
	        const outputs = [];
	        const errors = [];
	        const executed = [];
	        for (const cmdLine of list) {
	            const token = tokenize(cmdLine)[0]?.toLowerCase() || '';
	            const out = runSingleCommand(cmdLine);
	            if (out) outputs.push(out);
	            const entry = { cmd: cmdLine, output: out || '' };
	            if (isErrorOutput(out)) {
	                entry.ok = false;
	                errors.push(entry);
	                executed.push(entry);
	                if (stopOnError) break;
	            } else {
	                entry.ok = true;
	                executed.push(entry);
	            }
	            if (token === '/endyear') break;
	        }
	        return { outputs, errors, executed };
	    };
	
	    const buildTranscriptText = () => {
	        const turns = Array.isArray(state?.runLog?.turns) ? state.runLog.turns : [];
	        const lines = [];
	        lines.push('WOJAK TEXT MODE TRANSCRIPT');
	        const seed = state?.runLog?.meta?.seed ?? getSeed();
	        if (seed != null) lines.push(`Seed: ${seed}`);
	        lines.push('');
	
	        for (const turn of turns) {
	            const date = String(turn?.date || '');
	            const year = turn?.year != null ? String(turn.year) : '';
	            lines.push(`===== ${date || year || 'TURN'} =====`);
	
	            const snap = String(turn?.snapshotText || '').trim();
	            lines.push(snap || '(snapshot missing)');
	            lines.push('');
	
	            const rationale = turn?.model?.rationale ? String(turn.model.rationale) : '';
	            if (rationale) lines.push(`Rationale: ${rationale}`);
	
	            const actionCmds =
	                (Array.isArray(turn?.model?.parsedCommands) && turn.model.parsedCommands.length)
	                    ? turn.model.parsedCommands
	                    : (Array.isArray(turn?.actions) ? turn.actions.map(a => a?.cmd).filter(Boolean) : []);
	
	            if (actionCmds.length) {
	                for (const c of actionCmds) lines.push(String(c));
	            } else {
	                lines.push('(no commands recorded)');
	            }
	
	            lines.push('');
	        }
	
	        return lines.join('\n');
	    };

    const runSingleCommand = (line) => {
        const raw = String(line || '').trim();
        if (!raw) return '';
        const recordAction = (entry) => {
            if (state.activeTurn && entry && typeof entry === 'object') {
                state.activeTurn.actions.push(entry);
            }
        };
        const recordPeek = (entry) => {
            if (state.activeTurn && entry && typeof entry === 'object') {
                state.activeTurn.peeks.push(entry);
            }
        };
        const playerLite = () => ({
            netWorth: (typeof netWorth !== 'undefined') ? Number(netWorth) || 0 : 0,
            cash: (typeof cash !== 'undefined') ? Number(cash) || 0 : 0,
            debt: (typeof totalBorrowed !== 'undefined') ? Number(totalBorrowed) || 0 : 0,
            dripEnabled: (typeof dripEnabled !== 'undefined') ? !!dripEnabled : false
        });
        if (raw === '/clear') {
            if (panel.logEl) panel.logEl.value = '';
            return 'Cleared.';
        }
        if (raw === '/help') return helpText();
	        if (raw === '/seed') {
	            const seed = getSeed();
	            return seed == null
	                ? 'Seed: N/A'
	                : `Seed: ${seed} (replay via ?seed=${seed})`;
	        }
	        if (raw.startsWith('/token')) {
	            const rest = raw.slice('/token'.length).trim();
	            if (!rest) {
	                const current = getTextModeToken();
	                return current ? 'Token: (set)' : 'Token: (not set)';
	            }
	            const v = rest.replace(/^['"]|['"]$/g, '').trim();
	            if (!v) return 'Usage: /token <value>';
	            try { localStorage.setItem('wojak_textmode_token', v); } catch (err) { /* ignore */ }
	            return 'OK: token set for this origin.';
	        }
        if (raw === '/snapshot') {
            const snap = buildSnapshotText();
            state.lastSnapshot = snap;
            return snap;
        }
        if (raw === '/history') return dumpHistory();
        if (raw === '/historyjson') return dumpHistoryJson();
	        if (raw === '/ai') return 'Usage: /ai on|off | /ai step | /ai auto on|off | /ai model <id>';
	        if (raw.startsWith('/ai ')) {
	            const rest = raw.slice(4).trim();
	            const parts = tokenize(rest);
	            const sub = String(parts[0] || '').toLowerCase();
            if (sub === 'on') {
                state.ai.enabled = true;
                return `OK: AI enabled (model=${state.ai.model}).`;
            }
	            if (sub === 'off') {
	                state.ai.enabled = false;
	                state.ai.autoplay = false;
	                return 'OK: AI disabled.';
	            }
	            if (sub === 'auto' || sub === 'autoplay') {
	                const v = String(parts[1] || '').toLowerCase();
	                if (!['on', 'off'].includes(v)) return 'Usage: /ai auto on|off';
	                state.ai.autoplay = v === 'on';
	                state.ai.enabled = state.ai.enabled || state.ai.autoplay;
	                if (state.ai.autoplay && state.awaitingCommands && !state.ai.busy) {
	                    setTimeout(() => {
	                        const res = runSingleCommand('/ai step');
	                        if (res) appendOutput(res);
                    }, 30);
                }
                return `OK: AI autoplay ${state.ai.autoplay ? 'ON' : 'OFF'}.`;
            }
		            if (sub === 'model') {
		                const m = parts.slice(1).join(' ').trim();
		                if (!m) return 'ERROR: missing model id.';
		                state.ai.model = m;
		                return `OK: AI model set to ${m}.`;
		            }
		            if (sub === 'provider') {
		                const v = String(parts[1] || '').toLowerCase();
		                if (!['openai', 'google'].includes(v)) return 'Usage: /ai provider openai|google';
		                state.ai.provider = v;
		                return `OK: AI provider set to ${v}.`;
		            }
		            if (sub === 'temp' || sub === 'temperature') {
		                const v = Number(parts[1]);
		                if (!Number.isFinite(v)) return 'Usage: /ai temp <0-2>';
		                const clamped = Math.max(0, Math.min(2, v));
		                state.ai.temperature = clamped;
		                return `OK: AI temperature set to ${clamped}.`;
		            }
	            if (sub === 'effort' || sub === 'reasoning') {
	                const v = String(parts[1] || '').toLowerCase();
	                if (!['low', 'medium', 'high'].includes(v)) return 'Usage: /ai effort low|medium|high';
	                state.ai.reasoningEffort = v;
	                return `OK: AI reasoning effort set to ${v}.`;
	            }
	            if (sub === 'step') {
	                if (state.ai.busy) return 'ERROR: AI is already running.';
	                if (!state.awaitingCommands) return 'ERROR: AI step only works while paused at the yearly decision point.';
	                state.ai.busy = true;
	                setStatus(`AI thinking… (${state.ai.model})`);
	                (async () => {
	                    try {
		                        let snapshot = state.lastSnapshot || buildSnapshotText();
		                        const callLog = { provider: state.ai.provider, model: state.ai.model, calls: [] };
		                        if (state.activeTurn) {
		                            state.activeTurn.ai = callLog;
		                        }

                        const peekOutputs = [];
                        let finalCommands = [];
                        let rationale = '';

				                        const doCall = async (phase, peeks, extra = {}) => {
				                            const path = state.ai.provider === 'google'
				                                ? '/api/textmode/ai/google'
				                                : '/api/textmode/ai/openai';
				                            const token = getTextModeToken();
				                            const res = await fetch(`${DEFAULT_SERVER_ORIGIN}${path}`, {
				                                method: 'POST',
				                                headers: {
				                                    'Content-Type': 'application/json',
				                                    ...(token ? { 'X-TextMode-Token': token } : {})
				                                },
				                                body: JSON.stringify({
				                                    model: state.ai.model,
				                                    temperature: state.ai.temperature,
				                                    reasoningEffort: state.ai.reasoningEffort,
			                                    phase,
			                                    snapshot,
			                                    peeks,
			                                    errors: Array.isArray(extra.errors) ? extra.errors : [],
			                                    executed: Array.isArray(extra.executed) ? extra.executed : []
			                                })
			                            });
		                            const data = await res.json().catch(() => ({}));
		                            if (!data || !data.ok) {
		                                const msg = data?.message || data?.error || `http_${res.status}`;
		                                throw new Error(String(msg));
		                            }
		                            if (!String(data.text || '').trim()) {
		                                const dbg = data?.debug ? ` debug=${JSON.stringify(data.debug)}` : '';
		                                throw new Error(`empty_model_output${dbg}`);
		                            }
		                            return data;
		                        };

                        // Call 1 (peek or act)
                        const first = await doCall('peek', []);
                        callLog.calls.push({ phase: 'peek', responseId: first.responseId || null, usage: first.usage || null, rawOutput: first.text || '' });
	                        rationale = extractRationale(first.text) || rationale;
	                        const cmds1 = filterAllowedAiCommands(extractSlashCommandsFromText(first.text));
	                        const strategyCmds = cmds1.filter(c => tokenize(c)[0]?.toLowerCase() === '/strategy');
	                        if (strategyCmds.length) {
	                            for (const sCmd of strategyCmds) {
	                                const out = runSingleCommand(sCmd);
	                                if (out) appendOutput(out);
	                            }
	                            snapshot = buildSnapshotText();
	                            state.lastSnapshot = snapshot;
	                        }
	                        const peeks = cmds1.filter(c => tokenize(c)[0]?.toLowerCase() === '/peek');
	                        if (peeks.length) {
	                            for (const peekCmd of peeks) {
	                                const out = runSingleCommand(peekCmd);
                                if (out) peekOutputs.push(out);
                            }
                        }

                        // Call 2 (act) with peek outputs
                        const second = await doCall('act', peekOutputs);
                        callLog.calls.push({ phase: 'act', responseId: second.responseId || null, usage: second.usage || null, rawOutput: second.text || '' });
                        rationale = extractRationale(second.text) || rationale;
                        finalCommands = filterAllowedAiCommands(extractSlashCommandsFromText(second.text));

	                        // Optional Call 3 if model still asks for peeks in act phase
	                        const wantsPeekAgain = finalCommands.some(c => tokenize(c)[0]?.toLowerCase() === '/peek');
	                        if (wantsPeekAgain && state.ai.maxCallsPerYear >= 3) {
	                            const extraPeeks = finalCommands.filter(c => tokenize(c)[0]?.toLowerCase() === '/peek');
	                            for (const peekCmd of extraPeeks) {
	                                const out = runSingleCommand(peekCmd);
	                                if (out) peekOutputs.push(out);
	                            }
	                            const third = await doCall('act', peekOutputs);
	                            callLog.calls.push({ phase: 'act_retry', responseId: third.responseId || null, usage: third.usage || null, rawOutput: third.text || '' });
	                            rationale = extractRationale(third.text) || rationale;
	                            finalCommands = filterAllowedAiCommands(extractSlashCommandsFromText(third.text));
	                        }

                        // Record parsed output
                        if (state.activeTurn) {
                            state.activeTurn.model = { provider: 'openai', model: state.ai.model, rationale, parsedCommands: finalCommands.slice() };
                        }

	                        // Execute (ignore any /peek at this stage)
	                        appendOutput(`Rationale: ${rationale || '(none)'}`);
		                        const exec = finalCommands.filter(c => tokenize(c)[0]?.toLowerCase() !== '/peek');
		                        if (exec.length === 0) {
		                            if (state.ai.autoEndYear) {
		                                appendOutput('AI returned no commands; treating as no-op and advancing year.');
		                                const res = runSingleCommand('/endyear');
		                                if (res) appendOutput(res);
		                            } else {
		                                appendOutput('ERROR: AI returned no executable commands.');
		                            }
		                        } else {
		                            const { outputs, errors, executed } = executeCommandsSequential(exec, { stopOnError: true });
		                            for (const out of outputs) appendOutput(out);
	
	                            // If any command errors, do NOT advance time. Optionally reprompt once (within call budget).
	                            if (errors.length) {
	                                appendOutput('Paused: AI command failed; not advancing year.');
	                                if (callLog.calls.length < state.ai.maxCallsPerYear) {
	                                    snapshot = buildSnapshotText();
	                                    state.lastSnapshot = snapshot;
	                                    const errorLines = errors.map(e => `${e.cmd} -> ${String(e.output || '').split('\n')[0]}`);
	                                    const executedOk = executed.filter(e => e.ok).map(e => e.cmd);
	                                    const fix = await doCall('act', peekOutputs, { errors: errorLines, executed: executedOk });
	                                    callLog.calls.push({ phase: 'act_fix', responseId: fix.responseId || null, usage: fix.usage || null, rawOutput: fix.text || '' });
	                                    rationale = extractRationale(fix.text) || rationale;
	                                    const fixCommands = filterAllowedAiCommands(extractSlashCommandsFromText(fix.text)).filter(c => tokenize(c)[0]?.toLowerCase() !== '/peek');
	                                    if (fixCommands.length === 0) {
	                                        appendOutput('ERROR: AI fix returned no executable commands; not advancing year.');
	                                    } else {
	                                        const secondPass = executeCommandsSequential(fixCommands, { stopOnError: true });
	                                        for (const out of secondPass.outputs) appendOutput(out);
	                                        if (secondPass.errors.length) {
	                                            appendOutput('Paused: AI fix attempt still errored; not advancing year.');
	                                        } else {
	                                            const hasEndYear = fixCommands.some(c => tokenize(c)[0]?.toLowerCase() === '/endyear');
	                                            if (!hasEndYear && state.ai.autoEndYear) {
	                                                const res = runSingleCommand('/endyear');
	                                                if (res) appendOutput(res);
	                                            }
	                                        }
	                                    }
	                                }
	                            } else {
	                                const hasEndYear = exec.some(c => tokenize(c)[0]?.toLowerCase() === '/endyear');
	                                if (!hasEndYear && state.ai.autoEndYear) {
	                                    const res = runSingleCommand('/endyear');
	                                    if (res) appendOutput(res);
	                                }
	                            }
	                        }
	                    } catch (err) {
	                        appendOutput(`ERROR: AI step failed: ${String(err?.message || err)}`);
	                        setStatus('Paused (AI error)');
                    } finally {
                        state.ai.busy = false;
                        if (state.awaitingCommands) setStatus('Paused');
                    }
                })();
                return 'OK: AI step started…';
            }
            return 'Usage: /ai on|off | /ai step | /ai auto on|off | /ai model <id>';
        }
	        if (raw === '/exportlog') {
	            const nowIso = new Date().toISOString();
	            const seed = getSeed();
	            state.runLog.meta.seed = state.runLog.meta.seed ?? seed;
	            state.runLog.meta.endedAt = nowIso;
            state.runLog.meta.gameVersion = (typeof WOJAK_SIM_VERSION !== 'undefined') ? WOJAK_SIM_VERSION : (window.WOJAK_SIM_VERSION || null);
            state.runLog.netWorthHistory = safeJsonClone(Array.isArray(netWorthHistory) ? netWorthHistory : []);
            const filename = `wojak-textmode-seed-${seed ?? 'na'}-${nowIso.replace(/[:.]/g, '-')}.json`;
            downloadJson(filename, state.runLog);
            if (typeof showToast === 'function') {
                showToast(`Downloaded log: ${filename}`, { tone: 'success', duration: 2500 });
            }
            // Best-effort: also write to local server if enabled.
            saveRunLogToServer(state.runLog).then((result) => {
                if (!result || !result.ok) return;
                if (typeof showToast === 'function') {
                    showToast(`Saved run log to server: ${result.path || 'runs/'}`, { tone: 'success', duration: 3500 });
                }
            });
	            return `OK: exported run log (${filename}).`;
	        }
	        if (raw === '/exporttxt') {
	            const nowIso = new Date().toISOString();
	            const seed = getSeed();
	            state.runLog.meta.seed = state.runLog.meta.seed ?? seed;
	            state.runLog.meta.endedAt = nowIso;
	            const filename = `wojak-textmode-seed-${seed ?? 'na'}-${nowIso.replace(/[:.]/g, '-')}.txt`;
	            downloadText(filename, buildTranscriptText());
	            if (typeof showToast === 'function') {
	                showToast(`Downloaded transcript: ${filename}`, { tone: 'success', duration: 2500 });
	            }
	            return `OK: exported transcript (${filename}).`;
	        }

	        const tokens = tokenize(raw);
	        const cmd = (tokens[0] || '').toLowerCase();
	        const args = tokens.slice(1);
	
	        if (cmd === '/strategy') {
	            const sub = String(args[0] || '').toLowerCase();
	            if (!sub) return 'Usage: /strategy update <0-6> <note> | /strategy clear <0-6>';
	            if (sub === 'update') {
	                const idx = Number.parseInt(String(args[1] ?? ''), 10);
	                if (!Number.isInteger(idx) || idx < 0 || idx > 6) return 'ERROR: strategy index must be 0..6.';
	                const note = sanitizeNotebookNote(args.slice(2).join(' '));
	                state.strategyNotebook[idx] = note;
	                try { state.lastSnapshot = buildSnapshotText(); } catch (err) { /* ignore */ }
	                recordAction({ cmd: raw, ok: true, kind: 'strategy_update', index: idx, note });
	                return `OK: strategy[${idx}] updated.`;
	            }
	            if (sub === 'clear') {
	                const idx = Number.parseInt(String(args[1] ?? ''), 10);
	                if (!Number.isInteger(idx) || idx < 0 || idx > 6) return 'ERROR: strategy index must be 0..6.';
	                state.strategyNotebook[idx] = '';
	                try { state.lastSnapshot = buildSnapshotText(); } catch (err) { /* ignore */ }
	                recordAction({ cmd: raw, ok: true, kind: 'strategy_clear', index: idx });
	                return `OK: strategy[${idx}] cleared.`;
	            }
	            return 'Usage: /strategy update <0-6> <note> | /strategy clear <0-6>';
	        }

	        if (cmd === '/peek') {
	            const name = args.join(' ');
	            const publicList = (typeof companies !== 'undefined' && Array.isArray(companies)) ? companies : [];
	            const ventureList = isVentureUnlocked() ? getVentureSummaries() : [];
            const pubMatch = resolveByName(name, publicList, c => c?.name);
            const vcMatch = resolveByName(name, ventureList, c => c?.name);
            const pubOk = pubMatch.ok;
            const vcOk = vcMatch.ok;
            if (pubOk && vcOk) return `Ambiguous: "${name}" matches both a public and a venture company.`;
            if (pubOk) {
                const text = buildPublicPeekText(pubMatch.item);
                const structured = safeJsonClone(
                    pubMatch.item && typeof pubMatch.item.toSnapshot === 'function'
                        ? pubMatch.item.toSnapshot({ historyLimit: 10, quarterLimit: 8 })
                        : null
                );
                recordPeek({ name: pubMatch.item.name, kind: 'public', resultText: text, resultStructured: structured });
                return text;
            }
            if (vcOk) {
                const id = vcMatch.item?.id || vcMatch.item?.name;
                const detail = getVentureDetail(id);
                if (!detail) return `Venture company not visible: "${name}".`;
                const text = buildVenturePeekText(detail);
                recordPeek({ name: detail.name || vcMatch.item?.name || name, kind: 'venture', resultText: text, resultStructured: safeJsonClone(detail) });
                return text;
            }
            if (!pubOk && !isVentureUnlocked()) {
                return `Company not found: "${name}". (Venture market locked until $1M net worth.)`;
            }
            return pubMatch.error || vcMatch.error || `Company not found: "${name}".`;
        }

	        if (cmd === '/buy' || cmd === '/sell') {
	            if (args.length < 2) return `Usage: ${cmd} <company name> $<amount>`;
	            const amountToken = args[args.length - 1];
	            const name = args.slice(0, -1).join(' ');
	            const publicList = (typeof companies !== 'undefined' && Array.isArray(companies)) ? companies : [];
	            const match = resolveByName(name, publicList, c => c?.name);
	            if (!match.ok) return match.error;
	            const resolvedName = match.item.name;
	            cleanupPortfolio();
	            const amount = parseAmount(amountToken);
	            if (!Number.isFinite(amount) || amount <= 0) return `ERROR: invalid amount "${amountToken}".`;
	            const amountCents = toCents(amount);
	            const amountStr = centsToMoneyString(amountCents);
		            if (cmd === '/buy') {
		                if (typeof buy !== 'function') return 'buy() not available.';
		                const before = playerLite();
		                const cashCents = toCentsFloor(before.cash);
		                if (amountCents > cashCents) {
		                    recordAction({ cmd: raw, ok: false, error: 'insufficient_cash', before, amount });
		                    return `ERROR: insufficient cash. Need ${formatUSDExact(amountCents / 100)}, have ${formatUSDExact(cashCents / 100)}.`;
		                }
	                if ((Number(match.item.marketCap) || 0) <= 0) {
	                    recordAction({ cmd: raw, ok: false, error: 'untradeable', before });
	                    return `ERROR: ${resolvedName} is not tradeable right now.`;
	                }
	                buy(resolvedName, amountStr);
	                cleanupPortfolio();
	                const after = playerLite();
	                const spent = before.cash - after.cash;
	                const ok = toCents(spent) > 0;
	                recordAction({ cmd: raw, ok, before, after, spent });
	                return ok ? `OK: bought ${formatUSDExact(spent)} of ${resolvedName}.` : `ERROR: buy failed for ${resolvedName}.`;
	            }
		            if (typeof sell !== 'function') return 'sell() not available.';
		            const before = playerLite();
		            const holding = (typeof portfolio !== 'undefined' && Array.isArray(portfolio)) ? portfolio.find(h => h?.companyName === resolvedName) : null;
		            const units = Number(holding?.unitsOwned) || 0;
		            const value = (Number(match.item.marketCap) || 0) * units;
		            if (units <= 0 || value <= 0) {
		                recordAction({ cmd: raw, ok: false, error: 'no_position', before });
		                return `ERROR: no position to sell in ${resolvedName}.`;
		            }
		            const valueCents = toCentsFloor(value);
		            if (amountCents > valueCents) {
		                recordAction({ cmd: raw, ok: false, error: 'insufficient_position', before, positionValue: value });
		                return `ERROR: insufficient position. Max sellable is ${formatUSDExact(valueCents / 100)}.`;
		            }
	            sell(resolvedName, amountStr);
	            cleanupPortfolio();
	            const after = playerLite();
	            const received = after.cash - before.cash;
	            const ok = toCents(received) > 0;
	            recordAction({ cmd: raw, ok, before, after, received });
	            return ok ? `OK: sold ${formatUSDExact(received)} of ${resolvedName}.` : `ERROR: sell failed for ${resolvedName}.`;
	        }

	        if (cmd === '/buymax' || cmd === '/sellmax') {
	            if (args.length < 1) return `Usage: ${cmd} <company name>`;
	            const name = args.join(' ');
	            const publicList = (typeof companies !== 'undefined' && Array.isArray(companies)) ? companies : [];
	            const match = resolveByName(name, publicList, c => c?.name);
	            if (!match.ok) return match.error;
	            const resolvedName = match.item.name;
	            cleanupPortfolio();
		            if (cmd === '/buymax') {
		                if (typeof buy !== 'function') return 'buy() not available.';
		                const before = playerLite();
		                const amt = before.cash;
		                if (amt <= 0) {
		                    recordAction({ cmd: raw, ok: false, error: 'no_cash', before });
		                    return 'ERROR: no cash available to buy.';
		                }
		                buy(resolvedName, centsToMoneyString(toCentsFloor(amt)), { skipEmptyWarning: true });
		                cleanupPortfolio();
		                const after = playerLite();
		                const spent = before.cash - after.cash;
		                const ok = toCents(spent) > 0;
	                recordAction({ cmd: raw, ok, before, after, spent });
	                return ok ? `OK: buymax ${resolvedName} (${formatUSDExact(spent)}).` : `ERROR: buymax failed for ${resolvedName}.`;
	            }
	            if (typeof sell !== 'function') return 'sell() not available.';
		            const before = playerLite();
		            const holding = (typeof portfolio !== 'undefined' && Array.isArray(portfolio)) ? portfolio.find(h => normalizeNameKey(h?.companyName) === normalizeNameKey(resolvedName)) : null;
		            const units = Number(holding?.unitsOwned) || 0;
		            const value = (Number(match.item.marketCap) || 0) * units;
		            const valueCents = toCentsFloor(value);
		            if (units <= 0 || valueCents <= 0) {
		                recordAction({ cmd: raw, ok: false, error: 'no_position', before });
		                cleanupPortfolio();
		                return `ERROR: no position to sell in ${resolvedName}.`;
		            }
		            sell(resolvedName, centsToMoneyString(valueCents), { skipEmptyWarning: true });
	            cleanupPortfolio();
	            const after = playerLite();
	            const received = after.cash - before.cash;
	            const ok = toCents(received) > 0;
	            recordAction({ cmd: raw, ok, before, after, received });
	            return ok ? `OK: sellmax ${resolvedName} (${formatUSDExact(received)}).` : `ERROR: sellmax failed for ${resolvedName}.`;
	        }

	        if (cmd === '/borrow' || cmd === '/repay') {
            if (args.length !== 1) return `Usage: ${cmd} $<amount>`;
            const amountToken = args[0];
	            const amount = parseAmount(amountToken);
	            if (!Number.isFinite(amount) || amount <= 0) return `ERROR: invalid amount "${amountToken}".`;
	            const amountCents = toCents(amount);
	            const before = playerLite();
	            if (cmd === '/borrow') {
	                if (typeof borrow !== 'function') return 'borrow() not available.';
	                const maxBorrow = (typeof getMaxBorrowing === 'function') ? getMaxBorrowing() : Math.max(0, before.netWorth * 4 - before.debt);
	                const borrowAmt = Math.min(amountCents / 100, maxBorrow);
	                if (borrowAmt <= 0) {
	                    recordAction({ cmd: raw, ok: false, error: 'borrow_cap', before, maxBorrow });
	                    return `ERROR: borrowing cap reached. Max additional borrow: ${formatUSDExact(maxBorrow)}.`;
	                }
	                borrow(centsToMoneyString(toCents(borrowAmt)));
	                const after = playerLite();
	                const actual = after.debt - before.debt;
	                const ok = actual > 0.0001;
	                recordAction({ cmd: raw, ok, before, after, borrowed: actual });
	                return ok ? `OK: borrowed ${formatUSDExact(actual)}.` : 'ERROR: borrow failed.';
	            }
	            if (typeof repay !== 'function') return 'repay() not available.';
	            if (before.debt <= 0) {
	                recordAction({ cmd: raw, ok: false, error: 'no_debt', before });
	                return 'ERROR: no debt to repay.';
	            }
	            const repayAmtCents = Math.min(amountCents, toCents(before.debt), toCents(before.cash));
	            if (repayAmtCents <= 0) {
	                recordAction({ cmd: raw, ok: false, error: 'insufficient_cash', before });
	                return `ERROR: insufficient cash to repay. Cash: ${formatUSDExact(before.cash)}, Debt: ${formatUSDExact(before.debt)}.`;
	            }
	            repay(centsToMoneyString(repayAmtCents));
	            const after = playerLite();
	            const actual = before.debt - after.debt;
	            const ok = actual > 0.0001;
	            recordAction({ cmd: raw, ok, before, after, repaid: actual });
	            return ok ? `OK: repaid ${formatUSDExact(actual)}.` : 'ERROR: repay failed.';
	        }

        if (cmd === '/drip') {
            if (args.length !== 1) return 'Usage: /drip on|off';
            const next = String(args[0] || '').toLowerCase();
            if (!['on', 'off'].includes(next)) return 'Usage: /drip on|off';
            const enabled = next === 'on';
            const before = playerLite();
            if (typeof dripEnabled !== 'undefined') dripEnabled = enabled;
            try { localStorage.setItem(typeof DRIP_STORAGE_KEY !== 'undefined' ? DRIP_STORAGE_KEY : 'wojak_drip_enabled', String(enabled)); } catch (err) { /* ignore */ }
            if (typeof updateDisplay === 'function') updateDisplay();
            if (typeof renderPortfolio === 'function') renderPortfolio();
            const after = playerLite();
            recordAction({ cmd: raw, ok: true, before, after, dripEnabled: enabled });
            return `OK: DRIP ${enabled ? 'ON' : 'OFF'}.`;
        }

	        if (cmd === '/vcbuy') {
	            if (args.length < 2) return 'Usage: /vcbuy <venture name> full|tenth|hundredth|thousandth';
	            if (!isVentureUnlocked()) return 'ERROR: venture market locked until $1M net worth.';
            const pkgKey = String(args[args.length - 1] || '').toLowerCase();
            const name = args.slice(0, -1).join(' ');
            const ventureList = getVentureSummaries();
            const match = resolveByName(name, ventureList, c => c?.name);
            if (!match.ok) return match.error;
            const id = match.item?.id || match.item?.name;
	            const detail = getVentureDetail(id);
	            if (!detail) return `ERROR: venture company not visible: "${name}".`;
	            const packages = buildVenturePackages(detail);
	            const selected = packages.find(p => p.key === pkgKey);
	            if (!selected) return `ERROR: unknown package "${pkgKey}". Try: full, tenth, hundredth, thousandth.`;
		            const amount = selected.amount;
		            const cashVal = (typeof cash !== 'undefined') ? Number(cash) || 0 : 0;
		            if (toCents(cashVal) < toCents(amount)) return `ERROR: insufficient cash. Need ${formatUSDExact(amount)}, have ${formatUSDExact(cashVal)}.`;
	            const vs = ensureVentureSim();
	            if (!vs || typeof vs.invest !== 'function') return 'ERROR: venture market unavailable.';
	            const investorId = getActivePlayerId();
	            const before = playerLite();
	            const result = vs.invest(id, selected.pct / 100, investorId);
	            if (!result?.success) return `ERROR: ${result?.reason || 'investment failed.'}`;
	            if (typeof cash !== 'undefined') cash = cashVal - amount;
	            if (typeof updateNetWorth === 'function') updateNetWorth();
	            if (typeof updateDisplay === 'function') updateDisplay();
	            if (typeof renderPortfolio === 'function') renderPortfolio();
            if (typeof refreshVentureDetailView === 'function' && document.body.classList.contains('vc-detail-active')) {
                try { refreshVentureDetailView(); } catch (err) { /* ignore */ }
            }
            const after = playerLite();
            recordAction({ cmd: raw, ok: true, before, after, invested: amount, equityPct: selected.pct, venture: detail.name });
            return `OK: invested ${formatUSD(amount)} for ${selected.pct.toFixed(2)}% in ${detail.name}.`;
        }

	        if (cmd === '/endyear') {
	            state.awaitingCommands = false;
	            setStatus('Running… (will pause next year)');
	            if (state.activeTurn) {
	                state.activeTurn.playerAfterActions = buildCompactTurnSnapshot().player;
	                state.activeTurn.strategyNotebookAfter = state.strategyNotebook.slice();
	            }
	            if (typeof resumeGame === 'function') resumeGame();
	            return 'OK: advancing to next year…';
	        }

        return `Unknown command: ${cmd}. Try /help`;
    };

    const runCommand = (line) => {
        const raw = String(line || '').trim();
        if (!raw) return '';
        const parts = splitCommandSequence(raw);
        if (parts.length <= 1) return runSingleCommand(raw);
        const out = [];
        for (const part of parts) {
            const res = runSingleCommand(part);
            if (res) out.push(res);
        }
        return out.join('\n\n');
    };

    const ensurePanel = () => {
        if (!state.enabled) return;
        if (panel.root) return;
        const style = document.createElement('style');
        style.textContent = `
            #wojakTextModePanel{position:fixed;right:12px;bottom:12px;width:min(520px,calc(100vw - 24px));z-index:9999;background:rgba(255,255,255,0.92);backdrop-filter:blur(8px);border:1px solid rgba(15,23,42,0.18);border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.15);font-family:Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
            #wojakTextModePanel .tm-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(15,23,42,0.12)}
            #wojakTextModePanel .tm-title{font-size:13px;font-weight:700;color:#0f172a}
            #wojakTextModePanel .tm-status{font-size:12px;color:#334155;max-width:70%;text-align:right}
            #wojakTextModePanel .tm-body{padding:10px 12px;display:flex;flex-direction:column;gap:8px}
            #wojakTextModePanel textarea{width:100%;height:210px;resize:vertical;min-height:120px;max-height:55vh;border:1px solid rgba(15,23,42,0.18);border-radius:10px;padding:10px;background:#fff;color:#0f172a;font-size:12px;line-height:1.3}
            #wojakTextModePanel .tm-row{display:flex;gap:8px}
            #wojakTextModePanel input{flex:1;border:1px solid rgba(15,23,42,0.18);border-radius:10px;padding:10px;background:#fff;color:#0f172a;font-size:12px}
            #wojakTextModePanel button{border:1px solid rgba(15,23,42,0.18);background:#0f172a;color:#fff;border-radius:10px;padding:9px 10px;font-size:12px;font-weight:600;cursor:pointer}
            #wojakTextModePanel button.tm-secondary{background:#fff;color:#0f172a}
        `;
        document.head.appendChild(style);

        const root = document.createElement('div');
        root.id = 'wojakTextModePanel';
        root.innerHTML = `
            <div class="tm-head">
                <div class="tm-title">Text Mode</div>
                <div class="tm-status" id="wojakTextModeStatus">Idle</div>
            </div>
            <div class="tm-body">
                <textarea id="wojakTextModeLog" readonly spellcheck="false"></textarea>
                <div class="tm-row">
                    <input id="wojakTextModeInput" placeholder="/peek Apple" autocomplete="off" spellcheck="false" />
                    <button id="wojakTextModeRunBtn" type="button">Run</button>
                </div>
	                <div class="tm-row">
	                    <button id="wojakTextModeCopyBtn" class="tm-secondary" type="button">Copy snapshot</button>
	                    <button id="wojakTextModeExportBtn" class="tm-secondary" type="button">Export log</button>
	                    <button id="wojakTextModeExportTxtBtn" class="tm-secondary" type="button">Export txt</button>
	                    <button id="wojakTextModeHelpBtn" class="tm-secondary" type="button">Help</button>
	                    <button id="wojakTextModeEndYearBtn" type="button">/endyear</button>
	                </div>
            </div>
        `;
        document.body.appendChild(root);
        panel.root = root;
        panel.logEl = root.querySelector('#wojakTextModeLog');
        panel.inputEl = root.querySelector('#wojakTextModeInput');
        panel.statusEl = root.querySelector('#wojakTextModeStatus');

        const runFromInput = () => {
            const v = panel.inputEl ? panel.inputEl.value : '';
            if (panel.inputEl) panel.inputEl.value = '';
            const res = runCommand(v);
            if (res) appendOutput(res);
        };
        root.querySelector('#wojakTextModeRunBtn')?.addEventListener('click', runFromInput);
        panel.inputEl?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                runFromInput();
            }
        });
	        root.querySelector('#wojakTextModeHelpBtn')?.addEventListener('click', () => appendOutput(helpText()));
	        root.querySelector('#wojakTextModeCopyBtn')?.addEventListener('click', () => copyToClipboard(state.lastSnapshot || ''));
	        root.querySelector('#wojakTextModeExportBtn')?.addEventListener('click', () => appendOutput(runCommand('/exportlog')));
	        root.querySelector('#wojakTextModeExportTxtBtn')?.addEventListener('click', () => appendOutput(runCommand('/exporttxt')));
	        root.querySelector('#wojakTextModeEndYearBtn')?.addEventListener('click', () => appendOutput(runCommand('/endyear')));
	    };

	    const pauseAndSnapshot = (reason) => {
	        if (!state.enabled) return;
	        state.awaitingCommands = true;
	        state.__textModePausing = true;
	        if (typeof pauseGame === 'function') pauseGame();
	        state.__textModePausing = false;
	        const compact = buildCompactTurnSnapshot();
	        if (!state.runLog.meta.startedAt) {
	            state.runLog.meta.startedAt = new Date().toISOString();
	        }
        if (state.runLog.meta.seed == null && compact.seed != null) {
            state.runLog.meta.seed = compact.seed;
        }
        const macroAlerts = state.macroToastsSinceSnapshot.map(entry => entry.message).filter(Boolean);
	        const turn = {
	            year: compact.year,
	            date: compact.date,
	            seed: compact.seed,
	            reason: String(reason || 'year'),
	            playerBefore: compact.player,
	            strategyNotebookBefore: state.strategyNotebook.slice(),
	            strategyNotebookAfter: null,
	            macroAlerts,
	            peeks: [],
	            actions: [],
	            playerAfterActions: null
	        };
	        state.activeTurn = turn;
	        state.runLog.turns.push(turn);
	        const snap = buildSnapshotText();
	        turn.snapshotText = snap;
	        state.lastSnapshot = snap;
	        state.macroToastsSinceSnapshot.length = 0;
	        state.macroToastKeys.clear();
        setStatus(`Paused (${reason || 'year'})`);
        if (CLEAR_OUTPUT_ON_SNAPSHOT) setOutput(snap);
        else appendOutput(snap);
        if (state.ai.enabled && state.ai.autoplay && !state.ai.busy) {
            setTimeout(() => {
                const res = runSingleCommand('/ai step');
                if (res) appendOutput(res);
            }, 30);
        }
    };

    const maybeInit = () => {
        if (state.initialized) return;
        if (typeof isServerAuthoritative !== 'undefined' && isServerAuthoritative) return;
        state.initialized = true;
        ensurePanel();
        state.lastPromptYear = (typeof currentDate !== 'undefined' && currentDate instanceof Date)
            ? currentDate.getFullYear()
            : null;
        pauseAndSnapshot('start');
        appendOutput('Text mode enabled. Type /help for commands.');
    };

    const onAfterTick = (tickDate) => {
        if (!state.enabled) return;
        if (!(tickDate instanceof Date) || Number.isNaN(tickDate.getTime())) return;
        if (state.awaitingCommands) return;
        const year = tickDate.getFullYear();
        if (state.lastPromptYear == null) state.lastPromptYear = year;
        if (year > state.lastPromptYear) {
            state.lastPromptYear = year;
            pauseAndSnapshot(`year ${year}`);
        }
    };

    window.WojakTextMode = {
        enabled: true,
        maybeInit,
        onAfterTick,
        onMacroToast: (payload = {}) => {
            const message = String(payload.message || '').trim();
            if (!message) return;
            const id = String(payload.id || '');
            const key = `${id}|${message}`;
            if (state.macroToastKeys.has(key)) return;
            state.macroToastKeys.add(key);
            const date = payload.date ? String(payload.date) : '';
            state.macroToastsSinceSnapshot.push({ date, message });
        },
        run: (cmd) => {
            const res = runCommand(cmd);
            if (res) appendOutput(res);
            return res;
        },
        snapshot: () => {
            const snap = buildSnapshotText();
            state.lastSnapshot = snap;
            appendOutput(snap);
            return snap;
        },
        help: () => {
            const h = helpText();
            appendOutput(h);
            return h;
        }
    };

    const installPatches = () => {
        if (state.__patchesInstalled) return;
        state.__patchesInstalled = true;

        if (typeof window.showToast === 'function' && !window.showToast.__textModeWrapped) {
            const original = window.showToast;
            const wrapped = (message, options = {}) => {
                const res = original(message, options);
                try {
                    const tone = (options && options.tone) ? String(options.tone) : '';
                    if (tone.startsWith('macro') && window.WojakTextMode && typeof window.WojakTextMode.onMacroToast === 'function') {
                        window.WojakTextMode.onMacroToast({
                            id: tone || 'macro',
                            message: String(message || ''),
                            tone,
                            date: (typeof currentDate !== 'undefined' && currentDate instanceof Date) ? toISODate(currentDate) : ''
                        });
                    }
                } catch (err) { /* ignore */ }
                return res;
            };
            wrapped.__textModeWrapped = true;
            window.showToast = wrapped;
        }

	        if (typeof window.gameLoop === 'function' && !window.gameLoop.__textModeWrapped) {
	            const original = window.gameLoop;
	            const wrapped = () => {
	                const res = original();
	                try {
	                    if (window.WojakTextMode && typeof window.WojakTextMode.onAfterTick === 'function' && typeof currentDate !== 'undefined') {
	                        window.WojakTextMode.onAfterTick(currentDate);
	                    }
	                } catch (err) { /* ignore */ }
	                return res;
	            };
	            wrapped.__textModeWrapped = true;
	            window.gameLoop = wrapped;
	        }
	
	        if (typeof window.pauseGame === 'function' && !window.pauseGame.__textModeWrapped) {
	            const original = window.pauseGame;
	            const wrapped = () => {
	                try {
	                    // If the tab is hidden, the base game auto-pauses via visibilitychange.
	                    // In text-mode autoplay, ignore those pauses so the sim can keep running.
	                    if (state.enabled && state.ai.autoplay && document.hidden && !state.__textModePausing) {
	                        try { if (typeof wasAutoPaused !== 'undefined') wasAutoPaused = false; } catch (err) { /* ignore */ }
	                        return;
	                    }
	                } catch (err) { /* ignore */ }
	                return original();
	            };
	            wrapped.__textModeWrapped = true;
	            window.pauseGame = wrapped;
	        }

	        if (typeof window.init === 'function' && !window.init.__textModeWrapped) {
	            const original = window.init;
	            const wrapped = async (...args) => {
	                const res = await original(...args);
                try {
                    if (window.WojakTextMode && typeof window.WojakTextMode.maybeInit === 'function') {
                        window.WojakTextMode.maybeInit();
                    }
                } catch (err) { /* ignore */ }
                return res;
            };
            wrapped.__textModeWrapped = true;
            window.init = wrapped;
        }
    };

    window.cmd = (s) => (window.WojakTextMode ? window.WojakTextMode.run(s) : null);

    if (state.enabled && document.readyState !== 'loading') {
        ensurePanel();
    } else if (state.enabled) {
        document.addEventListener('DOMContentLoaded', ensurePanel);
    }

    installPatches();
})();
