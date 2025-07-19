// --- DOM Elements ---
const bodyEl = document.body;
const netWorthDisplay = document.getElementById('netWorthDisplay');
const currentDateDisplay = document.getElementById('currentDateDisplay');
const companiesGrid = document.getElementById('companiesGrid');

const togglePauseBtn = document.getElementById('togglePauseBtn');
const speedBtns = { half: document.getElementById('halfSpeedBtn'), normal: document.getElementById('normalSpeedBtn'), double: document.getElementById('doubleSpeedBtn'), quad: document.getElementById('quadSpeedBtn'), octo: document.getElementById('octoSpeedBtn') };
const backBtn = document.getElementById('back-btn');
const portfolioList = document.getElementById('portfolioList');
const emptyPortfolioMsg = document.getElementById('emptyPortfolioMsg');
const playerCashDisplay = document.getElementById('playerCashDisplay');
const playerStakeDisplay = document.getElementById('playerStakeDisplay');
const investmentAmountInput = document.getElementById('investmentAmountInput');
const buyBtn = document.getElementById('buyBtn');
const sellBtn = document.getElementById('sellBtn');
const bankBtn = document.getElementById('bankBtn');
const subFinancialDisplay = document.getElementById('subFinancialDisplay');
const wojakImage = document.getElementById('wojakImage');
const faviconLink = document.getElementById('faviconLink');
const buyMaxBtn = document.getElementById('buyMaxBtn');
const sellMaxBtn = document.getElementById('sellMaxBtn');
const vcBtn = document.getElementById('vcBtn');
const vcView = document.getElementById('vc-view');
const backToMainBtn = document.getElementById('back-to-main-btn');

// --- Banking Modal Elements ---
const bankingModal = document.getElementById('bankingModal');
const closeBankingBtn = document.getElementById('closeBankingBtn');
const bankingCashDisplay = document.getElementById('bankingCashDisplay');
const bankingNetWorthDisplay = document.getElementById('bankingNetWorthDisplay');
const currentDebtDisplay = document.getElementById('currentDebtDisplay');
const maxBorrowDisplay = document.getElementById('maxBorrowDisplay');
const bankingAmountInput = document.getElementById('bankingAmountInput');
const borrowBtn = document.getElementById('borrowBtn');
const repayBtn = document.getElementById('repayBtn');

// --- Game State ---
let currentDate = new Date('1990-01-01T00:00:00Z');
let isPaused = false;
let gameInterval;
let activeCompanyDetail = null;
let isMillionaire = false;
let isBillionaire = false;
let isTrillionaire = false;
const jsConfetti = new JSConfetti();
let currentSpeed = 1; 
let wasAutoPaused = false; 
let isGameReady = false;
let currentSort = 'default';
let currentFilter = 'all';

// --- Financial State ---
let cash = 3000;
let portfolio = [];
let netWorth = cash;
let netWorthHistory = [{ x: currentDate.getTime(), y: netWorth }];

// --- Banking State ---
let totalBorrowed = 0;
let lastInterestDate = new Date(currentDate);
const ANNUAL_INTEREST_RATE = 0.07; 

// --- Global Game Constants ---
const GAME_END_YEAR = 2050;

let sim;
let companies = []; 

async function loadCompaniesData() {
    try {
        console.log('Attempting to fetch companies.json and venture_companies.json...');
        const [companiesResponse, ventureCompaniesResponse] = await Promise.all([
            fetch('data/companies.json'),
            fetch('data/venture_companies.json')
        ]);

        console.log('companies.json response status:', companiesResponse.status);
        console.log('venture_companies.json response status:', ventureCompaniesResponse.status);

        if (!companiesResponse.ok) { throw new Error(`HTTP error! status: ${companiesResponse.status} for companies.json`); }
        if (!ventureCompaniesResponse.ok) { throw new Error(`HTTP error! status: ${ventureCompaniesResponse.status} for venture_companies.json`); }

        const rawCompanies = await companiesResponse.json();
        ventureCompanies = await ventureCompaniesResponse.json();
        console.log('Venture companies loaded:', ventureCompanies);

        return new Simulation(rawCompanies);
    } catch (error) {
        console.error("Could not load data:", error);
        alert("Failed to load game data. Please ensure JSON files are in the same directory and a local server is running.");
        return null;
    }
}

