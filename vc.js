const ventureCompaniesGrid = document.getElementById('ventureCompaniesGrid');
const vcDetailNameEl = document.getElementById('vcDetailCompanyName');
const vcDetailSectorEl = document.getElementById('vcDetailCompanySector');
const vcDetailFundingEl = document.getElementById('vcDetailFundingRound');
const vcDetailStatusEl = document.getElementById('vcDetailStatus');
const vcDetailDescriptionEl = document.getElementById('vcDetailDescription');
const vcDetailRoundInfoEl = document.getElementById('vcDetailRoundInfo');
const vcDetailSuccessChanceEl = document.getElementById('vcDetailSuccessChance');
const vcDetailTimerEl = document.getElementById('vcDetailTimer');
const vcDetailOwnershipEl = document.getElementById('vcDetailOwnership');
const vcDetailInvestedEl = document.getElementById('vcDetailInvested');
const vcDetailLastEventEl = document.getElementById('vcDetailLastEvent');
const vcLeadRoundBtn = document.getElementById('vcLeadRoundBtn');
const vcLeadRoundNoteEl = document.getElementById('vcLeadRoundNote');
const backToVcListBtn = document.getElementById('back-to-vc-list-btn');
const vcDetailChartCanvas = document.getElementById('vcCompanyDetailChart');
const vcDetailChartCtx = vcDetailChartCanvas ? vcDetailChartCanvas.getContext('2d') : null;
const vcFinancialHistoryContainer = document.getElementById('vcFinancialHistoryContainer');
const vcPipelineContainer = document.getElementById('vcPipelineContainer');

let currentVentureCompanyId = null;
let vcFormatLargeNumber = (value) => {
    if (value === null || value === undefined) return '$0';
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
    return `${sign}$${abs.toFixed(0)}`;
};
let vcFormatCurrency = (value) => vcFormatLargeNumber(value || 0);
let ventureCompanyDetailChart = null;

function ensureVentureReady() {
    if (typeof ensureVentureSimulation === 'function') {
        ensureVentureSimulation();
    }
}

function destroyVentureChart() {
    if (ventureCompanyDetailChart) {
        ventureCompanyDetailChart.destroy();
        ventureCompanyDetailChart = null;
    }
}

function renderVentureCompanies(companiesData, formatLargeNumber, formatCurrency) {
    ensureVentureReady();
    vcFormatLargeNumber = formatLargeNumber || vcFormatLargeNumber;
    vcFormatCurrency = formatCurrency || vcFormatCurrency;

    if (!ventureCompaniesGrid) return;
    ventureCompaniesGrid.innerHTML = '';

    (companiesData || []).forEach(company => {
        const companyDiv = document.createElement('div');
        companyDiv.classList.add('company-box');
        companyDiv.dataset.companyId = company.id;

        const valuationRaw = typeof company.valuation !== 'undefined' ? company.valuation : company.valuation_usd;
        const valuationDisplay = vcFormatLargeNumber(valuationRaw || 0);
        const stageDisplay = company.stageLabel || company.funding_round || 'N/A';
        const playerStake = company.playerEquityPercent && company.playerEquityPercent > 0
            ? `Your Stake: ${company.playerEquityPercent.toFixed(2)}%`
            : '';

        companyDiv.innerHTML = `
            <div class="company-name">${company.name}</div>
            <div class="company-info">
                <div class="company-valuation">Valuation: ${valuationDisplay}</div>
                <div class="company-stage">Stage: ${stageDisplay}</div>
                ${playerStake ? `<div class="company-note">${playerStake}</div>` : ''}
            </div>
        `;

        const quickLeadBtn = document.createElement('button');
        quickLeadBtn.classList.add('vc-quick-lead-btn', 'buy-btn');
        const playerCommitted = !!company.playerCommitted;
        const canLead = company.status === 'Raising' && !playerCommitted;
        const isIpoPending = company.status === 'IPO Ready';
        quickLeadBtn.classList.remove('positive');
        quickLeadBtn.classList.remove('vc-disabled');
        quickLeadBtn.disabled = !canLead;
        quickLeadBtn.classList.toggle('vc-disabled', !canLead);
        let quickLeadLabel;
        if (playerCommitted) {
            quickLeadLabel = 'Round Led';
        } else if (canLead) {
            quickLeadLabel = 'Lead Round';
        } else if (isIpoPending) {
            quickLeadLabel = 'IPO Pending';
        } else {
            quickLeadLabel = 'Not Raising';
        }
        quickLeadBtn.textContent = quickLeadLabel;
        quickLeadBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            ensureVentureReady();
            if (typeof leadVentureRound !== 'function') return;
            const result = leadVentureRound(company.id);
            if (result && result.success) {
                quickLeadBtn.textContent = 'Round Led';
                quickLeadBtn.disabled = true;
                quickLeadBtn.classList.remove('positive');
                quickLeadBtn.classList.add('vc-disabled');
            }
            if (typeof refreshVentureCompaniesList === 'function') {
                refreshVentureCompaniesList();
            }
            if (typeof refreshVentureDetailView === 'function') {
                refreshVentureDetailView();
            }
        });

        companyDiv.appendChild(quickLeadBtn);

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
    let info = `Raising ${vcFormatCurrency(round.raiseAmount)} at a ${vcFormatCurrency(round.preMoney)} pre (${(round.equityOffered * 100).toFixed(2)}% offered).`;
    let chance = `Success Chance: ${(round.successProb * 100).toFixed(1)}%`;
    const monthsRemaining = Math.max(0, round.daysRemaining / 30);
    let timer = `Next round in ~${Math.max(0, Math.ceil(monthsRemaining))} months`;

    if (detail.status === 'IPO Ready') {
        info = 'IPO paperwork in progress. No additional rounds required.';
        chance = 'Success Chance: 100%';
        timer = 'IPO imminent';
    } else if (detail.status === 'Failed') {
        info = 'Company operations have ceased.';
        chance = 'Success Chance: 0%';
        timer = 'No further rounds.';
    }

    const committedAmount = round.playerCommitted ? (round.playerCommitAmount || 0) : 0;
    return {
        info,
        chance,
        timer,
        canLead: detail.status === 'Raising' && !round.playerCommitted,
        alreadyCommitted: round.playerCommitted,
        committedAmount
    };
}

