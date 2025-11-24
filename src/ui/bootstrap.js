(function () {
    function startGame() {
        if (typeof init === 'function') {
            init();
        }
        if (typeof dripToggle !== 'undefined' && dripToggle) {
            dripToggle.checked = dripEnabled;
            dripToggle.addEventListener('change', () => {
                dripEnabled = dripToggle.checked;
                if (ws && ws.readyState === WebSocket.OPEN && isServerAuthoritative) {
                    sendCommand({ type: 'set_drip', enabled: dripEnabled });
                }
                try {
                    localStorage.setItem(DRIP_STORAGE_KEY, dripEnabled);
                } catch (err) {
                    console.warn('Unable to store DRIP setting:', err);
                }
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startGame);
    } else {
        startGame();
    }
})();
