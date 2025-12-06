const ventureCompaniesGrid = document.getElementById('ventureCompaniesGrid');
const vcDetailNameEl = document.getElementById('vcDetailCompanyName');
const vcDetailSectorEl = document.getElementById('vcDetailCompanySector');
const vcDetailFundingEl = document.getElementById('vcDetailFundingRound');
const vcDetailMissionEl = document.getElementById('vcDetailMission');
const vcDetailFoundersEl = document.getElementById('vcDetailFounders');
const vcDetailLocationEl = document.getElementById('vcDetailLocation');
const vcDetailRoundInfoEl = document.getElementById('vcDetailRoundInfo');
const vcDetailTimerEl = document.getElementById('vcDetailTimer');
const vcInvestmentOptionsEl = document.getElementById('vcInvestmentOptions');
const vcRoundDilutionEl = document.getElementById('vcRoundDilutionDisplay');
const vcPipelinePanel = document.getElementById('vcPipelinePanel');
const vcPipelineContainer = document.getElementById('vcPipelineContainer');
const vcLeadRoundBtn = document.getElementById('vcLeadRoundBtn');
const vcLeadRoundNoteEl = document.getElementById('vcLeadRoundNote');
const backToVcListBtn = document.getElementById('back-to-vc-list-btn');
const vcDetailChartCanvas = document.getElementById('vcCompanyDetailChart');
const vcDetailChartCtx = vcDetailChartCanvas ? vcDetailChartCanvas.getContext('2d') : null;
const vcFinancialHistoryContainer = document.getElementById('vcFinancialHistoryContainer');

