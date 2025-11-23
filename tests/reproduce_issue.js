const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
let WebSocket;
try {
    WebSocket = require('ws');
} catch (err) {
    WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));
}

const SERVER_READY_TIMEOUT_MS = 5000;

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getFreePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.listen(0, () => {
            const address = srv.address();
            const port = address && address.port;
            srv.close(() => resolve(port));
        });
        srv.on('error', reject);
    });
}

async function waitForHealth(baseUrl, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(`${baseUrl}/health`);
            if (res.ok) return true;
        } catch (err) { }
        await wait(200);
    }
    throw new Error('Health check timed out');
}

function connectClient(wsUrl, sessionId, playerId, role) {
    return new Promise((resolve, reject) => {
        const url = `${wsUrl}/ws?session=${encodeURIComponent(sessionId)}&player=${encodeURIComponent(playerId)}&role=${role}`;
        const ws = new WebSocket(url);
        const messages = [];
        ws.on('open', () => {
            resolve({ ws, messages });
        });
        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                messages.push(msg);
            } catch (err) { }
        });
        ws.on('error', reject);
    });
}

async function main() {
    const port = await getFreePort();
    const baseHttp = `http://127.0.0.1:${port}`;
    const baseWs = `ws://127.0.0.1:${port}`;
    const serverProc = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js')], {
        env: { ...process.env, PORT: port },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    try {
        await waitForHealth(baseHttp, SERVER_READY_TIMEOUT_MS);
        console.log('Server started');

        const sessionId = 'test_session';
        const clientA = await connectClient(baseWs, sessionId, 'Alice', 'host');
        console.log('Alice connected');
        clientA.ws.send(JSON.stringify({ type: 'start_game' }));

        // Wait a bit
        await wait(500);

        const clientB = await connectClient(baseWs, sessionId, 'Bob', 'guest');
        console.log('Bob connected');

        // Wait for ticks
        await wait(2000);

        // Check Alice's messages
        console.log('Alice messages:', JSON.stringify(clientA.messages, null, 2));
        const aliceTicks = clientA.messages.filter(m => m.type === 'tick');
        const lastAliceTick = aliceTicks[aliceTicks.length - 1];
        console.log('Alice last tick players:', lastAliceTick ? lastAliceTick.players.map(p => p.id) : 'None');

        // Check Bob's messages
        console.log('Bob messages:', JSON.stringify(clientB.messages, null, 2));
        const playersUpdate = clientB.messages.find(m => m.type === 'players_update' || m.type === 'snapshot');
        if (playersUpdate && playersUpdate.players) {
            const p = playersUpdate.players[0];
            console.log('Player 0 has name:', p.name);
            if (p.name) console.log('SUCCESS: Name field present');
            else console.log('FAILURE: Name field missing');
        } else {
            console.log('FAILURE: No player update received');
        }
        const bobTicks = clientB.messages.filter(m => m.type === 'tick');
        const lastBobTick = bobTicks[bobTicks.length - 1];
        console.log('Bob last tick players:', lastBobTick ? lastBobTick.players.map(p => p.id) : 'None');

        if (lastAliceTick && lastAliceTick.players.length === 2 && lastBobTick && lastBobTick.players.length === 2) {
            console.log('SUCCESS: Both clients see both players.');
        } else {
            console.log('FAILURE: Missing players.');
        }

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        serverProc.kill();
    }
}

main();
