/**
 * ResQMesh — PeerJS Signaling Server
 * Local: runs on LAN/hotspot (no internet needed)
 * Cloud: deploy on Render / Railway / Fly.io
 */
import { PeerServer } from 'peer';
import { networkInterfaces } from 'os';

// Render / Railway / Heroku inject PORT via env; fallback 9000 for local dev
const PORT = parseInt(process.env.PORT || '9000', 10);

const server = PeerServer({
    port: PORT,
    path: '/peerjs',
    allow_discovery: true,
    proxied: true,   // required when running behind a cloud reverse proxy
});

// Get all local IP addresses for display
function getLocalIPs() {
    const nets = networkInterfaces();
    const results = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                results.push({ iface: name, ip: net.address });
            }
        }
    }
    return results;
}

server.on('connection', (client) => {
    console.log(`[MESH] Node connected: ${client.getId()}`);
});

server.on('disconnect', (client) => {
    console.log(`[MESH] Node disconnected: ${client.getId()}`);
});

console.log('\n╔══════════════════════════════════════════════╗');
console.log('║       ResQMesh — LOCAL MESH SERVER           ║');
console.log('╠══════════════════════════════════════════════╣');
console.log(`║  PeerJS Signaling: http://localhost:${PORT}      ║`);
console.log('║  Share this IP with all field devices:       ║');
const ips = getLocalIPs();
if (ips.length === 0) {
    console.log('║  No network interfaces found (check WiFi)    ║');
} else {
    ips.forEach(({ iface, ip }) => {
        const line = `  [${iface}] ${ip}:${PORT}`;
        console.log(`║  ${line.padEnd(44)}║`);
    });
}
console.log('╠══════════════════════════════════════════════╣');
console.log('║  All devices on the SAME WiFi/hotspot can    ║');
console.log('║  now connect with ZERO internet access.      ║');
console.log('╚══════════════════════════════════════════════╝\n');