let currentVentureCompanyId = null;
let vcInitialized = false;
let vcFormatLargeNumber = (value, precision = 2) => {
    if (value === null || value === undefined) return '$0';
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(precision)}T`;
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(precision)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(precision)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
    return `${sign}$${abs.toFixed(0)}`;
};
let vcFormatCurrency = (value) => vcFormatLargeNumber(value || 0);
let ventureCompanyDetailChart = null;
let ventureFinancialBarChart = null;
let currentVcChartRange = 80;
const lastInvestmentOptionsKey = new Map();
let venturePurchaseLock = false;
let vcTooltipHandlersAttached = new WeakSet();

function getVentureSectorClass(sector) {
    const dr = (typeof window !== 'undefined' && window.DashboardRenderers)
        ? window.DashboardRenderers
        : (typeof globalThis !== 'undefined' && globalThis.DashboardRenderers)
            ? globalThis.DashboardRenderers
            : null;
    if (dr && typeof dr.getSectorClass === 'function') {
        return dr.getSectorClass(sector);
    }
    const key = String(sector || '').trim().toLowerCase();
    if (!key) return '';
    return `sector-${key.replace(/\s+/g, '_')}`;
}

function getVentureSubsectorClass(subsector) {
    const dr = (typeof window !== 'undefined' && window.DashboardRenderers)
        ? window.DashboardRenderers
        : (typeof globalThis !== 'undefined' && globalThis.DashboardRenderers)
            ? globalThis.DashboardRenderers
            : null;
    if (dr && typeof dr.getSubsectorClass === 'function') {
        return dr.getSubsectorClass(subsector);
    }
    const key = String(subsector || '').trim().toLowerCase();
    if (!key) return '';
    return `subsector-${key.replace(/\s+/g, '_')}`;
}

function ensureVentureReady() {
    if (typeof ensureVentureSimulation === 'function') {
        ensureVentureSimulation();
    }
}

function destroyVentureChart(options = { valuation: true, financial: true }) {
    const { valuation, financial } = options || {};
    hideVCTooltip();
    if (valuation && ventureCompanyDetailChart) {
        ventureCompanyDetailChart.destroy();
        ventureCompanyDetailChart = null;
    }
    if (financial && ventureFinancialBarChart) {
        ventureFinancialBarChart.destroy();
        ventureFinancialBarChart = null;
    }
}

function renderVentureCompanies(companiesData, formatLargeNumber, formatCurrency) {
    ensureVentureReady();

    if (!ventureCompaniesGrid) return;
    ventureCompaniesGrid.innerHTML = '';
    if (Array.isArray(companiesData) && companiesData.length === 0) {
        ventureCompaniesGrid.innerHTML = '<div class="vc-empty-state">No venture capital investment opportunities right now.</div>';
        return;
    }

    const getListingTs = (company) => {
        if (Number.isFinite(company.history_third_ts)) return company.history_third_ts;
        if (Number.isFinite(company.history_start_ts)) return company.history_start_ts;
        if (company.target_listing_date) {
            const t = new Date(company.target_listing_date).getTime();
            if (Number.isFinite(t)) return t;
        }
        if (company.listing_window && (company.listing_window.from || company.listing_window.to)) {
            const raw = company.listing_window.from || company.listing_window.to;
            const t = new Date(raw).getTime();
            if (Number.isFinite(t)) return t;
        }
        return Number.POSITIVE_INFINITY;
    };

    (companiesData || [])
        .slice()
        .sort((a, b) => {
            const ta = getListingTs(a);
            const tb = getListingTs(b);
            if (ta !== tb) return ta - tb;
            return (a.name || '').localeCompare(b.name || '');
        })
        .forEach(company => {
            const isFailed = (company.status || '').toLowerCase() === 'failed';
            const companyDiv = document.createElement('div');
            companyDiv.classList.add('company-box');
            if (isFailed) {
                companyDiv.classList.add('bankrupt');
            }
            if (company.sector) {
                const sectorClass = getVentureSectorClass(company.sector);
                if (sectorClass) companyDiv.classList.add(sectorClass);
            }
            if (company.subsector) {
                const subsectorClass = getVentureSubsectorClass(company.subsector);
                if (subsectorClass) companyDiv.classList.add(subsectorClass);
            }
            companyDiv.dataset.companyId = company.id;

            const valuationRaw = typeof company.valuation !== 'undefined' ? company.valuation : company.valuation_usd;
            const valuationDisplay = isFailed ? 'Bankrupt' : vcFormatLargeNumber(valuationRaw || 0, 1);
            const stageDisplay = company.stageLabel || company.funding_round || 'N/A';
            const statusDisplay = '';
            const playerStake = company.playerEquityPercent && company.playerEquityPercent > 0
                ? `Your Stake: ${company.playerEquityPercent.toFixed(2)}%`
                : '';
            const isDoingRnd = !!company.isDoingRnd && !isFailed;
            // Show "(Failed)" instead of stage for bankrupt companies
            const companyNameDisplay = isFailed ? `${company.name} (Failed)` : company.name;
            let listingYear = null;
            if (Number.isFinite(company.history_third_ts)) {
                const d = new Date(company.history_third_ts);
                if (!isNaN(d.getTime())) listingYear = d.getFullYear();
            } else if (Number.isFinite(company.history_start_ts)) {
                const d = new Date(company.history_start_ts);
                if (!isNaN(d.getTime())) listingYear = d.getFullYear();
            } else if (company.target_listing_date) {
                const d = new Date(company.target_listing_date);
                if (!isNaN(d.getTime())) listingYear = d.getFullYear();
            } else if (company.listing_window && (company.listing_window.from || company.listing_window.to)) {
                const raw = company.listing_window.from || company.listing_window.to;
                const d = new Date(raw);
                if (!isNaN(d.getTime())) listingYear = d.getFullYear();
            }

            companyDiv.innerHTML = `
            ${listingYear ? `<div class="company-ipo-badge">${listingYear}</div>` : ''}
            <div class="company-name">${companyNameDisplay}</div>
            <div class="company-info">
                <div class="company-valuation">Valuation: ${valuationDisplay}</div>
                ${statusDisplay ? `<div class="company-stage">${statusDisplay}</div>` : ''}
                ${!isFailed ? `<div class="company-stage">Stage: ${stageDisplay}</div>` : ''}
                ${playerStake ? `<div class="company-note">${playerStake}</div>` : ''}
            </div>
            ${isDoingRnd ? '<div class="company-rnd-flag">Conducting R&amp;D…</div>' : ''}
        `;

            companyDiv.addEventListener('click', () => showVentureCompanyDetail(company.id));
            ventureCompaniesGrid.appendChild(companyDiv);
        });
}

function buildRoundInfo(detail) {
    if (!detail) {
        return {
            info: 'No active funding round.',
            chance: 'Success Chance: N/A',
            timer: 'Next round timing TBD',
            canLead: false,
            alreadyCommitted: false
        };
    }

    if (!detail.round) {
        let info = 'No active funding round.';
        let chance = 'Success Chance: N/A';
        let timer = 'Next round timing TBD';
        // Estimate next round timing from the first incomplete stage, if present.
        const firstOpenStage = Array.isArray(detail.products)
            ? detail.products.flatMap(p => Array.isArray(p.stages) ? p.stages : []).find(s => s && !s.completed)
            : null;
        if (firstOpenStage && (firstOpenStage.duration_days || firstOpenStage.durationDays)) {
            const days = Number(firstOpenStage.duration_days || firstOpenStage.durationDays) || 0;
            const months = Math.max(1, Math.ceil(days / 30));
            const label = firstOpenStage.name || firstOpenStage.id || 'Next stage';
            info = '';
            timer = `Next round in: ~${months} months`;
        }
        if (detail.status === 'IPO Ready') {
            info = 'IPO paperwork in progress. No additional rounds required.';
            chance = 'Success Chance: 100%';
            timer = 'IPO imminent';
        } else if (detail.status === 'Failed') {
            info = 'Company operations have ceased.';
            chance = 'Success Chance: 0%';
            timer = 'No further rounds.';
        }
        return {
            info,
            chance,
            timer,
            canLead: false,
            alreadyCommitted: false
        };
    }

    const { round } = detail;
    let info = '';
    let chance = '';
    const totalDays = Number.isFinite(round.durationDays) ? round.durationDays : null;
    let daysRemaining = Number.isFinite(round.daysRemaining) ? round.daysRemaining : null;
    if (daysRemaining === null && totalDays !== null) {
        daysRemaining = Math.max(0, totalDays - (detail.daysSinceRound || 0));
    }
    const monthsRemaining = daysRemaining !== null ? Math.max(0, daysRemaining / 30) : null;
    let timer;
    if (monthsRemaining !== null) {
        const displayMonths = Math.max(1, Math.ceil(monthsRemaining));
        timer = `Next round in: ${displayMonths} month${displayMonths === 1 ? '' : 's'}`;
    } else {
        timer = 'Next round timing TBD';
    }

    if (detail.status === 'IPO Ready') {
        info = 'IPO paperwork in progress. No additional rounds required.';
        timer = 'IPO imminent';
    } else if (detail.status === 'Failed') {
        info = 'Company operations have ceased.';
        timer = 'No further rounds.';
    }

    const committedAmount = round.playerCommitted ? (round.playerCommitAmount || 0) : 0;
    return {
        info,
        chance: '',
        timer,
        canLead: detail.status === 'Raising' && !round.playerCommitted,
        alreadyCommitted: round.playerCommitted,
        committedAmount
    };
}

function renderInvestmentOptions(detail, companyId = null) {
    if (!vcInvestmentOptionsEl) return;
    if (!detail || !detail.round || typeof detail.round.equityOffered !== 'number') {
        vcInvestmentOptionsEl.innerHTML = '';
        if (vcRoundDilutionEl) vcRoundDilutionEl.textContent = '';
        lastInvestmentOptionsKey.delete(companyId || detail?.id || detail?.name || '');
        return;
    }
    const roundStage = detail.round.stageLabel || detail.round.label || detail.stageLabel || '';
    const keyParts = [
        companyId || detail.id || detail.name || '',
        roundStage,
        Number(detail.round.raiseAmount) || 0,
        Number(detail.round.preMoney) || 0,
        Number(detail.round.equityOffered) || 0,
        detail.round.playerCommitted ? 'committed' : 'open',
        detail.round.playerCommitted ? (detail.round.playerCommitAmount || 0) : 0
    ];
    const key = keyParts.join('|');
    if (lastInvestmentOptionsKey.get(companyId || detail.id || detail.name || '') === key) {
        return; // Skip re-render if round data hasn't changed
    }
    lastInvestmentOptionsKey.set(companyId || detail.id || detail.name || '', key);
    vcInvestmentOptionsEl.innerHTML = '';
    if (vcRoundDilutionEl) vcRoundDilutionEl.textContent = '';

    const dilutionPct = Math.max(0, detail.round.equityOffered * 100);
    const rounds = Array.isArray(detail.rounds) ? detail.rounds : [];
    const stageIndex = Number.isFinite(detail.stageIndex) && rounds.length
        ? Math.min(Math.max(Math.trunc(detail.stageIndex), 0), rounds.length - 1)
        : rounds.findIndex(r => (r?.stageLabel || r?.label || '').toLowerCase() === (detail.round.stageLabel || '').toLowerCase());
    const nextRoundIdx = stageIndex >= 0 ? stageIndex + 1 : -1;
    const nextStageLabel = detail.nextStageLabel
        || (nextRoundIdx >= 0 && nextRoundIdx < rounds.length
            ? rounds[nextRoundIdx].stageLabel || rounds[nextRoundIdx].label || 'Next Round'
            : (detail.round.stageLabel || detail.stageLabel || 'Next Round'));
    const equity = Math.max(0, detail.round.equityOffered || 0);
    const raiseAmount = Number(detail.round.raiseAmount) || 0;
    const preMoney = Number(detail.round.preMoney) || 0;
    const postMoney = preMoney + raiseAmount;
    if (equity <= 0) return;
    const base = equity * 100;
    const options = [
        { label: 'Full Offer', value: base },
        { label: '1/10 Offer', value: base / 10 },
        { label: '1/100 Offer', value: base / 100 },
        { label: '1/1000 Offer', value: base / 1000 }
    ];
    const formatPct = (v) => `${v.toFixed(2)}%`;
    const formatAmount = (pct) => {
        const equityFraction = pct / 100;
        const amount = postMoney > 0 ? equityFraction * postMoney : raiseAmount * equityFraction / equity;
        return vcFormatCurrency(Math.max(0, amount));
    };
    const resolvedNextLabel = nextStageLabel || detail.round.stageLabel || detail.stageLabel || 'Next Round';
    const html = options.map(opt => {
        const pct = Math.max(0, opt.value);
        const amountDisplay = formatAmount(pct);
        return `<div class="vc-option-card">
            <div class="vc-option-top">
                <div class="vc-option-label">${opt.label}</div>
                <div class="vc-option-value">${formatPct(pct)}</div>
            </div>
            <div class="vc-option-amount">${amountDisplay}</div>
            <div class="vc-option-actions">
                <button class="buy-btn vc-option-buy" data-pct="${pct}">Purchase</button>
            </div>
        </div>`;
    }).join('');

    if (vcRoundDilutionEl) {
        vcRoundDilutionEl.textContent = `Dilution: ${dilutionPct.toFixed(2)}%`;
    }
    const titleEl = vcInvestmentOptionsEl?.closest('.investment-panel')?.querySelector('.investment-title');
    if (titleEl) {
        const normalizedNext = (resolvedNextLabel || '').toLowerCase();
        if (normalizedNext.includes('ipo')) {
            titleEl.textContent = 'IPO Investment Options';
        } else {
            const roundLabel = resolvedNextLabel || 'Next';
            titleEl.textContent = `${roundLabel} Round Investment Options`;
        }
    }
    vcInvestmentOptionsEl.innerHTML = html;
}

function getVCTooltipHandler(context) {
    // Tooltip Element
    let tooltipEl = document.getElementById('chartjs-tooltip-vc');

    // Create element on first render
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'chartjs-tooltip-vc';
        tooltipEl.style.opacity = 1;
        tooltipEl.style.pointerEvents = 'none';
        tooltipEl.style.position = 'absolute';
        tooltipEl.style.transform = 'translate(-50%, 0)';
        tooltipEl.style.transition = 'all .1s ease';
        tooltipEl.style.backgroundColor = '#ffffff';
        tooltipEl.style.borderRadius = '6px';
        tooltipEl.style.color = '#1e293b';
        tooltipEl.style.padding = '8px';
        tooltipEl.style.fontFamily = 'Inter, sans-serif';
        tooltipEl.style.fontSize = '14px';
        tooltipEl.style.whiteSpace = 'nowrap';
        tooltipEl.style.zIndex = '2000';
        tooltipEl.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
        const arrow = document.createElement('div');
        arrow.className = 'chartjs-tooltip-arrow';
        arrow.style.position = 'absolute';
        arrow.style.top = '-6px';
        arrow.style.left = '50%';
        arrow.style.transform = 'translateX(-50%)';
        arrow.style.width = '0';
        arrow.style.height = '0';
        arrow.style.borderLeft = '6px solid transparent';
        arrow.style.borderRight = '6px solid transparent';
        arrow.style.borderBottom = '6px solid #ffffff';
        const content = document.createElement('div');
        content.className = 'chartjs-tooltip-content';
        tooltipEl.appendChild(arrow);
        tooltipEl.appendChild(content);
        tooltipEl._content = content;
        document.body.appendChild(tooltipEl);
    }

    // Hide if no tooltip
    const tooltipModel = context.tooltip;
    if (tooltipModel.opacity === 0) {
        tooltipEl.style.opacity = 0;
        return;
    }

    // Set Text
    if (tooltipModel.body) {
        const date = new Date(context.chart.data.datasets[0].data[tooltipModel.dataPoints[0].dataIndex].x);
        const dateStr = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        const rawValue = tooltipModel.dataPoints[0].raw.y;
        const valueStr = vcFormatLargeNumber(rawValue, 1);

        const stage = tooltipModel.dataPoints[0].raw.stage || 'N/A';
        const innerHtml = `
            <div style="margin-bottom: 4px; color: #1e293b; display: flex; align-items: center; gap: 4px;">
                <span style="font-weight: 600;">Date:</span>
                <span>${dateStr}</span>
            </div>
            <div style="margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
                <span style="color: #1e293b; font-weight: 600;">Valuation:</span>
                <span style="color: #3b82f6;">${valueStr}</span>
            </div>
            <div style="color: #1e293b; display: flex; align-items: center; gap: 4px;">
                <span style="font-weight: 600;">Last Round:</span>
                <span>${stage}</span>
            </div>
        `;

        const content = tooltipEl.querySelector('.chartjs-tooltip-content') || tooltipEl._content || tooltipEl;
        content.innerHTML = innerHtml;
    }

    const position = context.chart.canvas.getBoundingClientRect();
    const bodyFont = Chart.defaults.font;

    // Display, position, and set styles for font
    tooltipEl.style.opacity = 1;
    tooltipEl.style.position = 'absolute';
    const verticalOffset = 10;
    tooltipEl.style.left = position.left + window.pageXOffset + tooltipModel.caretX + 'px';
    tooltipEl.style.top = position.top + window.pageYOffset + tooltipModel.caretY + verticalOffset + 'px';
    tooltipEl.style.font = bodyFont.string;
    tooltipEl.style.padding = tooltipModel.padding + 'px ' + tooltipModel.padding + 'px';
    tooltipEl.style.pointerEvents = 'none';
}

function hideVCTooltip() {
    const tooltipEl = document.getElementById('chartjs-tooltip-vc');
    if (tooltipEl) tooltipEl.style.opacity = 0;
    [ventureCompanyDetailChart, ventureFinancialBarChart].forEach(chart => {
        if (chart && chart.tooltip) {
            chart.tooltip.setActiveElements([], { x: 0, y: 0 });
            chart.update('none');
        }
    });
}

function attachVCTooltipGuards(chart) {
    if (!chart || !chart.canvas || vcTooltipHandlersAttached.has(chart.canvas)) return;
    const handler = () => hideVCTooltip();
    chart.canvas.addEventListener('mouseleave', handler);
    chart.canvas.addEventListener('touchend', handler, { passive: true });
    chart.canvas.addEventListener('touchcancel', handler, { passive: true });
    vcTooltipHandlersAttached.add(chart.canvas);
}

function updateVentureDetail(companyId) {
    if (!companyId || typeof getVentureCompanyDetail !== 'function') return;
    const detail = getVentureCompanyDetail(companyId);
    if (!detail) return;

    // Polyfill getYoySeries if missing (since detail is a POJO from getDetail)
    if (!detail.getYoySeries && window.CompanyModule && window.CompanyModule.BaseCompany) {
        detail.getYoySeries = function (limit) {
            return window.CompanyModule.BaseCompany.prototype.getYoySeries.call(this, limit);
        };
    } else if (!detail.getYoySeries) {
        console.warn('[VC Debug] Cannot polyfill getYoySeries: CompanyModule or BaseCompany missing', window.CompanyModule);
    }

    // console.log('[VC Debug] Detail object:', detail.name);
    // if (detail.quarterHistory && detail.quarterHistory.length > 0) {
    //     console.log('[VC Debug] Last Quarter:', JSON.stringify(detail.quarterHistory[detail.quarterHistory.length - 1]));
    // } else {
    //     console.log('[VC Debug] quarterHistory is empty');
    // }

    vcDetailNameEl.textContent = detail.name;
    const valuation = detail.valuation || 0;
    const sectorLabel = detail.subsector || detail.sector || 'Unknown';
    vcDetailSectorEl.textContent = `${sectorLabel} - ${detail.stageLabel}`;
    vcDetailFundingEl.style.display = 'none';
    const mission = (detail.mission || detail.description || '').trim();
    const founders = Array.isArray(detail.founders) ? detail.founders : [];
    const founderNames = founders.map(f => f && f.name).filter(Boolean);
    const foundingLocation = (detail.founding_location || detail.foundingLocation || '').trim();
    if (vcDetailMissionEl) {
        vcDetailMissionEl.textContent = mission;
        vcDetailMissionEl.style.display = mission ? 'block' : 'none';
    }
    if (vcDetailFoundersEl) {
        vcDetailFoundersEl.innerHTML = '';
        if (founderNames.length) {
            let html = '<div class="detail-founders-label">Founders:</div>';
            founderNames.forEach(name => {
                html += `<div class="detail-founder-name">${name}</div>`;
            });
            vcDetailFoundersEl.innerHTML = html;
            vcDetailFoundersEl.style.display = 'flex';
        } else {
            vcDetailFoundersEl.style.display = 'none';
        }
    }
    if (vcDetailLocationEl) {
        vcDetailLocationEl.textContent = foundingLocation || '';
        vcDetailLocationEl.style.display = foundingLocation ? 'inline-flex' : 'none';
    }

    const roundInfo = buildRoundInfo(detail);
    vcDetailRoundInfoEl.textContent = roundInfo.info;
    vcDetailTimerEl.textContent = roundInfo.timer;
    renderInvestmentOptions(detail, companyId);

    if (vcFinancialHistoryContainer) {
        // Ensure structure exists: Controls + Chart Container + Table Container
        let chartContainer = document.getElementById('vcChartContainerWrapper');
        let tableContainer = document.getElementById('vcTableContainerWrapper');
        let controlsWrapper = document.getElementById('vcChartControls');

        if (!chartContainer) {
            vcFinancialHistoryContainer.innerHTML = '';

            controlsWrapper = document.createElement('div');
            controlsWrapper.id = 'vcChartControls';
            controlsWrapper.className = 'chart-controls';
            controlsWrapper.style.display = 'flex';
            controlsWrapper.style.justifyContent = 'flex-end';
            controlsWrapper.style.marginBottom = '5px';
            controlsWrapper.style.gap = '5px';
            vcFinancialHistoryContainer.appendChild(controlsWrapper);

            chartContainer = document.createElement('div');
            chartContainer.id = 'vcChartContainerWrapper';
            chartContainer.className = 'financial-yoy-chart';
            chartContainer.style.height = '200px';
            chartContainer.style.marginBottom = '20px';
            const canvas = document.createElement('canvas');
            canvas.id = 'vcFinancialBarChart';
            canvas.style.display = 'block';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            chartContainer.appendChild(canvas);
            vcFinancialHistoryContainer.appendChild(chartContainer);

            tableContainer = document.createElement('div');
            tableContainer.id = 'vcTableContainerWrapper';
            vcFinancialHistoryContainer.appendChild(tableContainer);
        }

        // Update Table
        tableContainer.innerHTML = getFinancialTableHTML(detail.financialHistory);

        // Update Chart (will handle its own update vs create logic)
        renderVentureFinancialChart(detail);
    }
    if (vcPipelineContainer && vcPipelinePanel) {
        if (typeof window.getPipelineHTML === 'function') {
            const html = window.getPipelineHTML(detail) || '';
            vcPipelineContainer.innerHTML = html;
            const visible = !!html;
            vcPipelinePanel.style.display = visible ? 'block' : 'none';
            vcPipelineContainer.style.display = visible ? 'block' : 'none';
        } else {
            vcPipelineContainer.innerHTML = '';
            vcPipelinePanel.style.display = 'none';
        }
    }
    if (vcLeadRoundBtn) {
        vcLeadRoundBtn.style.display = 'none';
    }
    if (vcLeadRoundNoteEl) {
        vcLeadRoundNoteEl.textContent = '';
        vcLeadRoundNoteEl.classList.remove('positive');
        vcLeadRoundNoteEl.classList.remove('negative');
    }

    // destroyVentureChart({ valuation: true, financial: false }); // Don't destroy blindly!

    const listingWindow = detail.listing_window || detail.listingWindow || null;
    const listingFromTs = listingWindow && listingWindow.from ? new Date(listingWindow.from).getTime() : NaN;
    const listingCutoff = Number.isFinite(listingFromTs) ? listingFromTs : null;

    const normalizeHistory = (hist) => {
        if (!Array.isArray(hist) || hist.length === 0) return [];
        return hist
            .map(point => {
                let x = NaN;
                if (point) {
                    if (typeof point.x === 'number') x = point.x;
                    else if (typeof point.x === 'string' && !isNaN(Number(point.x))) x = Number(point.x);
                    else if (point.x) x = new Date(point.x).getTime();
                }
                const y = point ? Number(point.y) : NaN;
                if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                return { ...point, x, y };
            })
            .filter(Boolean)
            .sort((a, b) => a.x - b.x);
    };

    const baseHistory = normalizeHistory(detail.history);
    let history = baseHistory.length > 0 ? baseHistory.slice() : [{ x: Date.now(), y: valuation }];

    if (listingCutoff) {
        const trimmed = history.filter(point => point.x >= listingCutoff);
        if (trimmed.length > 0) {
            history = trimmed;
        }
    }

    history.sort((a, b) => a.x - b.x);
    if (history.length === 1) {
        const dayMs = 24 * 60 * 60 * 1000;
        let anchorX = listingCutoff ? listingCutoff : history[0].x - dayMs;
        if (detail.startDate && Number.isFinite(detail.startDate)) {
            anchorX = detail.startDate;
        }
        // Ensure we don't go before start date
        if (detail.startDate && anchorX < detail.startDate) {
            anchorX = detail.startDate;
        }
        history.unshift({ x: anchorX, y: history[0].y, stage: history[0].stage });
    }
    const suggestedMin = valuation > 0 ? valuation * 0.8 : 0;
    const suggestedMax = valuation > 0 ? valuation * 1.2 : 1;

    if (ventureCompanyDetailChart) {
        // Update existing chart
        ventureCompanyDetailChart.data.datasets[0].data = history.map(point => ({ x: point.x, y: point.y, stage: point.stage }));
        ventureCompanyDetailChart.options.scales.y.suggestedMin = suggestedMin;
        ventureCompanyDetailChart.options.scales.y.suggestedMax = suggestedMax;
        ventureCompanyDetailChart.update('none');
        attachVCTooltipGuards(ventureCompanyDetailChart);
    } else if (vcDetailChartCtx) {
        // Create new chart
        ventureCompanyDetailChart = new Chart(vcDetailChartCtx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Valuation',
                    data: history.map(point => ({ x: point.x, y: point.y, stage: point.stage })),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    borderWidth: 2,
                    tension: 0,
                    stepped: 'before',
                    pointRadius: 0,
                    pointHitRadius: 20,
                    pointHoverBackgroundColor: '#3b82f6',
                    pointHoverBorderWidth: 0,
                    pointHoverRadius: 6,
                    fill: true,
                    parsing: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: false,
                        external: getVCTooltipHandler,
                        mode: 'index',
                        intersect: false,
                    },
                },
                transitions: {
                    active: {
                        animation: { duration: 0 }
                    }
                },
                elements: {
                    point: {
                        radius: 0,
                        hitRadius: 20,
                        hoverRadius: 6,
                        hoverBorderWidth: 0
                    }
                },
                scales: {
                    x: { type: 'time', time: { unit: 'year' } },
                    y: {
                        ticks: {
                            callback: value => vcFormatLargeNumber(value)
                        },
                        suggestedMin,
                        suggestedMax
                    }
                }
            }
        });
        attachVCTooltipGuards(ventureCompanyDetailChart);
    }
}

function getFinancialTableHTML(history) {
    if (!history || history.length === 0) {
        return '<p>No annual data available yet</p>';
    }

    const rows = history.slice().reverse().map(entry => {
        const revenue = vcFormatCurrency(entry.revenue || 0);
        const profit = vcFormatCurrency(entry.profit || 0);
        const cash = vcFormatCurrency(entry.cash || 0);
        const debt = vcFormatCurrency(entry.debt || 0);
        const dividend = vcFormatCurrency(entry.dividend || 0);
        const ps = entry.ps && isFinite(entry.ps) && entry.ps > 0 ? `${entry.ps.toFixed(1)}x` : 'N/A';
        const pe = entry.pe && isFinite(entry.pe) && entry.pe > 0 ? `${entry.pe.toFixed(1)}x` : 'N/A';
        return `<tr><td>${entry.year}</td><td>${revenue}</td><td>${profit}</td><td>${cash}</td><td>${debt}</td><td>${dividend}</td><td>${ps}</td><td>${pe}</td></tr>`;
    }).join('');
    return `
        <div class="financial-table">
            <h3>Financial History</h3>
            <table>
                <thead><tr><th>Year</th><th>Revenue</th><th>Profit</th><th>Cash</th><th>Debt</th><th>Dividend</th><th>P/S</th><th>P/E</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function showVentureCompanyDetail(companyId, options = {}) {
    if (!companyId) return;
    const { skipHistory = false } = options;
    ensureVentureReady();
    currentVentureCompanyId = companyId;
    document.body.classList.add('vc-active');
    document.body.classList.add('vc-detail-active');
    updateVentureDetail(companyId);
    if (!skipHistory && typeof window.pushViewState === 'function' && !window.__suppressHistoryPush) {
        window.pushViewState('vc-detail', { ventureId: companyId });
    }
}