function updateVentureDetail(companyId) {
    if (!companyId || typeof getVentureCompanyDetail !== 'function') return;
    const detail = getVentureCompanyDetail(companyId);
    if (!detail) return;

    vcDetailNameEl.textContent = detail.name;
    vcDetailSectorEl.textContent = detail.sector || 'Sector unavailable';
    vcDetailFundingEl.textContent = `Stage: ${detail.stageLabel}`;
    vcDetailStatusEl.textContent = `Status: ${detail.status}`;

    const valuation = detail.valuation || 0;
    vcDetailDescriptionEl.textContent = detail.description || 'No description provided yet.';

    const roundInfo = buildRoundInfo(detail);
    vcDetailRoundInfoEl.textContent = roundInfo.info;
    vcDetailSuccessChanceEl.textContent = roundInfo.chance;
    vcDetailTimerEl.textContent = roundInfo.timer;

    const ownershipValue = detail.playerEquity ? detail.playerEquity * valuation : 0;
    if (detail.playerEquity && detail.playerEquity > 0) {
        vcDetailOwnershipEl.textContent = `Your Stake: ${detail.playerEquityPercent.toFixed(2)}% (${vcFormatCurrency(ownershipValue)})`;
    } else {
        vcDetailOwnershipEl.textContent = 'Your Stake: 0.00%';
    }
    const pendingCapital = detail.pendingCommitment || 0;
    const pendingText = pendingCapital > 0 ? ` | Pending: ${vcFormatCurrency(pendingCapital)}` : '';
    vcDetailInvestedEl.textContent = `Total Invested: ${vcFormatCurrency(detail.playerInvested || 0)}${pendingText}`;
    vcDetailLastEventEl.textContent = detail.lastEventNote || '';
    if (vcFinancialHistoryContainer) {
        vcFinancialHistoryContainer.innerHTML = getFinancialTableHTML(detail.financialHistory);
    }
    if (vcPipelineContainer) {
        if (typeof window.getPipelineHTML === 'function') {
            vcPipelineContainer.innerHTML = window.getPipelineHTML(detail);
        } else {
            vcPipelineContainer.innerHTML = '<h3 class="investment-title">Product Pipeline</h3><div class="no-pipeline">Pipeline view unavailable.</div>';
        }
    }

    if (vcLeadRoundBtn) {
        const alreadyCommitted = roundInfo.alreadyCommitted;
        const canLeadNow = roundInfo.canLead && !alreadyCommitted;
        vcLeadRoundBtn.classList.remove('positive');
        vcLeadRoundBtn.classList.remove('negative');
        vcLeadRoundBtn.classList.remove('vc-disabled');
        vcLeadRoundBtn.disabled = !canLeadNow;
        let detailButtonLabel;
        if (alreadyCommitted) {
            detailButtonLabel = 'Round Led';
        } else if (canLeadNow) {
            detailButtonLabel = 'Lead This Round';
        } else if (detail.status === 'IPO Ready') {
            detailButtonLabel = 'IPO Pending';
        } else {
            detailButtonLabel = 'Not Raising';
        }
        vcLeadRoundBtn.textContent = detailButtonLabel;
        vcLeadRoundBtn.classList.toggle('vc-disabled', vcLeadRoundBtn.disabled);
    }
    if (vcLeadRoundNoteEl) {
        vcLeadRoundNoteEl.classList.remove('positive');
        vcLeadRoundNoteEl.classList.remove('negative');
        if (roundInfo.alreadyCommitted) {
            const committedValue = roundInfo.committedAmount > 0
                ? roundInfo.committedAmount
                : (detail.pendingCommitment || 0);
            const committedMsg = committedValue > 0
                ? `Committed ${vcFormatCurrency(committedValue)} — awaiting results.`
                : 'You already led this round.';
            vcLeadRoundNoteEl.textContent = committedMsg;
            vcLeadRoundNoteEl.classList.add('positive');
        } else if (!roundInfo.canLead) {
            vcLeadRoundNoteEl.textContent = '';
            if (detail.status === 'Failed') {
                vcLeadRoundNoteEl.textContent = 'This company has failed.';
                vcLeadRoundNoteEl.classList.add('negative');
            } else if (detail.status === 'IPO Ready') {
                vcLeadRoundNoteEl.textContent = 'IPO in progress; no new funding round.';
            }
        } else {
            vcLeadRoundNoteEl.textContent = '';
        }
    }

    destroyVentureChart();
    if (vcDetailChartCtx) {
    let history = (detail.history && detail.history.length > 0)
        ? detail.history.slice()
        : [{ x: Date.now(), y: valuation }];
    history.sort((a, b) => a.x - b.x);
    if (history.length === 1) {
        const dayMs = 24 * 60 * 60 * 1000;
        history.unshift({ x: history[0].x - dayMs, y: history[0].y });
    }
    const suggestedMin = valuation > 0 ? valuation * 0.8 : 0;
    const suggestedMax = valuation > 0 ? valuation * 1.2 : 1;
    ventureCompanyDetailChart = new Chart(vcDetailChartCtx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Valuation',
                data: history.map(point => ({ x: point.x, y: point.y })),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    borderWidth: 2,
                    tension: 0,
                    stepped: 'before',
                    pointRadius: 0,
                    fill: true,
                    parsing: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                plugins: { legend: { display: false } },
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

function showVentureCompanyDetail(companyId) {
    if (!companyId) return;
    ensureVentureReady();
    currentVentureCompanyId = companyId;
    document.body.classList.add('vc-active');
    document.body.classList.add('vc-detail-active');
    updateVentureDetail(companyId);
}

function hideVentureCompanyDetail() {
    document.body.classList.remove('vc-detail-active');
    currentVentureCompanyId = null;
    destroyVentureChart();
}

function refreshVentureCompaniesList() {
    if (typeof getVentureCompanySummaries !== 'function') return;
    const summaries = getVentureCompanySummaries();
    renderVentureCompanies(summaries, vcFormatLargeNumber, vcFormatCurrency);
}

function refreshVentureDetailView() {
    if (!currentVentureCompanyId) return;
    updateVentureDetail(currentVentureCompanyId);
}

function initVC() {
    if (backToVcListBtn) {
        backToVcListBtn.addEventListener('click', hideVentureCompanyDetail);
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
}

window.hideVentureCompanyDetail = hideVentureCompanyDetail;
window.refreshVentureCompaniesList = refreshVentureCompaniesList;
window.refreshVentureDetailView = refreshVentureDetailView;
window.showVentureCompanyDetail = showVentureCompanyDetail;

function ensureVCInit() {
    if (typeof netWorth !== 'undefined') {
        initVC();
    } else {
        setTimeout(initVC, 500);
    }
}

document.addEventListener('DOMContentLoaded', ensureVCInit);