// --- Chart Objects ---
let netWorthChart, companyDetailChart;

// --- Formatting ---
const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
function formatLargeNumber(num) {
    if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return currencyFormatter.format(num);
}
function formatDate(date) { return date.toISOString().split('T')[0]; }

// --- Rendering ---
function updateDisplay() {
    let totalAssets = cash;
    portfolio.forEach(holding => {
        const company = companies.find(c => c.name === holding.companyName);
        if (company) {
            totalAssets += company.marketCap * holding.unitsOwned;
        }
    });
    
    netWorthDisplay.textContent = currencyFormatter.format(netWorth);
    netWorthDisplay.style.color = netWorth >= 0 ? '#00c742' : '#dc3545';
    currentDateDisplay.textContent = formatDate(currentDate);
    
    // Update the single display line
    subFinancialDisplay.textContent = `Cash: ${currencyFormatter.format(cash)} | Assets: ${currencyFormatter.format(totalAssets)} | Liabilities: ${currencyFormatter.format(totalBorrowed)}`;
    
    if (netWorth < 0 && totalBorrowed > 0) {
        endGame("bankrupt");
    }
}

function renderCompanies(initial = false) {
    console.log('renderCompanies called. Initial:', initial);
    console.log('Current companies array:', companies);

    if (initial) {
        let filteredCompanies = [...companies];

        // Apply filter
        if (currentFilter !== 'all') {
            if (currentFilter.startsWith('sector_')) {
                const sector = currentFilter.substring(7);
                filteredCompanies = filteredCompanies.filter(c => c.sector === sector);
            }
        }

        console.log('Filtered companies:', filteredCompanies);

        // Apply sort
        if (currentSort === 'marketCapDesc') {
            filteredCompanies.sort((a, b) => b.marketCap - a.marketCap);
        } else if (currentSort === 'ipoDateDesc') {
            filteredCompanies.sort((a, b) => b.ipoDate.getTime() - a.ipoDate.getTime());
        }

        companiesGrid.innerHTML = filteredCompanies.map(company => `
            <div class="company-box" data-company-name="${company.name}">
                <div class="company-name">${company.name}</div>
                <div class="company-info">
                    <div class="company-valuation" data-company-cap="${company.name}">Cap: ${formatLargeNumber(company.displayCap)}</div>
                    <div class="company-sector">${company.sector}</div>
                </div>
            </div>
        `).join('');
    } else {
        // Only update the market cap values
        companies.forEach(company => {
            const capEl = companiesGrid.querySelector(`.company-valuation[data-company-cap="${company.name}"]`);
            if (capEl) {
                capEl.textContent = `Cap: ${formatLargeNumber(company.displayCap)}`;
            }
        });
    }
}

function renderPortfolio() {
    console.log('renderPortfolio called');
    if (portfolio.length === 0) {
        console.log('Portfolio is empty, clearing HTML.');
        portfolioList.innerHTML = '';
        emptyPortfolioMsg.style.display = 'block';
        return;
    }
    emptyPortfolioMsg.style.display = 'none';

    const existingItems = new Map();
    portfolioList.querySelectorAll('.portfolio-item').forEach(item => {
        const companyName = item.querySelector('.company-name').textContent;
        existingItems.set(companyName, item);
    });

    const newPortfolioHtml = [];
    portfolio.forEach(holding => {
        const company = companies.find(c => c.name === holding.companyName);
        if (!company) return;

        const currentValue = company.marketCap * holding.unitsOwned;
        const formattedValue = currencyFormatter.format(currentValue);

        if (existingItems.has(holding.companyName)) {
            // Update existing item
            const item = existingItems.get(holding.companyName);
            item.querySelector('.portfolio-value').textContent = formattedValue;
            existingItems.delete(holding.companyName); // Mark as processed
        } else {
            // Create new item
            console.log(`Adding new portfolio item: ${holding.companyName}`);
            newPortfolioHtml.push(`
                <div class="portfolio-item">
                    <div class="company-name">${holding.companyName}</div>
                    <div class="portfolio-info">
                        Value: <span class="portfolio-value">${formattedValue}</span>
                    </div>
                </div>
            `);
        }
    });

    // Append new items
    if (newPortfolioHtml.length > 0) {
        portfolioList.insertAdjacentHTML('beforeend', newPortfolioHtml.join(''));
    }

    // Remove old items
    if (existingItems.size > 0) {
        console.log('Removing old portfolio items:', Array.from(existingItems.keys()));
        existingItems.forEach(item => {
            item.remove();
        });
    }
}

