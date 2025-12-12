(function (global) {
    const toNumber = (value, fallback = 0) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    };

    const cloneDate = (dateLike) => {
        if (dateLike instanceof Date) return new Date(dateLike.getTime());
        if (dateLike == null) return null;
        const d = new Date(dateLike);
        return Number.isNaN(d.getTime()) ? null : d;
    };

    const makeGameState = (init = {}) => ({
        currentDate: cloneDate(init.currentDate) || null,
        currentSpeed: toNumber(init.currentSpeed, 1),
        isPaused: !!init.isPaused,
        isGameReady: !!init.isGameReady,
        gameEnded: !!init.gameEnded,
        wasAutoPaused: !!init.wasAutoPaused
    });

    const makePlayerState = (init = {}) => ({
        cash: toNumber(init.cash, 3000),
        debt: toNumber(init.debt, 0),
        // Keep a direct reference to the portfolio array so legacy code that mutates
        // holdings in-place stays in sync during this incremental refactor.
        portfolio: Array.isArray(init.portfolio) ? init.portfolio : [],
        dripEnabled: !!init.dripEnabled,
        netWorth: toNumber(init.netWorth, toNumber(init.cash, 3000)),
        netWorthHistory: Array.isArray(init.netWorthHistory) ? init.netWorthHistory : []
    });

    const makeUiState = (init = {}) => ({
        view: init.view || 'market',
        activeCompanyId: init.activeCompanyId ?? null,
        activeVentureId: init.activeVentureId ?? null,
        sort: init.sort || 'sector',
        filter: init.filter || 'all'
    });

    const store = {
        game: makeGameState(),
        player: makePlayerState(),
        ui: makeUiState(),
        init(init = {}) {
            this.game = makeGameState(init.game);
            this.player = makePlayerState(init.player);
            this.ui = makeUiState(init.ui);
            return this;
        },
        getSnapshot() {
            const p = this.player;
            return {
                game: { ...this.game },
                player: {
                    ...p,
                    portfolio: Array.isArray(p.portfolio) ? p.portfolio.map(h => ({ ...h })) : [],
                    netWorthHistory: Array.isArray(p.netWorthHistory) ? p.netWorthHistory.slice() : []
                },
                ui: { ...this.ui }
            };
        }
    };

    const reducers = {
        setGameState(partial = {}) {
            if (!partial || typeof partial !== 'object') return;
            const g = store.game;
            if (partial.currentDate != null) g.currentDate = cloneDate(partial.currentDate);
            if (partial.currentSpeed != null) g.currentSpeed = toNumber(partial.currentSpeed, g.currentSpeed);
            if (typeof partial.isPaused === 'boolean') g.isPaused = partial.isPaused;
            if (typeof partial.isGameReady === 'boolean') g.isGameReady = partial.isGameReady;
            if (typeof partial.gameEnded === 'boolean') g.gameEnded = partial.gameEnded;
            if (typeof partial.wasAutoPaused === 'boolean') g.wasAutoPaused = partial.wasAutoPaused;
        },
        setPlayerState(partial = {}) {
            if (!partial || typeof partial !== 'object') return;
            const p = store.player;
            if (partial.cash != null) p.cash = toNumber(partial.cash, p.cash);
            if (partial.debt != null) p.debt = Math.max(0, toNumber(partial.debt, p.debt));
            if (Array.isArray(partial.portfolio)) p.portfolio = partial.portfolio;
            if (typeof partial.dripEnabled === 'boolean') p.dripEnabled = partial.dripEnabled;
            if (partial.netWorth != null) p.netWorth = toNumber(partial.netWorth, p.netWorth);
            if (Array.isArray(partial.netWorthHistory)) p.netWorthHistory = partial.netWorthHistory;
        },
        setUiState(partial = {}) {
            if (!partial || typeof partial !== 'object') return;
            const u = store.ui;
            if (partial.view) u.view = partial.view;
            if (partial.activeCompanyId !== undefined) u.activeCompanyId = partial.activeCompanyId;
            if (partial.activeVentureId !== undefined) u.activeVentureId = partial.activeVentureId;
            if (partial.sort) u.sort = partial.sort;
            if (partial.filter) u.filter = partial.filter;
        },
        setDate(dateLike) {
            this.setGameState({ currentDate: dateLike });
        },
        setPaused(paused) {
            this.setGameState({ isPaused: !!paused });
        },
        setSpeed(speed) {
            this.setGameState({ currentSpeed: speed });
        },
        applyCashDelta(delta) {
            const p = store.player;
            const d = toNumber(delta, 0);
            if (!d) return p.cash;
            p.cash = toNumber(p.cash, 0) + d;
            return p.cash;
        },
        setCash(value) {
            const p = store.player;
            p.cash = toNumber(value, p.cash);
            return p.cash;
        },
        applyDebtDelta(delta) {
            const p = store.player;
            const d = toNumber(delta, 0);
            if (!d) return p.debt;
            p.debt = Math.max(0, toNumber(p.debt, 0) + d);
            return p.debt;
        },
        setDebt(value) {
            const p = store.player;
            p.debt = Math.max(0, toNumber(value, p.debt));
            return p.debt;
        },
        setPortfolio(portfolioArray) {
            if (Array.isArray(portfolioArray)) {
                store.player.portfolio = portfolioArray;
            }
            return store.player.portfolio;
        },
        upsertPublicHolding(companyName, unitsDelta) {
            const name = (companyName || '').toString();
            if (!name) return null;
            const delta = toNumber(unitsDelta, 0);
            if (!delta) return null;
            const list = store.player.portfolio;
            const idx = list.findIndex(h => h && h.companyName === name);
                if (idx >= 0) {
                    const holding = list[idx];
                    holding.unitsOwned = toNumber(holding.unitsOwned, 0) + delta;
                if (holding.unitsOwned <= 1e-15) {
                        list.splice(idx, 1);
                    }
                    return holding;
                }
            const holding = { companyName: name, unitsOwned: delta };
            list.push(holding);
            return holding;
        },
        removePublicHolding(companyName) {
            const name = (companyName || '').toString();
            if (!name) return store.player.portfolio;
            store.player.portfolio = store.player.portfolio.filter(h => h && h.companyName !== name);
            return store.player.portfolio;
        }
    };

    store.reducers = reducers;
    global.WojakState = store;
})(typeof globalThis !== 'undefined' ? globalThis : window);