function hideVentureCompanyDetail(options = {}) {
    const { skipHistory = false } = options;
    document.body.classList.remove('vc-detail-active');
    currentVentureCompanyId = null;
    destroyVentureChart();
    hideVCTooltip();
    lastInvestmentOptionsKey.clear();
    if (!skipHistory && typeof window.pushViewState === 'function' && !window.__suppressHistoryPush) {
        window.pushViewState('vc', {});
    }
}

function exitVentureToHome() {
    if (typeof closeVentureTab === 'function') {
        closeVentureTab();
        return;
    }
    hideVentureCompanyDetail({ skipHistory: true });
    document.body.classList.remove('vc-active');
    if (typeof window.pushViewState === 'function') {
        window.pushViewState('market', {});
    }
}

function refreshVentureCompaniesList() {
    if (typeof getVentureCompanySummaries !== 'function') return;
    const summaries = getVentureCompanySummaries();
    renderVentureCompanies(summaries, vcFormatLargeNumber, vcFormatCurrency);
    if (document.body.classList.contains('vc-active') && typeof window.markVentureListingsSeen === 'function') {
        window.markVentureListingsSeen();
    } else if (typeof window.updateVentureBadge === 'function') {
        window.updateVentureBadge();
    }
}

function refreshVentureDetailView() {
    if (!currentVentureCompanyId) return;
    updateVentureDetail(currentVentureCompanyId);
}