// --- Utility: Parse user-entered currency/number strings ---
function parseUserAmount(input) {
    if (typeof input !== 'string') input = String(input);
    // Remove everything except digits, decimal point, and minus sign
    input = input.replace(/[^0-9.\-]/g, '');
    // Handle multiple decimals (keep only the first)
    const parts = input.split('.');
    if (parts.length > 2) input = parts[0] + '.' + parts.slice(1).join('');
    return parseFloat(input);
}

// --- Game Logic ---
function updateNetWorth() {
    let totalHoldingsValue = portfolio.reduce((sum, holding) => {
        const company = companies.find(c => c.name === holding.companyName);
        return sum + (company ? company.marketCap * holding.unitsOwned : 0);
    }, 0);
    netWorth = cash + totalHoldingsValue - totalBorrowed;
    netWorthHistory.push({ x: currentDate.getTime(), y: netWorth });
    if (netWorthHistory.length > 2000) netWorthHistory.shift();

    if (netWorth >= 1000000 && !isMillionaire) {
        isMillionaire = true; 
        wojakImage.src = 'wojaks/suit-wojak.png';
        jsConfetti.addConfetti({ emojis: ['💰', '💵'], confettiNumber: 150, emojiSize: 30, });
    }
    if (netWorth >=  1000000000  && !isBillionaire) {
        isBillionaire = true;
        wojakImage.src = 'wojaks/red-suit-wojak.png';
        jsConfetti.addConfetti({ emojis: ['💎','📀'], confettiNumber: 40, emojiSize: 40, });
    }
    if (netWorth >= 1000000000000 && !isTrillionaire) {
        isTrillionaire = true;
        wojakImage.src = 'wojaks/purple-suit-wojak.png';
        jsConfetti.addConfetti({ emojis: ['🌌','🥇','🔮'], confettiNumber: 100, emojiSize: 30, });
        setTimeout(() => { jsConfetti.addConfetti({ emojis: ['🌌','🥇','🔮'], confettiNumber: 100, emojiSize: 30, }); }, 1000); 
        setTimeout(() => { jsConfetti.addConfetti({ emojis: ['🌌','🥇','🔮'], confettiNumber: 100, emojiSize: 30, }); }, 2000); 
    }

    if (netWorth >= 5000000) {
        vcBtn.disabled = false;
        vcBtn.parentElement.classList.remove('disabled');
        
    } else {
        vcBtn.disabled = true;
        vcBtn.parentElement.classList.add('disabled');
    }
}

function calculateInterest() {
    if (totalBorrowed <= 0) return 0;
    const daysSinceLastInterest = (currentDate - lastInterestDate) / (1000 * 60 * 60 * 24);
    const dailyRate = ANNUAL_INTEREST_RATE / 365.25;
    return totalBorrowed * dailyRate * daysSinceLastInterest;
}

function chargeInterest() {
    const interest = calculateInterest();
    if (interest > 0) {
        cash -= interest;
        lastInterestDate = new Date(currentDate);
    }
}

function getMaxBorrowing() {
    // netWorth is already cash + portfolio - totalBorrowed
    return Math.max(0, netWorth * 5 - totalBorrowed);
}

function borrow(amount) {
    amount = parseUserAmount(amount);
    if (isNaN(amount) || amount <= 0) { alert("Please enter a valid amount to borrow."); return; }
    const maxBorrowing = getMaxBorrowing();
    if (amount > maxBorrowing) { alert(`You can only borrow up to ${currencyFormatter.format(maxBorrowing)}.`); return; }
    totalBorrowed += amount;
    cash += amount;
    lastInterestDate = new Date(currentDate); // Reset interest timer on borrow
    updateNetWorth(); updateDisplay(); updateBankingDisplay(); bankingAmountInput.value = '';
}

