(function (global) {
  const DEFAULT_RENDER_INTERVAL = 500;
  const SECTOR_CLASS_MAP = {
    // Technology and web-style
    tech: 'sector-tech',
    technology: 'sector-tech',
    web: 'sector-web',
    aerospace: 'sector-aerospace',
    semiconductor: 'sector-tech',
    'rocket technology': 'sector-aerospace',
    rockets: 'sector-aerospace',

    // Bio / health
    biotech: 'sector-biotech',
    'bio tech': 'sector-biotech',

    // Finance / banking / real estate
    banking: 'sector-banking',
    finance: 'sector-banking',
    'real estate': 'sector-realestate',

    // Industrial / materials
    manufacturing: 'sector-manufacturing',
    industrial: 'sector-industrial',
    automotive: 'sector-automotive',
    materials: 'sector-industrial',

    // Retail / staples
    retail: 'sector-retail',
    'consumer staples': 'sector-staples',

    // Travel & transport
    airlines: 'sector-airlines',
    travel: 'sector-airlines',
    transportation: 'sector-airlines',
    'travel & transport': 'sector-airlines',

    // Defense / energy
    defense: 'sector-defense',
    energy: 'sector-energy'
  };
  const SECTOR_CLASS_VALUES = Object.values(SECTOR_CLASS_MAP);

  const SUBSECTOR_CLASS_MAP = {
    'web technology': 'subsector-web-tech',
    'hardware technology': 'subsector-hardware-tech',
    'aerospace technology': 'subsector-aero-tech',
    'material technology': 'subsector-material-tech',
    'space technology': 'subsector-space-tech'
  };
  const SUBSECTOR_CLASS_VALUES = Object.values(SUBSECTOR_CLASS_MAP);

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

  function getSubsectorClass(subsector = '') {
    const key = String(subsector || '').trim().toLowerCase();
    return SUBSECTOR_CLASS_MAP[key] || '';
  }

  function applySubsectorClass(el, subsectorClass = '') {
    if (!el) return;
    SUBSECTOR_CLASS_VALUES.forEach(cls => el.classList.remove(cls));
    if (subsectorClass) el.classList.add(subsectorClass);
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
      const sectorOrder = [
        'biotech',
        // Technologies cluster
        'technology',
        'tech',
        'web',
        // Energy
        'energy',
        // Finance
        'finance',
        'banking',
        // Retail / consumer
        'retail',
        // Industrial + related
        'industrial',
        'manufacturing',
        'automotive',
        'materials',
        'airlines',
        'transportation',
        'travel',
        'travel & transport'
      ];
      const techSubsectorOrder = [
        'space technology',
        'aerospace technology',
        'material technology',
        'materials technology',
        'hardware technology',
        'web technology',
        'technology'          // plain Technology / no subsector
      ];
      const pickTechSubsectorIndex = (company) => {
        const sectorKey = String(company.sector || '').trim().toLowerCase();
        if (sectorKey !== 'technology' && sectorKey !== 'tech') return 0;
        const sub = String(company.subsector || '').trim().toLowerCase() || 'technology';
        const idx = techSubsectorOrder.indexOf(sub);
        return idx >= 0 ? idx : 0;
      };
      filtered.sort((a, b) => {
        const sa = (a.sector || '').toLowerCase();
        const sb = (b.sector || '').toLowerCase();
        const ia = sectorOrder.indexOf(sa);
        const ib = sectorOrder.indexOf(sb);
        if (sa === sb) {
          // Within Technology, order by subsector: Tech -> Web Tech -> Hardware -> Materials -> Aerospace.
          if (sa === 'technology' || sa === 'tech') {
            const subA = pickTechSubsectorIndex(a);
            const subB = pickTechSubsectorIndex(b);
            if (subA !== subB) return subA - subB;
          }
          const aIpo = (a.ipoDate instanceof Date) ? a.ipoDate.getTime() : 0;
          const bIpo = (b.ipoDate instanceof Date) ? b.ipoDate.getTime() : 0;
          if (aIpo !== bIpo) return bIpo - aIpo; // newest first within (sub)sector
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
      const subsectorClass = company.bankrupt ? '' : getSubsectorClass(company.subsector);
      const boxClass = company.bankrupt
        ? 'company-box bankrupt'
        : `company-box${sectorClass ? ` ${sectorClass}` : ''}${subsectorClass ? ` ${subsectorClass}` : ''}`;
      const capLabel = company.bankrupt ? 'Market Cap: Bankrupt' : `Market Cap: ${formatLargeNumber(cap)}`;
      const rawSectorLabel = company.subsector || company.sector || 'Unknown';
      const sectorLabel = company.bankrupt ? 'Status: Bankrupt' : rawSectorLabel;
      const ipoLabel = company.ipoDate instanceof Date
        ? `${company.ipoDate.getFullYear()}`
        : '';
      const isDoingRnd = !company.bankrupt && Array.isArray(company.products) && company.products.some(p => {
        if (!p) return false;
        const stages = Array.isArray(p.stages) ? p.stages : [];
        const meta = p.__pipelineMeta || {};
        // If the product's pipeline has been resolved/retired/failed, it's no longer R&D-active.
        const status = typeof meta.status === 'string' ? meta.status.toLowerCase() : '';
        if (meta.resolved || meta.retired || status === 'failed') return false;
        if (stages.length === 0) return false;
        // R&D is active if at least one stage has not yet completed.
        return stages.some(s => s && !s.completed);
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
    const isMpAuthoritative = !!isServerAuthoritative;
    const pickPlayerEquityFraction = (detail, vcId) => {
      // Multiplayer: trust authoritative per-player holdings from the server
      if (isMpAuthoritative && serverPlayer && serverPlayer.ventureHoldings && Number.isFinite(serverPlayer.ventureHoldings[vcId])) {
        return serverPlayer.ventureHoldings[vcId];
      }
      // Singleplayer: fall back to legacy single-player field if present
      if (!isMpAuthoritative && detail && Number.isFinite(detail.playerEquity)) {
        return detail.playerEquity;
      }
      return 0;
    };
    const pickPlayerPendingCommitment = (detail, vcId) => {
      // Multiplayer: trust authoritative per-player commitments from the server
      if (isMpAuthoritative && serverPlayer && serverPlayer.ventureCommitments && Number.isFinite(serverPlayer.ventureCommitments[vcId])) {
        return serverPlayer.ventureCommitments[vcId];
      }
      // Singleplayer: fall back to aggregate pendingCommitment if present
      if (!isMpAuthoritative && detail && Number.isFinite(detail.pendingCommitment)) {
        return detail.pendingCommitment;
      }
      return 0;
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

    const rows = [];

    portfolio.forEach(holding => {
      const company = companies.find(c => c.name === holding.companyName);
      if (!company) return;
      const isBankrupt = !!company.bankrupt;
      const sectorClass = getSectorClass(company.sector);
      const subsectorClass = getSubsectorClass(company.subsector);
      const units = Number(holding.unitsOwned) || 0;
      const cap = Number(company.marketCap) || 0;
      const currentValue = isBankrupt ? 0 : cap * units;
      const formattedValue = currencyFormatter.format(currentValue);
      const key = `public:${holding.companyName}`;
      const bankruptClass = isBankrupt ? ' bankrupt' : '';
      const companyNameDisplay = isBankrupt ? `${holding.companyName} (Failed)` : holding.companyName;
      const statusLabel = isBankrupt ? 'Status: Bankrupt' : '';
      const sectorDisplay = isBankrupt ? '' : (company.subsector || company.sector || '');
      const ipoYear = (!isBankrupt && company.ipoDate) ? new Date(company.ipoDate).getFullYear() : null;

      rows.push({
        sortValue: currentValue,
        html: `
          <div class="portfolio-item${sectorClass ? ` ${sectorClass}` : ''}${subsectorClass ? ` ${subsectorClass}` : ''}${bankruptClass}" data-portfolio-type="public" data-portfolio-key="${key}" data-company-name="${holding.companyName}">
              ${ipoYear ? `<div class="portfolio-ipo-badge">${ipoYear}</div>` : ''}
              <div class="company-name">${companyNameDisplay}</div>
              <div class="portfolio-info">
                  <span class="portfolio-status" style="display:${isBankrupt ? 'block' : 'none'}">${statusLabel}</span>
                  Value: <span class="portfolio-value">${formattedValue}</span>
                  <div class="portfolio-sector" style="display:${isBankrupt ? 'none' : 'block'}">${sectorDisplay}</div>
              </div>
          </div>
        `
      });
    });

    ventureSummaries.forEach(summary => {
      if (!summary || !ventureSim) return;
      const detail = ventureSim.getCompanyDetail(summary.id);
      if (!detail) return;
      const valuation = Number.isFinite(detail?.valuation)
        ? detail.valuation
        : (Number.isFinite(summary?.valuation) ? summary.valuation : 0);
      const equityFraction = pickPlayerEquityFraction(detail, summary.id);
      const pendingCommitment = pickPlayerPendingCommitment(detail, summary.id);
      const hasEquity = equityFraction > 0;
      const hasPending = pendingCommitment > 0;
      const isFailed = (detail.status || '').toLowerCase() === 'failed'
        || (summary.status || '').toLowerCase() === 'failed';
      const wasBankruptcyVictim = isFailed
        && detail.bankruptcyAffectedPlayers
        && activePlayerId
        && detail.bankruptcyAffectedPlayers[activePlayerId];
      if (!hasEquity && !hasPending && !wasBankruptcyVictim) return;

      const equityValue = hasEquity ? equityFraction * valuation : 0;
      const pendingValue = hasPending ? pendingCommitment : 0;
      const stageLabel = detail.stageLabel || summary.stageLabel || 'Private';
      const sectorClass = getSectorClass(detail.sector || summary.sector);
      const bankruptClass = isFailed ? ' bankrupt' : '';
      const statusLabel = isFailed ? 'Status: Bankrupt' : '';

      if (hasEquity || wasBankruptcyVictim || isFailed) {
        const mainKey = `private:${summary.id}:main`;
        const playerEquityPct = equityFraction * 100;
        const equityFormatted = isFailed
          ? currencyFormatter.format(0)
          : (hasEquity ? currencyFormatter.format(equityValue) : '');
        const stakeLabel = isFailed
          ? ''
          : (hasEquity
            ? `${playerEquityPct.toFixed(2)}% stake`
            : (wasBankruptcyVictim ? 'Investment failed' : 'Stake pending'));
        const valueRowDisplay = (hasEquity || wasBankruptcyVictim || isFailed) ? 'block' : 'none';
        const stakeDisplay = isFailed ? 'none' : 'block';
        const nameLabel = isFailed ? `${summary.name} (Failed)` : `${summary.name} (${stageLabel})`;

        rows.push({
          sortValue: isFailed ? 0 : equityValue,
          html: `
            <div class="portfolio-item${sectorClass ? ` ${sectorClass}` : ''}${bankruptClass}" data-portfolio-type="private" data-venture-id="${summary.id}" data-portfolio-key="${mainKey}">
                <div class="company-name">${nameLabel}</div>
                <div class="portfolio-info">
                    <span class="portfolio-status" style="display:${isFailed ? 'block' : 'none'}">${statusLabel}</span>
                    <div class="portfolio-value-row" style="display:${valueRowDisplay}">
                        Value: <span class="portfolio-value">${equityFormatted}</span>
                    </div>
                    <span class="portfolio-stake" style="display:${stakeDisplay}">${stakeLabel}</span>
                    <span class="portfolio-pending" style="display:none"></span>
                </div>
            </div>
          `
        });
      }

      if (hasPending) {
        const inflightKey = `private:${summary.id}:inflight`;
        const inflightStageLabel = summary.nextStageLabel || stageLabel;
        const inflightName = `${summary.name} (${inflightStageLabel}) (In Flight)`;
        const inflightValue = currencyFormatter.format(pendingValue);
        const pendingLabel = `Committed: ${inflightValue}`;

        rows.push({
          sortValue: pendingValue,
          html: `
            <div class="portfolio-item${sectorClass ? ` ${sectorClass}` : ''}" data-portfolio-type="private" data-venture-id="${summary.id}" data-portfolio-key="${inflightKey}">
                <div class="company-name">${inflightName}</div>
                <div class="portfolio-info">
                    <span class="portfolio-status" style="display:none"></span>
                    <div class="portfolio-value-row" style="display:block">
                        Value: <span class="portfolio-value">${inflightValue}</span>
                    </div>
                    <span class="portfolio-stake" style="display:block">Stake pending</span>
                    <span class="portfolio-pending" style="display:block">${pendingLabel}</span>
                </div>
            </div>
          `
        });
      }
    });

    rows.sort((a, b) => b.sortValue - a.sortValue);
    portfolioList.innerHTML = rows.map(row => row.html).join('');
  }

  global.DashboardRenderers = {
    renderCompanies,
    renderPortfolio,
    getSectorClass,
    applySectorClass,
    getSubsectorClass,
    applySubsectorClass
  };
})(typeof globalThis !== 'undefined'
  ? globalThis
  : (typeof window !== 'undefined' ? window : this));