function initVC() {
    if (vcInitialized) return;
    vcInitialized = true;
    if (backToVcListBtn) {
        backToVcListBtn.addEventListener('click', exitVentureToHome);
    }
    if (vcLeadRoundBtn) {
        vcLeadRoundBtn.addEventListener('click', () => {
            if (!currentVentureCompanyId || typeof leadVentureRound !== 'function') return;
            const result = leadVentureRound(currentVentureCompanyId);
            refreshVentureDetailView();
            if (!vcLeadRoundNoteEl) return;
            if (!result.success) {
                vcLeadRoundNoteEl.textContent = result.reason || 'Unable to lead this round right now.';
                vcLeadRoundNoteEl.classList.add('negative');
                vcLeadRoundNoteEl.classList.remove('positive');
            } else {
                const equityPct = (result.equityOffered || 0) * 100;
                vcLeadRoundNoteEl.textContent = `Committed ${vcFormatCurrency(result.invested)} for up to ${(equityPct).toFixed(2)}% ownership (pending).`;
                vcLeadRoundNoteEl.classList.remove('negative');
                vcLeadRoundNoteEl.classList.add('positive');
                if (vcLeadRoundBtn) {
                    vcLeadRoundBtn.disabled = true;
                    vcLeadRoundBtn.textContent = 'Round Led';
                    vcLeadRoundBtn.classList.add('vc-disabled');
                    vcLeadRoundBtn.classList.remove('positive');
                    vcLeadRoundBtn.classList.remove('negative');
                }
            }
        });
    }
    if (vcInvestmentOptionsEl) {
        vcInvestmentOptionsEl.addEventListener('click', (evt) => {
            const btn = evt.target.closest('.vc-option-buy');
            if (!btn) return;
            const pct = parseFloat(btn.dataset.pct);
            handleVenturePurchase(pct);
        });
    }
}