function repay(amount) {
    amount = parseUserAmount(amount);
    if (isNaN(amount) || amount <= 0) { alert("Please enter a valid amount to repay."); return; }
    if (amount > totalBorrowed) { alert(`You only owe ${currencyFormatter.format(totalBorrowed)}.`); return; }
    if (amount > cash) { alert("You don't have enough cash to repay this amount."); return; }
    totalBorrowed -= amount;
    cash -= amount;
    lastInterestDate = new Date(currentDate); // Reset interest timer on repay
    updateNetWorth(); updateDisplay(); updateBankingDisplay(); bankingAmountInput.value = '';
}

function updateBankingDisplay() {
    const maxBorrowing = getMaxBorrowing();
    bankingCashDisplay.textContent = currencyFormatter.format(cash);
    bankingCashDisplay.className = `stat-value ${cash >= 0 ? 'positive' : 'negative'}`;
    let totalAssets = cash;
    portfolio.forEach(holding => {
        const company = companies.find(c => c.name === holding.companyName);
        if (company) { totalAssets += company.marketCap * holding.unitsOwned; }
    });
    bankingNetWorthDisplay.textContent = currencyFormatter.format(totalAssets);
    bankingNetWorthDisplay.className = `stat-value positive`;
    currentDebtDisplay.textContent = currencyFormatter.format(totalBorrowed);
    currentDebtDisplay.className = `stat-value ${totalBorrowed > 0 ? 'negative' : 'positive'}`;
    maxBorrowDisplay.textContent = currencyFormatter.format(maxBorrowing);
}

function showBankingModal() { updateBankingDisplay(); bankingModal.classList.add('active'); }
function hideBankingModal() { bankingModal.classList.remove('active'); bankingAmountInput.value = ''; }

function endGame(reason) {
    pauseGame();
    let message = "";
    if (reason === "bankrupt") { message = "GAME OVER! You went bankrupt!"; } 
    else if (reason === "timeline_end") { message = `Game Over! You reached ${GAME_END_YEAR}.`; }
    alert(`${message}\nFinal Net Worth: ${currencyFormatter.format(netWorth)}`);
    if (confirm("Play again?")) { location.reload(); }
}

function gameLoop() {
    if (!isGameReady) return;

    if (currentDate.getFullYear() >= GAME_END_YEAR) { endGame("timeline_end"); return; }
    currentDate.setDate(currentDate.getDate() + sim.dtDays);
    
    const companiesBefore = sim.companies.length;
    sim.tick(currentDate);
    const companiesAfter = sim.companies.length;

    // --- Dividend payout to player ---
    portfolio.forEach(holding => {
        const company = companies.find(c => c.name === holding.companyName);
        if (company && company.financialHistory && company.financialHistory.length > 0) {
            const lastYear = company.financialHistory[company.financialHistory.length - 1];
            if (lastYear && lastYear.dividend > 0 && lastYear.year === currentDate.getFullYear() - 1) {
                // Calculate payout for this year (last completed year)
                const playerShare = holding.unitsOwned * lastYear.dividend / company.marketCap;
                cash += playerShare;
            }
        }
    });
    // --- End dividend payout ---

    // If a new company IPO'd, re-render the entire grid
    if (companiesAfter > companiesBefore) {
        companies = sim.companies; // Update the global list
        renderCompanies(true); // Force a full re-render
    } else {
        renderCompanies(false); // Otherwise, just update market caps
    }
    
    if (activeCompanyDetail && activeCompanyDetail.newAnnualData) {
        document.getElementById('financialHistoryContainer').innerHTML = activeCompanyDetail.getFinancialTableHTML();
        activeCompanyDetail.newAnnualData = false;
    }

    chargeInterest();
    updateNetWorth();
    updateDisplay();
    renderPortfolio();
    netWorthChart.update();
    if (companyDetailChart) companyDetailChart.update();
    
    if (activeCompanyDetail) {
        updateInvestmentPanelStats(activeCompanyDetail);
        
        if (activeCompanyDetail.hasPipelineUpdate) {
            updatePipelineDisplay(activeCompanyDetail);
            activeCompanyDetail.hasPipelineUpdate = false; 
        }
    }
}

