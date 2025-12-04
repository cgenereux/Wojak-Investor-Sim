(function (global) {
  const DEFAULT_RENDER_INTERVAL = 500;
  const SECTOR_CLASS_MAP = {
    tech: 'sector-tech',
    biotech: 'sector-biotech',
    banking: 'sector-banking',
    manufacturing: 'sector-manufacturing',
    retail: 'sector-retail',
    'consumer staples': 'sector-staples',
    airlines: 'sector-airlines',
    automotive: 'sector-automotive',
    aerospace: 'sector-aerospace',
    defense: 'sector-defense',
    energy: 'sector-energy',
    industrial: 'sector-industrial',
    'real estate': 'sector-realestate',
    web: 'sector-web'
  };
  const SECTOR_CLASS_VALUES = Object.values(SECTOR_CLASS_MAP);

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function encodeDataValue(value = '') {
    try {
      return encodeURIComponent(String(value));
    } catch (err) {
      return String(value || '');
    }
  }

  function getSectorClass(sector = '') {
    const key = String(sector || '').trim().toLowerCase();
    return SECTOR_CLASS_MAP[key] || '';
  }

  function applySectorClass(el, sectorClass = '') {
    if (!el) return;
    SECTOR_CLASS_VALUES.forEach(cls => el.classList.remove(cls));
    if (sectorClass) el.classList.add(sectorClass);
  }

  function ensureCompanyQueueIndex(company, state) {
    if (!company) return;
    if (company.__queueIndex == null) {
      state.companyQueueCounter = (state.companyQueueCounter || 0) + 1;
      company.__queueIndex = state.companyQueueCounter;
    }
  }

  function renderCompanies(options = {}) {
    const {
      companies = [],
      companiesGrid,
      currentFilter = 'all',
      currentSort = 'ipoQueue',
      formatLargeNumber = (value) => value,
      state = {},
      force = false
    } = options;
    if (!companiesGrid) return;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const minInterval = typeof state.minInterval === 'number' ? state.minInterval : DEFAULT_RENDER_INTERVAL;
    if (!force && state.lastRenderTs && (now - state.lastRenderTs) < minInterval) {
      return;
    }
    state.lastRenderTs = now;

    companies.forEach(company => ensureCompanyQueueIndex(company, state));
    let filtered = companies.slice();
    if (currentFilter !== 'all' && currentFilter.startsWith('sector_')) {
      const sector = currentFilter.substring(7);
      filtered = filtered.filter(c => c.sector === sector);
    }

    if (currentSort === 'marketCapDesc') {
      filtered.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
    } else if (currentSort === 'ipoDateDesc') {
      filtered.sort((x, y) => ((y.ipoDate instanceof Date ? y.ipoDate.getTime() : 0) - (x.ipoDate instanceof Date ? x.ipoDate.getTime() : 0)));
    } else if (currentSort === 'sector') {
      const sectorOrder = ['biotech', 'tech', 'web', 'retail', 'banking', 'airlines', 'transportation'];
      filtered.sort((a, b) => {
        const sa = (a.sector || '').toLowerCase();
        const sb = (b.sector || '').toLowerCase();
        const ia = sectorOrder.indexOf(sa);
        const ib = sectorOrder.indexOf(sb);
        if (sa === sb) {
          const aIpo = (a.ipoDate instanceof Date) ? a.ipoDate.getTime() : 0;
          const bIpo = (b.ipoDate instanceof Date) ? b.ipoDate.getTime() : 0;
          if (aIpo !== bIpo) return bIpo - aIpo; // newest first within sector
          ensureCompanyQueueIndex(a, state);
          ensureCompanyQueueIndex(b, state);
          return (a.__queueIndex || 0) - (b.__queueIndex || 0);
        }
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return sa.localeCompare(sb);
      });
    } else if (currentSort === 'ipoQueue') {
      filtered.sort((a, b) => {
        const aIpo = (a.ipoDate instanceof Date) ? a.ipoDate.getTime() : Number.POSITIVE_INFINITY;
        const bIpo = (b.ipoDate instanceof Date) ? b.ipoDate.getTime() : Number.POSITIVE_INFINITY;
        if (aIpo !== bIpo) return aIpo - bIpo; // oldest first
        ensureCompanyQueueIndex(a, state);
        ensureCompanyQueueIndex(b, state);
        return (a.__queueIndex || 0) - (b.__queueIndex || 0);
      });
    }

    // Always push bankrupt companies to the bottom regardless of sort mode
    filtered.sort((a, b) => {
      const aBankrupt = a && a.bankrupt ? 1 : 0;
      const bBankrupt = b && b.bankrupt ? 1 : 0;
      if (aBankrupt === bBankrupt) return 0;
      return aBankrupt - bBankrupt;
    });

    companiesGrid.innerHTML = filtered.map(company => {
      const cap = (Number.isFinite(company.displayCap) && company.displayCap > 0)
        ? company.displayCap
        : (Number.isFinite(company.marketCap) ? company.marketCap : 0);
      const sectorClass = company.bankrupt ? '' : getSectorClass(company.sector);
      const boxClass = company.bankrupt ? 'company-box bankrupt' : `company-box${sectorClass ? ` ${sectorClass}` : ''}`;
      const capLabel = company.bankrupt ? 'Market Cap: Bankrupt' : `Market Cap: ${formatLargeNumber(cap)}`;
      const sectorLabel = company.bankrupt ? 'Status: Bankrupt' : (company.sector || 'Unknown');
      const ipoLabel = company.ipoDate instanceof Date
        ? `${company.ipoDate.getFullYear()}`
        : '';
      const isDoingRnd = !company.bankrupt && Array.isArray(company.products) && company.products.some(p => {
        if (!p || !p.stages) return false;
        // "Conducting R&D" if any stage exists and not all completed
        const stages = Array.isArray(p.stages) ? p.stages : [];
        const allDone = stages.length > 0 && stages.every(s => s && s.completed);
        return !allDone;
      });
      const companyId = company.id || company.name || '';
      const queueIndex = company.__queueIndex || 0;
      const safeId = escapeHtml(companyId);
      const safeName = escapeHtml(company.name || 'Unknown');
      const safeCap = escapeHtml(capLabel);
      const safeSector = escapeHtml(sectorLabel);
      const dataId = encodeDataValue(companyId);
      const dataName = encodeDataValue(company.name || '');
      const safeIpo = escapeHtml(ipoLabel);
      return `
        <div class="${boxClass}" data-company-id="${dataId}" data-company-name="${dataName}" data-company-queue="${queueIndex}">
            ${safeIpo ? `<div class="company-ipo-badge">${safeIpo}</div>` : ''}
            <div class="company-name">${safeName}</div>
            <div class="company-info">
                <div class="company-valuation" data-company-cap="${safeId}">${safeCap}</div>
                <div class="company-sector${sectorClass ? ` ${sectorClass}` : ''}">${safeSector}</div>
            </div>
            ${isDoingRnd ? `<div class="company-rnd-flag">Conducting R&amp;D…</div>` : ''}
        </div>`;
    }).join('');

    const boxes = companiesGrid.querySelectorAll('.company-box');
    boxes.forEach((box) => {
      const name = box.getAttribute('data-company-name');
      if (state.hoveredCompanyName === name) {
        box.classList.add('hovered');
      }
      box.addEventListener('pointerenter', () => {
        state.hoveredCompanyName = name;
        box.classList.add('hovered');
      });
      box.addEventListener('pointerleave', () => {
        if (state.hoveredCompanyName === name) state.hoveredCompanyName = null;
        box.classList.remove('hovered');
      });
    });
  }

  function renderPortfolio(options = {}) {
    const {
      portfolio = [],
      companies = [],
      ventureSim = null,
      portfolioList,
      emptyPortfolioMsg,
      currencyFormatter = { format: (value) => `$${value}` },
      serverPlayer = null,
      isServerAuthoritative = false,
      playerId = null
    } = options;
    if (!portfolioList || !emptyPortfolioMsg) return;

    const activePlayerId = playerId || (serverPlayer && serverPlayer.id) || null;
    const pickPlayerEquityFraction = (detail, vcId) => {
      if (serverPlayer && serverPlayer.ventureHoldings && Number.isFinite(serverPlayer.ventureHoldings[vcId])) {
        return serverPlayer.ventureHoldings[vcId];
      }
      if (activePlayerId && detail && detail.playerEquityById && Number.isFinite(detail.playerEquityById[activePlayerId])) {
        return detail.playerEquityById[activePlayerId];
      }
      return (detail && Number.isFinite(detail.playerEquity)) ? detail.playerEquity : 0;
    };
    const pickPlayerPendingCommitment = (detail, vcId) => {
      if (serverPlayer && serverPlayer.ventureCommitments && Number.isFinite(serverPlayer.ventureCommitments[vcId])) {
        return serverPlayer.ventureCommitments[vcId];
      }
      if (activePlayerId && detail && detail.pendingCommitments && Number.isFinite(detail.pendingCommitments[activePlayerId])) {
        return detail.pendingCommitments[activePlayerId];
      }
      return (detail && Number.isFinite(detail.pendingCommitment)) ? detail.pendingCommitment : 0;
    };

    const hasPublicHoldings = portfolio.length > 0;
    const ventureSummaries = ventureSim ? ventureSim.getCompanySummaries() : [];
    const hasPrivateHoldings = ventureSummaries.some(summary => {
      if (!summary || !ventureSim) return false;
      const detail = ventureSim.getCompanyDetail(summary.id);
      if (!detail) return false;
      const equityFraction = pickPlayerEquityFraction(detail, summary.id);
      const pending = pickPlayerPendingCommitment(detail, summary.id);
      return equityFraction > 0 || pending > 0;
    }) || (!!serverPlayer && isServerAuthoritative && serverPlayer.ventureCommitments && Object.keys(serverPlayer.ventureCommitments).length > 0);

    if (!hasPublicHoldings && !hasPrivateHoldings) {
      portfolioList.innerHTML = '';
      emptyPortfolioMsg.style.display = 'block';
      return;
    }
    emptyPortfolioMsg.style.display = 'none';

    const existingItems = new Map();
    const processedKeys = new Set();
    portfolioList.querySelectorAll('.portfolio-item').forEach(item => {
      const key = item.dataset.portfolioKey || item.querySelector('.company-name').textContent;
      existingItems.set(key, item);
    });

    const newPortfolioHtml = [];
    portfolio.forEach(holding => {
      const company = companies.find(c => c.name === holding.companyName);
      if (!company) return;
      const sectorClass = getSectorClass(company.sector);
      const currentValue = company.marketCap * holding.unitsOwned;
      const formattedValue = currencyFormatter.format(currentValue);
      const key = `public:${holding.companyName}`;
      processedKeys.add(key);
      if (existingItems.has(key)) {
        const item = existingItems.get(key);
        item.querySelector('.portfolio-value').textContent = formattedValue;
        applySectorClass(item, sectorClass);
        existingItems.delete(key);
      } else {
        newPortfolioHtml.push(`
          <div class="portfolio-item${sectorClass ? ` ${sectorClass}` : ''}" data-portfolio-type="public" data-portfolio-key="${key}">
              <div class="company-name">${holding.companyName}</div>
              <div class="portfolio-info">
                  Value: <span class="portfolio-value">${formattedValue}</span>
              </div>
          </div>
        `);
      }
    });

    ventureSummaries.forEach(summary => {
      if (!summary || !ventureSim) return;
      const detail = ventureSim.getCompanyDetail(summary.id);
      if (!detail) return;
      const valuation = Number.isFinite(detail?.valuation) ? detail.valuation : (Number.isFinite(summary?.valuation) ? summary.valuation : 0);
      const equityFraction = pickPlayerEquityFraction(detail, summary.id);
      const pendingCommitment = pickPlayerPendingCommitment(detail, summary.id);
      const hasEquity = equityFraction > 0;
      const hasPending = pendingCommitment > 0;
      const isInFlight = hasPending && !hasEquity;
      if (!hasEquity && !hasPending) return;
      const equityValue = hasEquity ? equityFraction * valuation : 0;
      const pendingValue = !hasEquity && hasPending ? pendingCommitment : 0;
      const formattedValue = hasEquity ? currencyFormatter.format(equityValue) : (hasPending ? currencyFormatter.format(pendingValue) : '');
      const pendingLabel = (!isInFlight && hasPending) ? `Committed: ${currencyFormatter.format(pendingCommitment)}` : '';
      const key = `private:${summary.id}`;
      processedKeys.add(key);
      const playerEquityPct = equityFraction * 100;
      const stakeLabel = hasEquity ? `${playerEquityPct.toFixed(2)}% stake` : 'Stake pending';
      const stageLabel = detail.stageLabel || summary.stageLabel || 'Private';
      const nameLabel = isInFlight ? `${summary.name} (${stageLabel}) (In Flight)` : `${summary.name} (${stageLabel})`;
      const sectorClass = getSectorClass(detail.sector || summary.sector);
      const valueRowDisplay = (hasEquity || hasPending) ? 'block' : 'none';
      if (existingItems.has(key)) {
        const item = existingItems.get(key);
        const valueRow = item.querySelector('.portfolio-value-row');
        if (valueRow) valueRow.style.display = valueRowDisplay;
        const valueEl = item.querySelector('.portfolio-value');
        if (valueEl) valueEl.textContent = formattedValue;
        const stakeEl = item.querySelector('.portfolio-stake');
        if (stakeEl) stakeEl.textContent = stakeLabel;
        const pendingEl = item.querySelector('.portfolio-pending');
        if (pendingEl) {
          pendingEl.textContent = pendingLabel;
          pendingEl.style.display = (!isInFlight && hasPending) ? 'block' : 'none';
        }
        const nameEl = item.querySelector('.company-name');
        if (nameEl) {
          nameEl.textContent = nameLabel;
        }
        applySectorClass(item, sectorClass);
        existingItems.delete(key);
      } else {
        newPortfolioHtml.push(`
          <div class="portfolio-item${sectorClass ? ` ${sectorClass}` : ''}" data-portfolio-type="private" data-venture-id="${summary.id}" data-portfolio-key="${key}">
              <div class="company-name">${nameLabel}</div>
              <div class="portfolio-info">
                  <div class="portfolio-value-row" style="display:${valueRowDisplay}">
                      Value: <span class="portfolio-value">${formattedValue}</span>
                  </div>
                  <span class="portfolio-stake">${stakeLabel}</span>
                  <span class="portfolio-pending" style="display:${(!isInFlight && hasPending) ? 'block' : 'none'}">${pendingLabel}</span>
              </div>
          </div>
        `);
      }
    });

    // Server-authoritative fallback: show commitments/equity even if ventureSim is missing them
    if (isServerAuthoritative && serverPlayer) {
      const holdingsEntries = serverPlayer.ventureHoldings ? Object.entries(serverPlayer.ventureHoldings) : [];
      holdingsEntries.forEach(([vcId, pct]) => {
        const pctNum = Number(pct) || 0;
        if (pctNum <= 0) return;
        const key = `private:${vcId}`;
        if (processedKeys.has(key)) return;
        const nameLabel = `${vcId} (Private)`;
        const stakeLabel = `${(pctNum * 100).toFixed(2)}% stake`;
        const value = (serverPlayer.ventureEquity && serverPlayer.ventureEquity > 0)
          ? (serverPlayer.ventureEquity / Math.max(1, holdingsEntries.length))
          : 0;
        const valueStr = value > 0 ? currencyFormatter.format(value) : '';
        newPortfolioHtml.push(`
          <div class="portfolio-item" data-portfolio-type="private" data-venture-id="${vcId}" data-portfolio-key="${key}">
              <div class="company-name">${nameLabel}</div>
              <div class="portfolio-info">
                  <div class="portfolio-value-row" style="display:${valueStr ? 'block' : 'none'}">
                      Value: <span class="portfolio-value">${valueStr}</span>
                  </div>
                  <span class="portfolio-stake">${stakeLabel}</span>
                  <span class="portfolio-pending" style="display:none"></span>
              </div>
          </div>
        `);
      });
      if (serverPlayer.ventureCommitments) {
        Object.entries(serverPlayer.ventureCommitments).forEach(([vcId, amount]) => {
          if (!amount || amount <= 0) return;
          const key = `private:${vcId}`;
          if (processedKeys.has(key)) return; // Prevent duplicates
          const nameLabel = `${vcId} (Private) (In Flight)`;
          if (existingItems.has(key)) {
            const item = existingItems.get(key);
            const nameEl = item.querySelector('.company-name');
            if (nameEl) nameEl.textContent = nameLabel;
            const valueEl = item.querySelector('.portfolio-value');
            if (valueEl) valueEl.textContent = currencyFormatter.format(amount);
            const valueRow = item.querySelector('.portfolio-value-row');
            if (valueRow) valueRow.style.display = 'block';
            const pendingEl = item.querySelector('.portfolio-pending');
            if (pendingEl) {
              pendingEl.textContent = '';
              pendingEl.style.display = 'none';
            }
            const stakeEl = item.querySelector('.portfolio-stake');
            if (stakeEl) stakeEl.textContent = 'Stake pending';
            existingItems.delete(key);
            return;
          }
          newPortfolioHtml.push(`
            <div class="portfolio-item" data-portfolio-type="private" data-venture-id="${vcId}" data-portfolio-key="${key}">
                <div class="company-name">${nameLabel}</div>
                <div class="portfolio-info">
                    <div class="portfolio-value-row" style="display:block">
                        Value: <span class="portfolio-value">${currencyFormatter.format(amount)}</span>
                    </div>
                    <span class="portfolio-stake">Stake pending</span>
                    <span class="portfolio-pending" style="display:none"></span>
                </div>
            </div>
          `);
        });
      }
    }

    if (newPortfolioHtml.length > 0) {
      portfolioList.insertAdjacentHTML('beforeend', newPortfolioHtml.join(''));
    }

    if (existingItems.size > 0) {
      existingItems.forEach(item => item.remove());
    }
  }

  global.DashboardRenderers = {
    renderCompanies,
    renderPortfolio
  };
})(typeof globalThis !== 'undefined'
  ? globalThis
  : (typeof window !== 'undefined' ? window : this));