window.hideVentureCompanyDetail = hideVentureCompanyDetail;
window.refreshVentureCompaniesList = refreshVentureCompaniesList;
window.refreshVentureDetailView = refreshVentureDetailView;
window.showVentureCompanyDetail = showVentureCompanyDetail;
window.getCurrentVentureCompanyId = () => currentVentureCompanyId;
window.isViewingVentureCompany = (companyId) => {
    if (!companyId) return false;
    return currentVentureCompanyId === companyId;
};

function ensureVCInit() {
    if (typeof netWorth !== 'undefined') {
        initVC();
    } else {
        setTimeout(initVC, 500);
    }
}

function renderVentureFinancialChart(company) {
    const canvas = document.getElementById('vcFinancialBarChart');
    if (!canvas || !company) return;

    // Inject controls if needed (match public chart styling)
    let controlsWrapper = document.getElementById('vcChartControls');
    const controlsHost = vcFinancialHistoryContainer || canvas.parentElement;
    if (!controlsWrapper && controlsHost) {
        controlsWrapper = document.createElement('div');
        controlsWrapper.id = 'vcChartControls';
        controlsWrapper.className = 'chart-controls';
        controlsWrapper.style.display = 'flex';
        controlsWrapper.style.justifyContent = 'flex-end';
        controlsWrapper.style.marginBottom = '5px';
        controlsWrapper.style.gap = '5px';
        controlsHost.insertBefore(controlsWrapper, controlsHost.firstChild);
    }
    if (controlsWrapper && !controlsWrapper.dataset.bound) {
        const ranges = [
            { label: '5Y', value: 20 },
            { label: '10Y', value: 40 },
            { label: '20Y', value: 80 },
            { label: 'Max', value: 0 }
        ];
        ranges.forEach(range => {
            const btn = document.createElement('button');
            btn.textContent = range.label;
            btn.className = 'chart-range-btn';
            btn.dataset.value = range.value;
            btn.style.padding = '2px 8px';
            btn.style.fontSize = '12px';
            btn.style.cursor = 'pointer';
            btn.style.border = '1px solid #ccc';
            btn.style.borderRadius = '4px';
            btn.style.backgroundColor = currentVcChartRange === range.value ? '#e0e0e0' : '#fff';

            btn.onclick = () => {
                currentVcChartRange = range.value;
                renderVentureFinancialChart(company);
            };
            controlsWrapper.appendChild(btn);
        });
        controlsWrapper.dataset.bound = 'true';
    } else if (controlsWrapper) {
        controlsWrapper.querySelectorAll('.chart-range-btn').forEach(b => {
            b.style.backgroundColor = parseInt(b.dataset.value, 10) === currentVcChartRange ? '#e0e0e0' : '#fff';
        });
    }

    // Use getYoySeries if available (inherited from BaseCompany), otherwise fallback or empty
    const yoySeries = typeof company.getYoySeries === 'function'
        ? company.getYoySeries(currentVcChartRange)
        : [];
    // if (yoySeries && yoySeries.length > 0) {
    //     console.log('[VC Debug] Last YoY Point:', JSON.stringify(yoySeries[yoySeries.length - 1]));
    // }

    if (!yoySeries || yoySeries.length === 0) {
        // If we have an existing chart, keep it (don't clear) to avoid flickering
        if (ventureFinancialBarChart) {
            return;
        }
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Removed "Waiting for financial data..." text as requested
        return;
    }

    const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);

    const labels = yoySeries.map(item => {
        if (item.label) return item.label;
        return `${item.year} Q${item.quarter}`;
    });
    const revenueData = yoySeries.map(item => item.revenue);
    const profitData = yoySeries.map(item => item.profit);
    const profitColors = profitData.map(value => {
        if (typeof value !== 'number' || !isFinite(value)) return 'transparent';
        return value >= 0 ? '#6de38a' : '#ff5b5b';
    });

    // Pad with empty data if few points to prevent "beeg spacing"
    const minPoints = 20;
    if (labels.length < minPoints) {
        const missing = minPoints - labels.length;
        for (let i = 0; i < missing; i++) {
            labels.push('');
            revenueData.push(null);
            profitData.push(null);
            profitColors.push('transparent');
        }
    }

    // console.log('[VC Debug] Rendering Chart with:', { labels, revenueData, profitData });

    try {
        if (typeof Chart === 'undefined') {
            throw new Error('Chart.js is not loaded');
        }

        // Debug canvas dimensions
        // console.log(`[VC Debug] Canvas Dimensions: ${canvas.width}x${canvas.height}, Client: ${canvas.clientWidth}x${canvas.clientHeight}`);

        if (canvas.clientHeight === 0) {
            console.warn('[VC Debug] Canvas has 0 height! Forcing resize.');
            canvas.style.height = '200px';
        }

        // If chart exists and canvas is same, update it
        if (ventureFinancialBarChart) {
            if (ventureFinancialBarChart.canvas !== canvas) {
                ventureFinancialBarChart.destroy();
                ventureFinancialBarChart = null;
            } else {
                ventureFinancialBarChart.data.datasets[0].label = 'Revenue (Trailing 12 Months)';
                ventureFinancialBarChart.data.datasets[1].label = 'Profit (Trailing 12 Months)';
                ventureFinancialBarChart.data.labels = labels;
                ventureFinancialBarChart.data.datasets[0].data = revenueData;
                ventureFinancialBarChart.data.datasets[1].data = profitData;
                ventureFinancialBarChart.data.datasets[1].backgroundColor = profitColors;
                // Explicitly set hoverBackgroundColor to avoid resolution errors
                ventureFinancialBarChart.data.datasets[1].hoverBackgroundColor = profitColors;
                ventureFinancialBarChart.update('none');
                return;
            }
        }

        ventureFinancialBarChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Revenue (Trailing 12 Months)',
                        data: revenueData,
                        backgroundColor: '#635bff',
                        hoverBackgroundColor: '#5046e5', // Explicit hover color
                        borderRadius: 4,
                        categoryPercentage: 0.8,
                        barPercentage: 0.9,
                        grouped: false,
                        order: 2,
                        maxBarThickness: 50,
                        skipNull: true
                    },
                    {
                        label: 'Profit (Trailing 12 Months)',
                        data: profitData,
                        backgroundColor: profitColors,
                        hoverBackgroundColor: profitColors, // Explicit hover color array
                        borderRadius: 4,
                        categoryPercentage: 0.8,
                        barPercentage: 0.9,
                        grouped: false,
                        order: 1,
                        maxBarThickness: 50,
                        skipNull: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: { display: true, position: 'top', reverse: true },
                    tooltip: {
                        filter: (tooltipItem) => {
                            const val = tooltipItem.parsed.y;
                            return val !== null && val !== undefined && !isNaN(val);
                        },
                        callbacks: {
                            label: context => {
                                const val = context.parsed.y ?? context.parsed;
                                if (val === null || val === undefined || isNaN(val)) return null;
                                const label = context.dataset.label.replace(' (Trailing 12 Months)', '');
                                return `${label}: ${vcFormatLargeNumber(val, 2)}`;
                            }
                        },
                        itemSort: (a, b) => a.datasetIndex - b.datasetIndex
                    }
                },
                transitions: {
                    active: {
                        animation: { duration: 0 }
                    }
                },
                elements: {
                    bar: {
                        hoverBorderWidth: 0
                    }
                },
                scales: {
                    x: {
                        grid: { display: false }
                    },
                    y: {
                        grid: { color: 'rgba(148, 163, 184, 0.25)' },
                        ticks: {
                            callback: value => vcFormatLargeNumber(value)
                        }
                    }
                }
            }
        });
        // console.log('[VC Debug] Chart created successfully');
        attachVCTooltipGuards(ventureFinancialBarChart);
    } catch (err) {
        console.error('[VC Debug] Chart creation failed:', err);
    }
}