function buy(companyName, amount) {
    amount = parseUserAmount(amount);
    if (isNaN(amount) || amount <= 0) { alert("Invalid amount."); return; }
    const company = companies.find(c => c.name === companyName);
    if (!company) return;
    if (amount > cash) { alert("Insufficient cash for this purchase."); return; }
    if (company.marketCap < 0.0001) { alert("This company's valuation is too low to purchase right now."); return; }
    cash -= amount;
    const unitsToBuy = amount / company.marketCap;
    let holding = portfolio.find(h => h.companyName === companyName);
    if (holding) { holding.unitsOwned += unitsToBuy; } 
    else { portfolio.push({ companyName: companyName, unitsOwned: unitsToBuy }); }
    updateNetWorth(); updateDisplay(); renderPortfolio(); updateInvestmentPanel(company);
}

function sell(companyName, amount) {
    amount = parseFloat(amount);
    if (isNaN(amount) || amount <= 0) { alert("Invalid amount."); return; }
    const company = companies.find(c => c.name === companyName);
    const holding = portfolio.find(h => h.companyName === companyName);
    if (!company || !holding) { alert("You don't own this stock."); return; }
    const currentValue = company.marketCap * holding.unitsOwned;
    if (amount > currentValue) { alert("You cannot sell more than you own."); return; }
    cash += amount;
    const unitsToSell = (amount / currentValue) * holding.unitsOwned;
    holding.unitsOwned -= unitsToSell;
    if (holding.unitsOwned < 1e-9) {
        portfolio = portfolio.filter(h => h.companyName !== companyName);
    }
    updateNetWorth(); updateDisplay(); renderPortfolio(); updateInvestmentPanel(company);
}

function updateInvestmentPanelStats(company) {
    playerCashDisplay.textContent = currencyFormatter.format(cash);
    const holding = portfolio.find(h => h.companyName === company.name);
    let stakeValue = 0;
    if (holding) { stakeValue = company.marketCap * holding.unitsOwned; }
    playerStakeDisplay.textContent = currencyFormatter.format(stakeValue);
}

function updateInvestmentPanel(company) {
    updateInvestmentPanelStats(company);
    investmentAmountInput.value = '';
}

function showCompanyDetail(company) {
    activeCompanyDetail = company;
    bodyEl.classList.add('detail-active');
    document.getElementById('detailCompanyName').textContent = company.name;
    document.getElementById('detailCompanySector').textContent = company.sector;
    updateInvestmentPanel(company);
    const ctx = document.getElementById('companyDetailChart').getContext('2d');
    if (companyDetailChart) { companyDetailChart.destroy(); }
    companyDetailChart = new Chart(ctx, {
        type: 'line', data: { datasets: [{ label: 'Market Cap', data: company.history, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 2, pointRadius: 0, tension: 0.1, fill: true }]},
        options: { responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, plugins: { legend: { display: false } }, scales: { x: { type: 'time', time: { unit: 'year' } }, y: { ticks: { callback: value => formatLargeNumber(value) } } } }
    });
    document.getElementById('financialHistoryContainer').innerHTML = company.getFinancialTableHTML();
    updatePipelineDisplay(company); // Draw pipeline on view
}

function hideCompanyDetail() {
    activeCompanyDetail = null;
    bodyEl.classList.remove('detail-active');
    if (companyDetailChart) { companyDetailChart.destroy(); companyDetailChart = null; }
}

function pauseGame() {
    if (isPaused) return; 
    isPaused = true;
    clearInterval(gameInterval);
    togglePauseBtn.textContent = 'Resume';
}

function resumeGame() {
    if (!isPaused) return; 
    isPaused = false;
    wasAutoPaused = false; 
    setGameSpeed(currentSpeed);
    togglePauseBtn.textContent = 'Pause';
}

function setGameSpeed(speed) {
    currentSpeed = speed;
    if (!isPaused) {
        clearInterval(gameInterval);
        gameInterval = setInterval(gameLoop, 400 / speed);
    }
    Object.values(speedBtns).forEach(btn => btn.classList.remove('speed-active'));
    if (speed === 0.5) speedBtns.half.classList.add('speed-active');
    if (speed === 1) speedBtns.normal.classList.add('speed-active');
    if (speed === 2) speedBtns.double.classList.add('speed-active');
    if (speed === 4) speedBtns.quad.classList.add('speed-active');
    if (speed === 8) speedBtns.octo.classList.add('speed-active');
}

