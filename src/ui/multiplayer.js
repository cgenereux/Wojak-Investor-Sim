(function (global) {
    // Multiplayer and character-selection helpers extracted from main.js
    function ensureConnectionBanner() {
        // Banner removed by user request
    }

    function setConnectionStatus(text, tone = 'info') {
        console.log(`[Multiplayer Status] ${text} (${tone})`);
    }

    function setBannerButtonsVisible(show) {
        // Banner removed
    }

    function requestResync(reason = 'manual') {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            setConnectionStatus('Resync unavailable (disconnected)', 'warn');
            return;
        }
        setConnectionStatus('Resyncing...', 'warn');
        ws.send(JSON.stringify({ type: 'resync', reason }));
    }

    function disconnectMultiplayer() {
        manualDisconnect = true;
        startGameRequested = false;
        startGameSent = false;
        matchStarted = false;
        shouldPromptCharacterAfterConnect = false;
        pendingPartyAction = null;
        hideCharacterOverlay();
        activeBackendUrl = null;
        activeSessionId = null;
        try {
            localStorage.removeItem(BACKEND_URL_KEY);
            localStorage.removeItem(SESSION_ID_KEY);
        } catch (err) {
            console.warn('Failed clearing multiplayer prefs', err);
        }
        latestServerPlayers = [];
        lastRosterSnapshot = [];
        if (leadAvatarName) leadAvatarName.textContent = '';
        if (partyAvatars) partyAvatars.innerHTML = '';
        if (ws) {
            try { ws.close(); } catch (err) { /* ignore */ }
            ws = null;
        }
        if (wsHeartbeat) { clearInterval(wsHeartbeat); wsHeartbeat = null; }
        isServerAuthoritative = false;
        resetCharacterToDefault();
        setConnectionStatus('Offline', 'warn');
        setBannerButtonsVisible(false);
        if (speedSliderWrap) speedSliderWrap.style.display = '';
        if (multiplayerBtnContainer) multiplayerBtnContainer.style.display = '';
        if (multiplayerStatusDisplay) multiplayerStatusDisplay.style.display = 'none';
    }

    function killRemoteSession() {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            setConnectionStatus('Kill failed (disconnected)', 'error');
            return;
        }
        setConnectionStatus('Killing session...', 'warn');
        sendCommand({ type: 'kill_session' });
        manualDisconnect = true;
        setBannerButtonsVisible(false);
    }

    async function connectWebSocket() {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            sendStartGameIfReady();
            return; // Already connected/connecting
        }
        if (manualDisconnect) {
            console.warn('Manual disconnect set; skipping WS connect');
            return;
        }
        const baseBackend = activeBackendUrl || window.WOJAK_BACKEND_URL || DEFAULT_WS_ORIGIN || '';
        const backendUrl = normalizeHttpUrl(baseBackend) || '';
        if (!backendUrl) {
            console.warn('WOJAK_BACKEND_URL not set; skipping WS connect');
            return;
        }
        const session = activeSessionId || localStorage.getItem(SESSION_ID_KEY) || 'default';
        activeSessionId = session;
        isServerAuthoritative = true;
        ensureConnectionBanner();
        setConnectionStatus('Connecting...', 'warn');
        const storedName = localStorage.getItem('wojak_player_name');
        if (storedName) ensurePlayerIdentity(storedName);
        let playerId = clientPlayerId || localStorage.getItem('wojak_player_id');
        if (!playerId) {
            playerId = `p_${Math.floor(Math.random() * 1e9).toString(36)}`;
            try { localStorage.setItem('wojak_player_id', playerId); } catch (err) { /* ignore */ }
        }
        // Reset flag; we'll let the server tell us if a real conflict remains
        lastNameTaken = false;
        clientPlayerId = playerId;
        const roleParam = isPartyHostClient ? 'host' : 'guest';
        const wsOrigin = baseBackend.startsWith('ws') ? baseBackend : backendUrl.replace(/^http/, 'ws');
        const wsUrl = `${wsOrigin}/ws?session=${encodeURIComponent(session)}&player=${encodeURIComponent(playerId)}&role=${roleParam}`;
        // Attempt to wake the backend (helps with cold starts)
        wakeBackend(backendUrl);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
        }
        const currentGen = ++wsGeneration;
        try {
            ws = new WebSocket(wsUrl);
        } catch (err) {
            console.error('WS connect failed:', err);
            setConnectionStatus('WS connect failed', 'error');
            return;
        }
        ws.onopen = () => {
            if (currentGen !== wsGeneration) return;
            console.log('WS connected');
            setConnectionStatus('Connected', 'ok');
            setBannerButtonsVisible(true);
            if (speedSliderWrap) speedSliderWrap.style.display = 'none';
            if (multiplayerBtnContainer) multiplayerBtnContainer.style.display = 'none';
            if (multiplayerStatusDisplay) multiplayerStatusDisplay.style.display = 'block';
            if (mpSessionIdDisplay) mpSessionIdDisplay.textContent = activeSessionId || 'default';
            lastNameTaken = false;
            sendStartGameIfReady();
            if (selectedCharacter) {
                try { ws.send(JSON.stringify({ type: 'set_character', character: selectedCharacter })); } catch (err) { /* ignore */ }
            }
            if (wsHeartbeat) clearInterval(wsHeartbeat);
            wsHeartbeat = setInterval(() => {
                if (!ws || ws.readyState !== WebSocket.OPEN) return;
                try {
                    ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
                } catch (err) {
                    /* ignore */
                }
            }, 15000);
        };
        ws.onclose = (evt) => {
            if (currentGen !== wsGeneration) return;
            if (evt.code === 4004) {
                if (mpJoinError) {
                    mpJoinError.textContent = 'Party not found';
                    mpJoinError.classList.add('visible');
                }
                shouldPromptCharacterAfterConnect = false;
                pendingPartyAction = null;
                hideCharacterOverlay();
                manualDisconnect = true;
                isServerAuthoritative = false;
                activeSessionId = null;
                try {
                    localStorage.removeItem(SESSION_ID_KEY);
                } catch (err) { /* ignore */ }
                setConnectionStatus('Party not found', 'error');
                // Don't reset the whole modal, just let them try again
                return;
            }
            if (evt.code === 4005 && (evt.reason === 'name_taken' || evt.reason === '')) {
                if (mpNameError) {
                    mpNameError.textContent = 'Name taken. Try a different name.';
                    mpNameError.classList.add('visible');
                }
                if (mpJoinError) mpJoinError.classList.remove('visible');
                mpJoinCodeInput && mpJoinCodeInput.classList.remove('input-error');
                mpNameInput && mpNameInput.classList.add('input-error');
                if (mpNameInput) {
                    mpNameInput.focus();
                    mpNameInput.select();
                }
                shouldPromptCharacterAfterConnect = false;
                pendingPartyAction = null;
                hideCharacterOverlay();
                setMultiplayerState('join');
                manualDisconnect = true; // prevent auto-reconnect loop; user will retry after changing name
                isServerAuthoritative = false;
                lastNameTaken = true;
                try {
                    localStorage.removeItem('wojak_player_id');
                } catch (err) { /* ignore */ }
                if (wsHeartbeat) { clearInterval(wsHeartbeat); wsHeartbeat = null; }
                ws = null;
                setConnectionStatus('Name taken. Pick another name.', 'error');
                return;
            }
            if (evt.code === 4001) {
                setConnectionStatus('Reconnecting...', 'warn');
                if (!manualDisconnect) {
                    setTimeout(connectWebSocket, 500);
                }
                return;
            }
            if (evt.code === 4009) {
                setConnectionStatus('Server full. Try again later.', 'error');
                shouldPromptCharacterAfterConnect = false;
                pendingPartyAction = null;
                hideCharacterOverlay();
                manualDisconnect = true;
                isServerAuthoritative = false;
                if (wsHeartbeat) { clearInterval(wsHeartbeat); wsHeartbeat = null; }
                ws = null;
                return;
            }
            if (evt.code === 4006) {
                if (mpNameError) {
                    mpNameError.textContent = `Invalid name (max ${MAX_NAME_LENGTH} chars)`;
                    mpNameError.classList.add('visible');
                }
                mpNameInput && mpNameInput.classList.add('input-error');
                if (mpNameInput) {
                    mpNameInput.focus();
                    mpNameInput.select();
                }
                shouldPromptCharacterAfterConnect = false;
                pendingPartyAction = null;
                hideCharacterOverlay();
                manualDisconnect = true; // prevent auto-reconnect loop; user will retry
                isServerAuthoritative = false;
                if (wsHeartbeat) { clearInterval(wsHeartbeat); wsHeartbeat = null; }
                ws = null;
                setConnectionStatus('Invalid name', 'error');
                return;
            }
            if (evt.code === 4010) {
                if (mpJoinError) {
                    mpJoinError.textContent = 'Match already started. Joining is closed.';
                    mpJoinError.classList.add('visible');
                }
                setMultiplayerState('join');
                shouldPromptCharacterAfterConnect = false;
                pendingPartyAction = null;
                hideCharacterOverlay();
                manualDisconnect = true;
                isServerAuthoritative = false;
                if (wsHeartbeat) { clearInterval(wsHeartbeat); wsHeartbeat = null; }
                ws = null;
                setConnectionStatus('Match already started', 'error');
                return;
            }
            console.warn('WS closed, retrying in 2s', evt?.code, evt?.reason || '');
            setConnectionStatus('Reconnecting...', 'warn');
            if (wsHeartbeat) { clearInterval(wsHeartbeat); wsHeartbeat = null; }
            if (!manualDisconnect) {
                setTimeout(connectWebSocket, 2000);
            } else {
                setConnectionStatus('Disconnected', 'warn');
                setBannerButtonsVisible(false);
            }
            ws = null;
        };
        ws.onerror = (err) => {
            if (currentGen !== wsGeneration) return;
            console.error('WS error', err);
            setConnectionStatus('Connection error', 'error');
        };
        ws.onmessage = (event) => {
            if (currentGen !== wsGeneration) return;
            try {
                const msg = JSON.parse(event.data);
                handleServerMessage(msg);
            } catch (err) {
                console.error('Bad WS message', err);
            }
        };
    }

    function handleServerMessage(msg) {
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'idle_warning') {
            alert(msg.message || 'Session idle, closing soon.');
            return;
        }
        if (msg.type === 'error') {
            if (msg.error === 'name_taken') {
                if (mpNameError) {
                    mpNameError.textContent = 'Name taken. Try a different name.';
                    mpNameError.classList.add('visible');
                }
                if (mpNameInput) {
                    mpNameInput.classList.add('input-error');
                    mpNameInput.focus();
                    mpNameInput.select();
                }
                shouldPromptCharacterAfterConnect = false;
                pendingPartyAction = null;
                hideCharacterOverlay();
                setMultiplayerState('join');
                manualDisconnect = true;
                isServerAuthoritative = false;
                lastNameTaken = true;
                try {
                    localStorage.removeItem('wojak_player_id');
                } catch (err) { /* ignore */ }
                setConnectionStatus('Name taken. Pick another name.', 'error');
                if (ws) {
                    try { ws.close(); } catch (err) { /* ignore */ }
                }
            }
            if (msg.error === 'match_started') {
                if (mpJoinError) {
                    mpJoinError.textContent = 'Match already started. Joining is closed.';
                    mpJoinError.classList.add('visible');
                }
                setMultiplayerState('join');
                if (mpNameInput) {
                    mpNameInput.classList.remove('input-error');
                }
                manualDisconnect = true;
                isServerAuthoritative = false;
                setConnectionStatus('Match already started', 'error');
                if (ws) {
                    try { ws.close(); } catch (err) { /* ignore */ }
                }
            }
            if (msg.error === 'invalid_name') {
                if (mpNameError) {
                    mpNameError.textContent = `Invalid name (max ${MAX_NAME_LENGTH} chars)`;
                    mpNameError.classList.add('visible');
                }
                if (mpNameInput) {
                    mpNameInput.classList.add('input-error');
                    mpNameInput.focus();
                    mpNameInput.select();
                }
                manualDisconnect = true;
                isServerAuthoritative = false;
                setConnectionStatus('Invalid name', 'error');
                if (ws) {
                    try { ws.close(); } catch (err) { /* ignore */ }
                }
            }
            if (msg.error === 'server_full') {
                setConnectionStatus('Server full. Try again later.', 'error');
                manualDisconnect = true;
                isServerAuthoritative = false;
                if (ws) {
                    try { ws.close(); } catch (err) { /* ignore */ }
                }
            }
            return;
        }
        if (msg.type === 'players_update') {
            const roster = setRosterFromServer(Array.isArray(msg.players) ? msg.players : []);
            // If we are in join state and have players, show the roster
            if (multiplayerState === 'join' && mpPlayersListJoin) {
                const panel = mpPlayersListJoin.closest('.mp-roster-panel');
                if (panel) panel.style.display = 'block';
            }
            return;
        }
        if (msg.type === 'snapshot') {
            matchStarted = !!msg.started;
            hydrateFromSnapshot(msg);
            applyTicks(msg.ticks || []);
            setConnectionStatus('Synced', 'ok');
            currentHostId = msg.hostId || currentHostId;
            if (Array.isArray(msg.players)) {
                setRosterFromServer(msg.players);
            }
            // Show roster on snapshot too
            if (multiplayerState === 'join' && mpPlayersListJoin) {
                const panel = mpPlayersListJoin.closest('.mp-roster-panel');
                if (panel) panel.style.display = 'block';
            }
            return;
        }
        if (msg.type === 'resync') {
            if (msg.snapshot) {
                hydrateFromSnapshot({ ...msg.snapshot, player: msg.player, ticks: msg.ticks });
                applyTicks(msg.ticks || []);
            }
            setConnectionStatus('Resynced', 'ok');
            if (msg.hostId) {
                currentHostId = msg.hostId;
            }
            if (Array.isArray(msg.snapshot?.players)) {
                setRosterFromServer(msg.snapshot.players);
            }
            return;
        }
        if (msg.type === 'tick') {
            if (!matchStarted) {
                matchStarted = true;
            }
            applyTick(msg);
            setConnectionStatus('Live', 'ok');
            return;
        }
        if (msg.type === 'match_started') {
            setConnectionStatus('Live', 'ok');
            startGameRequested = false;
            startGameSent = false;
            matchStarted = true;
            currentHostId = msg.hostId || currentHostId;
            if (startPartyBtn) {
                startPartyBtn.disabled = true;
                startPartyBtn.textContent = 'Started';
            }
            hideMultiplayerModal();
            // Host-only to avoid duplicate match_started events
            const isHostClient = isPartyHostClient || (clientPlayerId && msg.hostId && clientPlayerId === msg.hostId);
            if (isHostClient) {
                const playerNames = Array.isArray(latestServerPlayers)
                    ? latestServerPlayers.map(p => p?.id || p?.name).filter(Boolean)
                    : [];
                trackEvent('match_started', {
                    mode: 'multiplayer',
                    player_count: playerNames.length,
                    player_names: playerNames,
                    match_id: activeSessionId || 'default',
                    host_id: msg.hostId || null
                });
            }
            return;
        }
        if (msg.type === 'command_result') {
            if (!msg.ok) {
                console.warn('Command failed', msg.error);
                if (startGameRequested) {
                    startGameRequested = false;
                    startGameSent = false;
                    if (startPartyBtn) {
                        startPartyBtn.disabled = false;
                        startPartyBtn.textContent = 'Start Game';
                    }
                    if (msg.error === 'not_host') {
                        alert('Only the host can start the match.');
                    } else if (msg.error === 'unknown_command') {
                        // Fallback: assume server auto-starts; mark as started locally and resync
                        matchStarted = true;
                        if (startPartyBtn) {
                            startPartyBtn.disabled = true;
                            startPartyBtn.textContent = 'Started';
                        }
                        sendCommand({ type: 'resync' });
                        hideMultiplayerModal();
                    } else {
                        alert('Failed to start game.');
                    }
                }
            }
            if (msg.ok && msg.data && msg.data.type === 'resync' && msg.data.snapshot) {
                hydrateFromSnapshot({ ...msg.data.snapshot, player: msg.player });
                applyTicks(msg.data.ticks || []);
                setConnectionStatus('Resynced', 'ok');
                if (netWorthChart) netWorthChart.update();
                return;
            }
            if (msg.ok && msg.data && msg.data.type === 'start_game') {
                startGameRequested = false;
                startGameSent = false;
                matchStarted = true;
                if (startPartyBtn) {
                    startPartyBtn.disabled = true;
                    startPartyBtn.textContent = 'Started';
                }
                hideMultiplayerModal();
            }
            if (msg.player) {
                updatePlayerFromServer(msg.player);
            }
            updateNetWorth();
            updateDisplay();
            renderPortfolio();
            if (activeCompanyDetail) {
                updateInvestmentPanel(activeCompanyDetail);
            }
            if (netWorthChart) netWorthChart.update();
            return;
        }
        if (msg.type === 'end') {
            const finalNetWorth = (serverPlayer && typeof serverPlayer.netWorth === 'number') ? serverPlayer.netWorth : netWorth;
            const playerNames = Array.isArray(latestServerPlayers)
                ? latestServerPlayers.map(p => p?.id || p?.name).filter(Boolean)
                : [];
            trackEvent('match_ended', {
                mode: 'multiplayer',
                final_net_worth: finalNetWorth,
                reason: msg.reason || 'session_end',
                match_id: activeSessionId || 'default',
                player_id: clientPlayerId || null,
                player_count: playerNames.length || null,
                player_names: playerNames
            });
            manualDisconnect = true;
            if (ws) {
                try { ws.close(); } catch (err) { /* ignore */ }
            }
            setConnectionStatus('Session ended', 'error');
            setBannerButtonsVisible(false);
            alert(`Game ended (${msg.reason || 'session end'}). Final year: ${msg.year || ''}`);
            resetCharacterToDefault();
            setTimeout(() => window.location.reload(), 300);
            return;
        }
        if (msg.type === 'error') {
            console.warn('Server error', msg.error);
        }
    }

    function normalizeHttpUrl(url) {
        if (!url) return '';
        if (url.startsWith('ws:')) return url.replace(/^ws/, 'http');
        if (url.startsWith('wss:')) return url.replace(/^wss/, 'https');
        return url;
    }

    async function wakeBackend(url) {
        const httpUrl = normalizeHttpUrl(url);
        if (!httpUrl) return;
        try {
            await fetch(`${httpUrl.replace(/\/$/, '')}/health`, { method: 'GET', cache: 'no-store' });
        } catch (err) {
            console.warn('Backend wake ping failed', err);
        }
    }

    function sanitizePlayerName(name) {
        if (!name) return '';
        return name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
    }

    function isNameTaken(name) {
        const roster = Array.isArray(latestServerPlayers) && latestServerPlayers.length ? latestServerPlayers : lastRosterSnapshot;
        if (!name || !Array.isArray(roster) || roster.length === 0) return false;
        const target = sanitizePlayerName(name).toLowerCase();
        if (!target) return false;
        const selfIds = new Set(
            [clientPlayerId, cachedPlayerName]
                .map(n => sanitizePlayerName(n || '').toLowerCase())
                .filter(Boolean)
        );
        return roster.some(p => {
            if (!p) return false;
            const candidates = [];
            if (typeof p.id === 'string') candidates.push(sanitizePlayerName(p.id).toLowerCase());
            if (typeof p.name === 'string') candidates.push(sanitizePlayerName(p.name).toLowerCase());
            return candidates.some(pid => pid && !selfIds.has(pid) && pid === target);
        });
    }

    function setNameErrorVisible(show, message = '') {
        if (!mpNameError) return;
        if (show && message) {
            mpNameError.textContent = message;
        } else if (!message) {
            mpNameError.textContent = 'Name taken';
        }
        mpNameError.classList.toggle('visible', !!show);
    }

    function makePlayerIdFromName(name) {
        const clean = sanitizePlayerName(name);
        return clean || null;
    }

    function ensurePlayerIdentity(name) {
        const cleaned = sanitizePlayerName(name);
        if (!cleaned) return null;
        cachedPlayerName = cleaned;
        storedPlayerName = cleaned;
        localStorage.setItem('wojak_player_name', cleaned);
        const pid = makePlayerIdFromName(cleaned) || `p_${Math.floor(Math.random() * 1e9).toString(36)}`;
        localStorage.setItem('wojak_player_id', pid);
        clientPlayerId = pid;
        if (window.posthog) {
            window.posthog.identify(cleaned);
        }
        return pid;
    }

    function requirePlayerName() {
        if (!mpNameInput) return 'Player';
        const rawTrimmed = (mpNameInput.value || '').trim().replace(/\s+/g, ' ');
        if (rawTrimmed.length > MAX_NAME_LENGTH) {
            mpNameInput.classList.add('input-error');
            setNameErrorVisible(true, `Name too long (max ${MAX_NAME_LENGTH} chars)`);
            return null;
        }
        let name = sanitizePlayerName(rawTrimmed);
        if (!name) {
            mpNameInput.classList.add('input-error');
            setNameErrorVisible(true, 'Enter a display name');
            mpNameInput.focus();
            return null;
        }
        if (isNameTaken(name)) {
            mpNameInput.classList.add('input-error');
            setNameErrorVisible(true, 'Name taken');
            return null;
        }
        // A fresh, valid name clears any stale "name taken" state
        lastNameTaken = false;
        mpNameInput.classList.remove('input-error');
        setNameErrorVisible(false);
        ensurePlayerIdentity(name);
        return name;
    }

    function setMultiplayerState(state) {
        multiplayerState = state;
        // multiplayerIdleState removed from HTML
        if (multiplayerJoinState) multiplayerJoinState.classList.toggle('active', state === 'join');
        if (multiplayerCreateState) multiplayerCreateState.classList.toggle('active', state === 'create');
        if (state === 'join' && mpJoinCodeInput) {
            mpJoinCodeInput.focus();
            mpJoinCodeInput.select();
            // Hide roster initially until connected
            if (mpPlayersListJoin) {
                const panel = mpPlayersListJoin.closest('.mp-roster-panel');
                if (panel) panel.style.display = 'none';
            }
            mpJoinCodeInput.classList.remove('input-error');
            if (mpJoinError) mpJoinError.classList.remove('visible');
        }
        if (characterOverlay) {
            hideCharacterOverlay();
        }
        if (leadAvatarName) {
            if (state === 'join' || state === 'create') {
                renderLeadAvatarName(latestServerPlayers);
            } else {
                leadAvatarName.textContent = '';
            }
        }
    }

    function renderLobbyPlayers(players = []) {
        const lists = [mpPlayersListHost, mpPlayersListJoin].filter(Boolean);
        if (!lists.length) return;
        const shouldRender = Array.isArray(players) && players.length > 0;
        const html = shouldRender
            ? players.map((p) => {
                const name = p && p.id ? p.id : 'Player';
                return `<li><span class="mp-player-dot"></span><span class="mp-player-name">${name}</span></li>`;
            }).join('')
            : '<li class="mp-player-placeholder">Waiting for players...</li>';
        lists.forEach(list => { list.innerHTML = html; });
    }

    function startLobbyRefresh() {
        stopLobbyRefresh();
        renderLobbyPlayers(latestServerPlayers);
        lobbyRefreshTimer = setInterval(() => {
            renderLobbyPlayers(latestServerPlayers);
            if (ws && ws.readyState === WebSocket.OPEN) {
                sendCommand({ type: 'resync' });
            }
        }, 2000);
    }

    function stopLobbyRefresh() {
        if (lobbyRefreshTimer) {
            clearInterval(lobbyRefreshTimer);
            lobbyRefreshTimer = null;
        }
    }

    function resetMultiplayerModal() {
        if (mpJoinCodeInput) mpJoinCodeInput.value = '';
        if (mpPartyCodeDisplay) mpPartyCodeDisplay.value = '';
        if (mpNameInput) {
            mpNameInput.classList.remove('input-error');
            const placeholder = NAME_PLACEHOLDERS[Math.floor(Math.random() * NAME_PLACEHOLDERS.length)] || '';
            mpNameInput.placeholder = placeholder || 'Bloomer4000';
            mpNameInput.value = '';
        }
        if (mpNameError) mpNameError.classList.remove('visible');
        if (mpJoinError) mpJoinError.classList.remove('visible');
        latestServerPlayers = [];
        lastRosterSnapshot = [];
        lastGeneratedPartyCode = '';
        startGameRequested = false;
        startGameSent = false;
        isPartyHostClient = false;
        matchStarted = false;
        manualDisconnect = false;
        updateCharacterLocksFromServer([]);
        renderLobbyPlayers([]);
        if (startPartyBtn) {
            startPartyBtn.disabled = false;
            startPartyBtn.textContent = 'Start Game';
        }
        setMultiplayerState('idle');
        hideCharacterOverlay();
        pendingPartyAction = null;
        shouldPromptCharacterAfterConnect = false;
        if (partyAvatars) partyAvatars.innerHTML = '';
        if (leadAvatarName) leadAvatarName.textContent = '';
    }

    function attemptJoinParty() {
        if (!mpJoinCodeInput) return;
        const name = requirePlayerName();
        if (!name) return;
        const sessionId = (mpJoinCodeInput.value || '').trim().toUpperCase();
        if (!sessionId) {
            mpJoinCodeInput.focus();
            return;
        }
        if (!isValidPartyCode(sessionId)) {
            mpJoinCodeInput.classList.add('input-error');
            if (mpJoinError) {
                mpJoinError.textContent = 'Invalid party code';
                mpJoinError.classList.add('visible');
            }
            return;
        }
        if (mpJoinError) mpJoinError.classList.remove('visible');
        isPartyHostClient = false;
        pendingPartyAction = null;
        shouldPromptCharacterAfterConnect = true;
        lastNameTaken = false;
        hideCharacterOverlay();
        applyBackendAndSession(DEFAULT_BACKEND_URL, sessionId || 'default');
        connectWebSocket();
    }

    function handleCreateParty() {
        const name = requirePlayerName();
        if (!name) return;
        const createAction = () => {
            const code = generatePartyCode();
            lastGeneratedPartyCode = code;
            isPartyHostClient = true;
            if (mpPartyCodeDisplay) {
                mpPartyCodeDisplay.value = code;
            }
            setMultiplayerState('create');
            applyBackendAndSession(DEFAULT_BACKEND_URL, code);
            connectWebSocket();
            renderLobbyPlayers([]);
        };
        showCharacterOverlay(createAction);
    }

    async function handleCopyPartyCode() {
        if (!mpPartyCodeDisplay || !copyPartyCodeBtn) return;
        const code = (mpPartyCodeDisplay.value || '').trim();
        if (!code) return;
        const previousText = copyPartyCodeBtn.textContent;
        try {
            await navigator.clipboard.writeText(code);
            copyPartyCodeBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyPartyCodeBtn.textContent = previousText || 'Copy';
            }, 1200);
        } catch (err) {
            console.warn('Copy failed', err);
            copyPartyCodeBtn.textContent = previousText || 'Copy';
        }
    }

    function handleStartParty() {
        const code = lastGeneratedPartyCode || (mpPartyCodeDisplay ? mpPartyCodeDisplay.value.trim() : '');
        if (!code) return;
        const name = requirePlayerName();
        if (!name) return;
        isPartyHostClient = true;
        startGameRequested = true;
        startGameSent = false;
        if (startPartyBtn) {
            startPartyBtn.disabled = true;
            startPartyBtn.textContent = 'Starting...';
        }
        applyBackendAndSession(DEFAULT_BACKEND_URL, code);
        if (ws && ws.readyState === WebSocket.OPEN) {
            sendStartGameIfReady();
        } else {
            connectWebSocket();
        }
    }

    function showCharacterOverlay(nextAction) {
        if (!characterOverlay) {
            if (typeof nextAction === 'function') nextAction();
            return;
        }
        pendingPartyAction = nextAction;
        characterOptionButtons.forEach(btn => btn.classList.remove('selected'));
        updateCharacterLocksFromServer(latestServerPlayers || []);
        characterOverlay.classList.add('active');
    }

    function hideCharacterOverlay() {
        if (!characterOverlay) return;
        characterOverlay.classList.remove('active');
        characterOptionButtons.forEach(btn => btn.classList.remove('selected'));
    }

    function sendStartGameIfReady() {
        if (!startGameRequested || startGameSent) return;
        if (ws && ws.readyState === WebSocket.OPEN) {
            sendCommand({ type: 'start_game' });
            startGameSent = true;
        }
    }

    function applyBackendAndSession(backend, sessionId) {
        activeBackendUrl = backend || DEFAULT_BACKEND_URL;
        activeSessionId = sessionId || 'default';
        localStorage.setItem(BACKEND_URL_KEY, activeBackendUrl);
        localStorage.setItem(SESSION_ID_KEY, activeSessionId);
        manualDisconnect = false;
        resetDecadeTracking();
        currentHostId = null;
        latestServerPlayers = [];
        if (playerNetWorthSeries && typeof playerNetWorthSeries.clear === 'function') {
            playerNetWorthSeries.clear();
        }
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            try { ws.close(); } catch (err) { /* ignore */ }
            ws = null;
        }
    }

    function updateCharacterLocksFromServer(players) {
        if (!characterOptionButtons || !characterOptionButtons.length) return;
        if (!Array.isArray(players)) {
            characterOptionButtons.forEach(btn => {
                btn.classList.remove('locked');
                btn.disabled = false;
            });
            return;
        }
        const takenSet = new Set();
        players.forEach(p => {
            const charKey = (p && typeof p.character === 'string' && p.character) ? String(p.character).toLowerCase() : null;
            if (!charKey) return;
            if (clientPlayerId && p.id && p.id === clientPlayerId) return; // don't lock out our own current pick
            takenSet.add(charKey);
        });
        characterOptionButtons.forEach(btn => {
            const key = (btn.dataset.character || '').toLowerCase();
            const locked = takenSet.has(key);
            btn.classList.toggle('locked', locked);
            btn.disabled = locked;
        });
    }

    function updatePlayerColors(players) {
        if (!Array.isArray(players)) return;
        playerColorMap.clear();
        players.forEach((p, idx) => {
            if (!p || !p.id) return;
            const charKey = (p.character || '').toLowerCase();
            const colorFromCharacter = CHARACTER_COLORS[charKey] || null;
            const pickableExtras = EXTRA_PLAYER_COLORS.length ? EXTRA_PLAYER_COLORS : BASE_PLAYER_COLORS;
            const baseColor = idx < BASE_PLAYER_COLORS.length ? BASE_PLAYER_COLORS[idx] : null;
            const color = colorFromCharacter
                ? colorFromCharacter
                : (baseColor || pickColorById(p.id, pickableExtras));
            playerColorMap.set(p.id, color);
        });
    }

    function resetCharacterToDefault() {
        selectedCharacter = 'wojak';
        try {
            localStorage.setItem(SELECTED_CHARACTER_KEY, 'wojak');
        } catch (err) { /* ignore */ }
        applySelectedCharacter({ character: 'wojak' });
    }

    function getPlayerAvatarSrc(playerLabel) {
        if (!playerLabel) return null;
        const roster = Array.isArray(latestServerPlayers) && latestServerPlayers.length ? latestServerPlayers : lastRosterSnapshot;
        if (!Array.isArray(roster)) return null;
        // Match by ID or Name (case-insensitive fallback)
        const match = roster.find(p => {
            const pid = (p?.id || '').toLowerCase();
            const pname = (p?.name || '').toLowerCase();
            const label = playerLabel.toLowerCase();
            return pid === label || pname === label;
        });
        if (!match || !match.character) {
            // console.debug('[AvatarLookup] Missing character for', playerLabel);
            return CHARACTER_SPRITES['wojak'] || null;
        }
        const key = String(match.character).toLowerCase();
        return CHARACTER_SPRITES[key] || null;
    }

    function renderPartyAvatars(roster = latestServerPlayers) {
        const headerContent = document.querySelector('.header-content');
        if (headerContent) {
            if (Array.isArray(roster) && roster.length >= 4) {
                headerContent.classList.add('many-players');
            } else {
                headerContent.classList.remove('many-players');
            }
        }

        if (!partyAvatars) return;
        if (!Array.isArray(roster) || roster.length <= 1) {
            if (partyAvatars.innerHTML !== '') {
                partyAvatars.innerHTML = '';
                partyAvatars._lastHtml = '';
            }
            return;
        }
        const others = roster.filter(p => p && p.id && p.id !== clientPlayerId);
        if (!others.length) {
            if (partyAvatars.innerHTML !== '') {
                partyAvatars.innerHTML = '';
                partyAvatars._lastHtml = '';
            }
            return;
        }
        const html = others.map((p) => {
            const avatarSrc = getPlayerAvatarSrc(p.id || p.name) || CHARACTER_SPRITES['wojak'];
            const rawLabel = p.id || p.name || 'Player';
            const label = escapeHtml(rawLabel);
            const color = getPlayerColor(p.id);
            return `<div class="party-avatar" title="${label}">
                        <img src="${avatarSrc}" alt="${label}">
                        <div class="party-avatar-name">
                            <span class="party-avatar-dot" style="background:${color};"></span>
                            <span class="party-avatar-label">${label}</span>
                        </div>
                    </div>`;
        }).join('');

        if (partyAvatars._lastHtml === html) return;
        partyAvatars.innerHTML = html;
        partyAvatars._lastHtml = html;
    }

    function renderLeadAvatarName(roster = latestServerPlayers) {
        if (!leadAvatarName) return;
        if (!Array.isArray(roster) || roster.length === 0) {
            if (leadAvatarName.textContent !== '') {
                leadAvatarName.textContent = '';
                leadAvatarName._lastHtml = '';
            }
            return;
        }
        const nameRaw = storedPlayerName || clientPlayerId || '';
        if (!nameRaw) {
            if (leadAvatarName.textContent !== '') {
                leadAvatarName.textContent = '';
                leadAvatarName._lastHtml = '';
            }
            return;
        }
        const color = getPlayerColor(clientPlayerId);
        const label = escapeHtml(nameRaw);
        const html = `<span class="lead-avatar-dot" style="background:${color};"></span><span class="lead-avatar-label">${label}</span>`;

        if (leadAvatarName._lastHtml === html) return;
        leadAvatarName.innerHTML = html;
        leadAvatarName._lastHtml = html;
    }

    function promptCharacterIfPending() {
        if (!shouldPromptCharacterAfterConnect) return;
        if (characterOverlay && characterOverlay.classList.contains('active')) return;
        shouldPromptCharacterAfterConnect = false;
        showCharacterOverlay();
    }

    function setLocalCharacterSelection(characterKey) {
        if (!characterKey) return;
        selectedCharacter = characterKey;
        try {
            localStorage.setItem(SELECTED_CHARACTER_KEY, characterKey);
        } catch (err) { /* ignore */ }
        applySelectedCharacter({ character: characterKey });
        // Mirror into local roster so lock styling updates for self
        if (Array.isArray(latestServerPlayers) && clientPlayerId) {
            latestServerPlayers = latestServerPlayers.map(p => {
                if (p && p.id === clientPlayerId) {
                    return { ...p, character: characterKey };
                }
                return p;
            });
            updateCharacterLocksFromServer(latestServerPlayers);
        }
        if (ws && ws.readyState === WebSocket.OPEN && isServerAuthoritative) {
            try {
                ws.send(JSON.stringify({ type: 'set_character', character: characterKey }));
            } catch (err) { /* ignore */ }
        }
    }

    function mergeLocalCharacter(players) {
        if (!Array.isArray(players) || !selectedCharacter || !clientPlayerId) return players;
        return players.map(p => {
            if (p && p.id === clientPlayerId) {
                return { ...p, character: selectedCharacter };
            }
            return p;
        });
    }

    function setRosterFromServer(players) {
        const roster = Array.isArray(players)
            ? mergeLocalCharacter(players).map(p => {
                if (!p) return p;
                return {
                    ...p,
                    character: p.character || null
                };
            })
            : [];
        console.debug('[RosterUpdate] Received players:', roster.length, roster.map(p => p.id || p.name));
        latestServerPlayers = roster;
        lastRosterSnapshot = roster;
        updatePlayerColors(roster);
        renderPlayerLeaderboard(roster);
        updateCharacterLocksFromServer(roster);
        renderLobbyPlayers(roster);
        renderPartyAvatars(roster);
        renderLeadAvatarName(roster);
        promptCharacterIfPending();
        return roster;
    }

    // Expose
    global.MultiplayerModule = {
        ensureConnectionBanner,
        setConnectionStatus,
        setBannerButtonsVisible,
        requestResync,
        disconnectMultiplayer,
        killRemoteSession,
        connectWebSocket,
        handleServerMessage,
        normalizeHttpUrl,
        wakeBackend,
        sanitizePlayerName,
        isNameTaken,
        setNameErrorVisible,
        makePlayerIdFromName,
        ensurePlayerIdentity,
        requirePlayerName,
        showCharacterOverlay,
        hideCharacterOverlay,
        sendStartGameIfReady,
        renderLobbyPlayers,
        startLobbyRefresh,
        stopLobbyRefresh,
        resetMultiplayerModal,
        applyBackendAndSession,
        attemptJoinParty,
        handleCreateParty,
        handleCopyPartyCode,
        handleStartParty,
        updateCharacterLocksFromServer,
        updatePlayerColors,
        resetCharacterToDefault,
        getPlayerAvatarSrc,
        renderPartyAvatars,
        renderLeadAvatarName,
        promptCharacterIfPending,
        setLocalCharacterSelection,
        mergeLocalCharacter,
        setRosterFromServer
    };
})(window);