function computeVenturePackageAmount(detail, pct) {
    if (!detail || !detail.round) return 0;
    const round = detail.round;
    const preMoney = Number(round.preMoney) || 0;
    const raiseAmount = Number(round.raiseAmount) || 0;
    const postMoney = Number(round.postMoney) || (preMoney + raiseAmount);
    const equityFraction = Math.max(0, pct) / 100;
    if (!Number.isFinite(postMoney) || postMoney <= 0 || equityFraction <= 0) return 0;
    return equityFraction * postMoney;
}

function handleVenturePurchase(pct) {
    if (venturePurchaseLock) return;
    venturePurchaseLock = true;
    let unlocked = false;
    const release = () => {
        if (!unlocked) {
            unlocked = true;
            setTimeout(() => {
                venturePurchaseLock = false;
            }, 500);
        }
    };
    if (!currentVentureCompanyId || !Number.isFinite(pct) || pct <= 0) {
        release();
        return;
    }
    ensureVentureReady();
    const availableCashSnapshot = (typeof cash !== 'undefined' && Number.isFinite(Number(cash))) ? Number(cash) : null;
    const detail = typeof getVentureCompanyDetail === 'function' ? getVentureCompanyDetail(currentVentureCompanyId) : null;
    const amount = computeVenturePackageAmount(detail, pct);
    const equityFraction = pct / 100;
    if (!amount || amount <= 0) {
        if (vcLeadRoundNoteEl) {
            vcLeadRoundNoteEl.textContent = 'Unable to price this package.';
            vcLeadRoundNoteEl.classList.add('negative');
            vcLeadRoundNoteEl.classList.remove('positive');
        }
        release();
        return;
    }
    const usingServer = typeof isServerAuthoritative !== 'undefined' && isServerAuthoritative && typeof sendCommand === 'function' && typeof WebSocket !== 'undefined' && ws && ws.readyState === WebSocket.OPEN;
    if (usingServer) {
        sendCommand({ type: 'vc_invest', companyId: currentVentureCompanyId, pct });
        if (typeof serverPlayer === 'object' && serverPlayer) {
            serverPlayer.cash = (serverPlayer.cash || 0) - amount;
            if (!serverPlayer.ventureCommitments) serverPlayer.ventureCommitments = {};
            serverPlayer.ventureCommitments[currentVentureCompanyId] = (serverPlayer.ventureCommitments[currentVentureCompanyId] || 0) + amount;
            serverPlayer.ventureCommitmentsValue = (serverPlayer.ventureCommitmentsValue || 0) + amount;
            serverPlayer.netWorth = (serverPlayer.netWorth || (typeof netWorth !== 'undefined' ? netWorth : 0)); // keep level (cash down, commitment up)
        }
        if (typeof updateNetWorth === 'function') updateNetWorth();
        if (typeof updateDisplay === 'function') updateDisplay();
        if (vcLeadRoundNoteEl) {
            vcLeadRoundNoteEl.textContent = `Requested ${pct.toFixed(2)}% package…`;
            vcLeadRoundNoteEl.classList.remove('negative');
            vcLeadRoundNoteEl.classList.add('positive');
        }
        if (typeof showToast === 'function') {
            showToast(`Investment requested for ${pct.toFixed(2)}% equity!`, { tone: 'success' });
        }
        release();
        return;
    }
    if (Number.isFinite(availableCashSnapshot) && availableCashSnapshot + 1e-6 < amount) {
        showToast(`Insufficient cash for this package. Needed ${vcFormatCurrency(amount)}, you have ${vcFormatCurrency(availableCashSnapshot)}.`, { tone: 'warn', duration: 5000 });
        release();
        return;
    }
    if (ventureSim && typeof ventureSim.invest === 'function') {
        const investorId = (typeof clientPlayerId !== 'undefined' && clientPlayerId) ? clientPlayerId : 'local_player';
        const result = ventureSim.invest(currentVentureCompanyId, equityFraction, investorId);
        if (!result?.success) {
            if (vcLeadRoundNoteEl) {
                vcLeadRoundNoteEl.textContent = result?.reason || 'Investment failed.';
                vcLeadRoundNoteEl.classList.add('negative');
                vcLeadRoundNoteEl.classList.remove('positive');
            }
            release();
            return;
        }
    }
    if (typeof cash !== 'undefined') {
        const base = Number.isFinite(availableCashSnapshot) ? availableCashSnapshot : Number(cash) || 0;
        cash = base - amount;
    }
    if (typeof updateNetWorth === 'function') updateNetWorth();
    if (typeof updateDisplay === 'function') updateDisplay();
    if (typeof renderPortfolio === 'function') renderPortfolio();
    if (vcLeadRoundNoteEl) {
        vcLeadRoundNoteEl.textContent = `Committed ${vcFormatCurrency(amount)} for ${(pct).toFixed(2)}%.`;
        vcLeadRoundNoteEl.classList.remove('negative');
        vcLeadRoundNoteEl.classList.add('positive');
    }
    if (typeof showToast === 'function') {
        showToast(`Successfully invested ${vcFormatCurrency(amount)} for ${(pct).toFixed(2)}% equity!`, { tone: 'success' });
    }
    refreshVentureDetailView();
    release();
}



document.addEventListener('DOMContentLoaded', ensureVCInit);