// --- Event Listeners ---
companiesGrid.addEventListener('click', (event) => {
    const companyBox = event.target.closest('.company-box');
    if (!companyBox) return;
    const companyName = companyBox.dataset.companyName;
    const company = companies.find(c => c.name === companyName);
    if (company) showCompanyDetail(company);
});
backBtn.addEventListener('click', hideCompanyDetail);
buyBtn.addEventListener('click', () => { if (activeCompanyDetail) buy(activeCompanyDetail.name, investmentAmountInput.value); });
sellBtn.addEventListener('click', () => { if (activeCompanyDetail) sell(activeCompanyDetail.name, investmentAmountInput.value); });

// Buy Max: buy as much as possible with available cash
buyMaxBtn.addEventListener('click', () => {
    if (activeCompanyDetail) {
        const company = activeCompanyDetail;
        if (company.marketCap > 0.0001) {
            buy(company.name, cash);
        } else {
            alert("This company's valuation is too low to purchase right now.");
        }
    }
});
// Sell Max: sell all holdings in this company
sellMaxBtn.addEventListener('click', () => {
    if (activeCompanyDetail) {
        const company = activeCompanyDetail;
        const holding = portfolio.find(h => h.companyName === company.name);
        if (holding && holding.unitsOwned > 0) {
            const currentValue = company.marketCap * holding.unitsOwned;
            sell(company.name, currentValue);
        } else {
            alert("You don't own any shares of this company.");
        }
    }
});

togglePauseBtn.addEventListener('click', () => { 
    if (isPaused) {
        resumeGame();
    } else {
        wasAutoPaused = false;
        pauseGame();
    }
});

speedBtns.half.addEventListener('click', () => setGameSpeed(0.5));
speedBtns.normal.addEventListener('click', () => setGameSpeed(1));
speedBtns.double.addEventListener('click', () => setGameSpeed(2));
speedBtns.quad.addEventListener('click', () => setGameSpeed(4));
speedBtns.octo.addEventListener('click', () => setGameSpeed(8));



portfolioList.addEventListener('click', (event) => {
    const portfolioItem = event.target.closest('.portfolio-item');
    if (!portfolioItem) return;
    const companyName = portfolioItem.querySelector('.company-name').textContent;
    const company = companies.find(c => c.name === companyName);
    if (company) showCompanyDetail(company);
});

bankBtn.addEventListener('click', showBankingModal);
closeBankingBtn.addEventListener('click', hideBankingModal);
bankingModal.addEventListener('click', (event) => {
    if (event.target === bankingModal) hideBankingModal();
});
borrowBtn.addEventListener('click', () => borrow(bankingAmountInput.value));
repayBtn.addEventListener('click', () => repay(bankingAmountInput.value));
bankingAmountInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter' && event.target === bankingAmountInput) {
        const amount = bankingAmountInput.value;
        if (amount) borrow(amount);
    }
});

vcBtn.addEventListener('click', () => {
    bodyEl.classList.add('vc-active');
    renderVentureCompanies(ventureCompanies, formatLargeNumber); // Render venture companies when the VC tab is opened
});

backToMainBtn.addEventListener('click', () => {
    bodyEl.classList.remove('vc-active');
});

setMillionaireBtn.addEventListener('click', () => {
    cash = 1000000;
    updateNetWorth();
    updateDisplay();
});

setBillionaireBtn.addEventListener('click', () => {
    cash = 1000000000;
    updateNetWorth();
    updateDisplay();
});

setTrillionaireBtn.addEventListener('click', () => {
    cash = 1000000000000;
    updateNetWorth();
    updateDisplay();
});

function getPipelineHTML(company) {
    let html = '<h3 class="investment-title">Product Pipeline</h3>';

    if (!company.products || company.products.length === 0) {
        html += '<div class="no-pipeline">No product pipeline for this company</div>';
        return html;
    }
    
    company.products.forEach(product => {
        html += `<div class="pipeline-section">
                    <h4 class="product-name-label">${product.label}</h4>
                    <div class="pipeline">`;
        
        let lastStageSucceeded = true;

        product.stages.forEach((stage, index) => {
            let stageClass = 'incomplete';
            let nodeContent = index + 1;

            if (stage.completed) {
                if (stage.succeeded) {
                    stageClass = 'completed';
                    nodeContent = '✓';
                } else {
                    stageClass = 'failed';
                    nodeContent = 'X';
                    lastStageSucceeded = false;
                    // Set a fail timeout if not already set
                    if (!product.resultFailTimeout) {
                        product.resultFailTimeout = Date.now() + 10000;
                        // Schedule a re-render after 10 seconds
                        setTimeout(() => { updatePipelineDisplay(company); }, 10000);
                    }
                }
            } else if (lastStageSucceeded) {
                const done = new Set(product.stages.filter(s => s.completed && s.succeeded).map(s => s.id));
                const canStart = !stage.depends_on || done.has(stage.depends_on);
                if (canStart) {
                    if (typeof stage.success_prob !== 'undefined' && stage.success_prob < 1) {
                        // Orange, pulsing, question mark
                        stageClass = 'completed current current-uncertain';
                        nodeContent = '?';
                    } else if (typeof stage.success_prob !== 'undefined' && stage.success_prob === 1) {
                        // Green, pulsing, stage number
                        stageClass = 'completed current';
                        nodeContent = index + 1;
                    } else {
                        // Default: blue, pulsing, stage number (fallback)
                        stageClass = 'incomplete current';
                        nodeContent = index + 1;
                    }
                }
            }
            
            html += `
                <div class="stage ${stageClass}">
                    <div class="stage-node">${nodeContent}</div>
                    <div class="stage-label">${stage.name}</div>
                </div>
            `;
            
            if (index < product.stages.length - 1) {
                let connectorClass = 'incomplete';
                if (stage.completed) {
                    connectorClass = stage.succeeded ? 'completed' : 'failed';
                }
                html += `<div class="connector ${connectorClass}"></div>`;
            }
        });
        
        // If product failed and 10s have passed, show only 'Result: fail'
        // if (
        //     product.stages.some(s => s.completed && !s.succeeded) &&
        //     product.resultFailTimeout && Date.now() > product.resultFailTimeout
        // ) {
        //     html = `<div class="pipeline-section"><h4 class="product-name-label">${product.label}</h4><div class="pipeline" style="min-height:60px;display:flex;align-items:center;justify-content:center;"><span style="font-size:1.3em;color:#dc3545;font-weight:600;">Result: fail</span></div></div>`;
        // } else {
            html += '</div></div>';
        // }
    });
    
    return html;
}

function updatePipelineDisplay(company) {
    const container = document.getElementById('pipelineContainer');
    if (container) {
        container.innerHTML = getPipelineHTML(company);
    }
}

// --- Initialization ---
async function init() {
    const sortCompaniesSelect = document.getElementById('sortCompanies');
    const filterCompaniesSelect = document.getElementById('filterCompanies');

    sim = await loadCompaniesData();
    if (!sim) { return; }
    companies = sim.companies;

    netWorthChart = new Chart(document.getElementById('netWorthChart').getContext('2d'), {
        type: 'line', data: { datasets: [{ label: 'Net Worth', data: netWorthHistory, borderColor: '#00c742', backgroundColor: 'rgba(0, 199, 66, 0.1)', borderWidth: 2, pointRadius: 0, tension: 0.4, fill: true }] },
        options: { responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, plugins: { legend: { display: false } }, scales: { x: { type: 'time', time: { unit: 'year' } }, y: { ticks: { callback: value => formatLargeNumber(value) } } } }
    });

    renderCompanies(true); // Initial full render
    renderPortfolio();
    updateDisplay();
    
    isGameReady = true;
    setGameSpeed(currentSpeed);
    initVC();

    // Event Listeners for sort and filter dropdowns
    sortCompaniesSelect.addEventListener('change', (event) => {
        currentSort = event.target.value;
        renderCompanies(true); // Re-render with new sort order
    });

    filterCompaniesSelect.addEventListener('change', (event) => {
        currentFilter = event.target.value;
        renderCompanies(true); // Re-render with new filter
    });

}

document.addEventListener('visibilitychange', () => {
    if (document.hidden && !isPaused) {
        wasAutoPaused = true;
        pauseGame();
    } 
    if (!document.hidden && wasAutoPaused) {
        resumeGame();
    }
});

init();
